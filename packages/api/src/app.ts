import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { assignDedupeHashes, parseCsv, parsePdf, type RawTransaction } from "@statement/parsers";
import type { FileType, StatementRepository } from "./repository.js";
import { validateBalanceChain } from "./validation.js";

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

export function buildApp(repository: StatementRepository) {
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
  return app;
}
