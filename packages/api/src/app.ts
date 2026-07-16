import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { assignDedupeHashes, parseCsv, parsePdf, type RawTransaction } from "@statement/parsers";
import type { FileType, StatementRepository } from "./repository.js";
import { validateBalanceChain } from "./validation.js";
import type { FinanceRepository } from "./finance.js";

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

export function buildApp(repository: StatementRepository, finance?: FinanceRepository) {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 4 } });

  app.post("/api/statements", async (request, reply) => {
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

    const statementId = await repository.createStatement({ accountId, sourceFilename: file.filename, fileType });
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
      return reply.code(202).send({ statementId, parseStatus: "completed", needsReview, reviewRowIndices, transactionCount: insertedCount, parserProfileUsed });
    } catch (error) {
      await repository.failStatement(statementId);
      request.log.error(error);
      return reply.code(422).send({ statementId, parseStatus: "failed", error: error instanceof Error ? error.message : "Statement parsing failed" });
    }
  });

  const userId = (headers: Record<string, unknown>) => {
    const value = headers["x-user-id"];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const unavailable = (reply: { code(status: number): { send(value: unknown): unknown } }) =>
    reply.code(503).send({ error: "finance repository is not configured" });

  app.get<{ Querystring: { period?: string } }>("/api/insights/monthly", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = userId(request.headers); if (!owner) return reply.code(401).send({ error: "x-user-id is required" });
    if (!request.query.period) return reply.code(400).send({ error: "period is required" });
    try {
      const cached = await finance.getInsight(owner, request.query.period);
      return cached ?? await finance.refreshInsight(owner, request.query.period);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.post<{ Querystring: { period?: string } }>("/api/insights/monthly/refresh", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = userId(request.headers); if (!owner) return reply.code(401).send({ error: "x-user-id is required" });
    if (!request.query.period) return reply.code(400).send({ error: "period is required" });
    try { return await finance.refreshInsight(owner, request.query.period); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.get<{ Querystring: { month?: string } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = userId(request.headers); if (!owner) return reply.code(401).send({ error: "x-user-id is required" });
    if (!request.query.month) return reply.code(400).send({ error: "month is required" });
    try { return { month: request.query.month, budgets: await finance.listBudgets(owner, request.query.month) }; }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.put<{ Body: { categoryId?: string; month?: string; targetAmountCents?: number } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = userId(request.headers); if (!owner) return reply.code(401).send({ error: "x-user-id is required" });
    const { categoryId, month, targetAmountCents } = request.body ?? {};
    if (!categoryId || !month || targetAmountCents === undefined) return reply.code(400).send({ error: "categoryId, month, and targetAmountCents are required" });
    try { return await finance.upsertBudget(owner, { categoryId, month, targetAmountCents }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });

  app.delete<{ Querystring: { categoryId?: string; month?: string } }>("/api/budgets", async (request, reply) => {
    if (!finance) return unavailable(reply);
    const owner = userId(request.headers); if (!owner) return reply.code(401).send({ error: "x-user-id is required" });
    const { categoryId, month } = request.query;
    if (!categoryId || !month) return reply.code(400).send({ error: "categoryId and month are required" });
    try {
      const deleted = await finance.deleteBudget(owner, categoryId, month);
      return deleted ? reply.code(204).send() : reply.code(404).send({ error: "budget not found" });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" }); }
  });
  return app;
}
