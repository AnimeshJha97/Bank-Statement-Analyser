import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { assignDedupeHashes, parseCsv, parsePdf, type RawTransaction } from "@statement/parsers";
import type { FileType, StatementRepository } from "./repository.js";
import { validateBalanceChain } from "./validation.js";
import type { FinanceRepository } from "./finance.js";
import type { DashboardRepository } from "./dashboard.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import type { StatementCategorizer } from "./categorization.js";
import { registerAuthRoutes, type AuthService } from "./auth.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function detectStatementType(filename: string, bytes: Uint8Array): FileType {
  const extension = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  const isPdf = bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  if (isPdf) {
    if (extension && extension !== "pdf") throw new Error("File extension does not match PDF content");
    return "pdf";
  }
  if (extension === "pdf") throw new Error("Invalid PDF file signature");
  if (extension === "csv" || extension === "txt") return "csv";
  throw new Error("Unsupported statement format; upload a CSV or PDF file");
}

export function buildApp(
  repository: StatementRepository,
  finance?: FinanceRepository,
  dashboard?: DashboardRepository,
  categorizer?: StatementCategorizer,
  auth?: AuthService,
) {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 4 } });
  if (auth) registerAuthRoutes(app, auth);

  const resolveUser = async (request: Parameters<AuthService["authenticate"]>[0]) => {
    if (auth) return (await auth.authenticate(request))?.userId ?? null;
    const value = request.headers["x-user-id"];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  app.post("/api/statements", async (request, reply) => {
    const authenticatedUserId = await resolveUser(request);
    if (auth && !authenticatedUserId) return reply.code(401).send({ error: "Authentication required" });
    let file: { filename: string; bytes: Buffer } | undefined;
    let accountId: string | undefined;
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "file") { await part.toBuffer(); continue; }
          file = { filename: part.filename, bytes: await part.toBuffer() };
        } else if (part.fieldname === "accountId") accountId = part.value as string;
      }
    } catch (error) {
      return reply.code(413).send({ error: error instanceof Error ? error.message : "Upload failed" });
    }
    if (!file || !accountId?.trim()) return reply.code(400).send({ error: "file and accountId are required" });

    let fileType: FileType;
    try { fileType = detectStatementType(file.filename, file.bytes); }
    catch (error) { return reply.code(415).send({ error: error instanceof Error ? error.message : "Unsupported file" }); }

    const statementId = await repository.createStatement({ userId: authenticatedUserId ?? "", accountId, sourceFilename: file.filename, fileType });
    try {
      let parsedTransactions: RawTransaction[];
      let parserProfileUsed: string;
      let parserNeedsReview = false;
      if (fileType === "pdf") {
        const parsed = await parsePdf(file.bytes, { sourceStatementId: statementId });
        parsedTransactions = parsed.transactions;
        parserProfileUsed = parsed.profileId;
        parserNeedsReview = parsed.needsReview;
      } else {
        const parsed = parseCsv(file.bytes, { sourceStatementId: statementId });
        parsedTransactions = parsed.transactions;
        parserProfileUsed = `csv:${parsed.encoding}:${parsed.delimiter === "\t" ? "tab" : parsed.delimiter}`;
      }
      if (!parsedTransactions.length) throw new Error("No transactions could be parsed from the statement");
      const reviewRowIndices = validateBalanceChain(parsedTransactions);
      const needsReview = parserNeedsReview || reviewRowIndices.length > 0;
      const insertedCount = await repository.completeStatement({
        statementId, accountId, parserProfileUsed, needsReview, reviewRowIndices,
        transactions: assignDedupeHashes(accountId, parsedTransactions),
      });
      let categorizedCount = 0;
      if (categorizer) {
        // Best-effort: a categorization failure must not fail an already-persisted ingest.
        try { categorizedCount = await categorizer.categorizeStatement(accountId, statementId); }
        catch (error) { request.log.error(error); }
      }
      return reply.code(202).send({ statementId, parseStatus: "completed", needsReview, reviewRowIndices, transactionCount: insertedCount, categorizedCount, parserProfileUsed });
    } catch (error) {
      await repository.failStatement(statementId);
      request.log.error(error);
      return reply.code(422).send({ statementId, parseStatus: "failed", error: error instanceof Error ? error.message : "Statement parsing failed" });
    }
  });

  const unavailable = (reply: { code(status: number): { send(value: unknown): unknown } }) =>
    reply.code(503).send({ error: "finance repository is not configured" });

  app.get<{ Querystring: { period?: string } }>("/api/insights/monthly", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = await resolveUser(request); if (!owner) return reply.code(401).send({ error: "Authentication required" });
    if (!request.query.period) return reply.code(400).send({ error: "period is required" });
    try {
      const cached = await finance.getInsight(owner, request.query.period);
      return cached ?? await finance.refreshInsight(owner, request.query.period);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.post<{ Querystring: { period?: string } }>("/api/insights/monthly/refresh", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = await resolveUser(request); if (!owner) return reply.code(401).send({ error: "Authentication required" });
    if (!request.query.period) return reply.code(400).send({ error: "period is required" });
    try { return await finance.refreshInsight(owner, request.query.period); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.get<{ Querystring: { month?: string } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = await resolveUser(request); if (!owner) return reply.code(401).send({ error: "Authentication required" });
    if (!request.query.month) return reply.code(400).send({ error: "month is required" });
    try { return { month: request.query.month, budgets: await finance.listBudgets(owner, request.query.month) }; }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.put<{ Body: { categoryId?: string; month?: string; targetAmountCents?: number } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = await resolveUser(request); if (!owner) return reply.code(401).send({ error: "Authentication required" });
    const { categoryId, month, targetAmountCents } = request.body ?? {};
    if (!categoryId || !month || targetAmountCents === undefined) return reply.code(400).send({ error: "categoryId, month, and targetAmountCents are required" });
    try { return await finance.upsertBudget(owner, { categoryId, month, targetAmountCents }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.delete<{ Querystring: { categoryId?: string; month?: string } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = await resolveUser(request); if (!owner) return reply.code(401).send({ error: "Authentication required" });
    const { categoryId, month } = request.query;
    if (!categoryId || !month) return reply.code(400).send({ error: "categoryId and month are required" });
    try {
      const deleted = await finance.deleteBudget(owner, categoryId, month);
      return deleted ? reply.code(204).send() : reply.code(404).send({ error: "budget not found" });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  if (dashboard) registerDashboardRoutes(app, dashboard, resolveUser, !auth);
  return app;
}
