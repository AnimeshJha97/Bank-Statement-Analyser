import { normalizeDescription, type TransactionWithDedupeHash } from "@statement/parsers";
import { createDatabase, statements, transactions } from "@statement/core";
import { eq } from "drizzle-orm";

export type FileType = "csv" | "pdf";
export type NewStatement = { accountId: string; sourceFilename: string; fileType: FileType };
export type CompleteStatement = {
  statementId: string;
  accountId: string;
  parserProfileUsed: string;
  needsReview: boolean;
  reviewRowIndices: number[];
  transactions: TransactionWithDedupeHash[];
};

export interface StatementRepository {
  createStatement(input: NewStatement): Promise<string>;
  completeStatement(input: CompleteStatement): Promise<number>;
  failStatement(statementId: string): Promise<void>;
}

type StatementDatabase = ReturnType<typeof createDatabase>["db"];

export function createDrizzleStatementRepository(db: StatementDatabase): StatementRepository {
  return {
    async createStatement(input) {
      const [created] = await db.insert(statements).values({ ...input, parseStatus: "processing" }).returning({ id: statements.id });
      if (!created) throw new Error("Failed to create statement");
      return created.id;
    },
    async completeStatement(input) {
      return db.transaction(async (tx) => {
        const rows = input.transactions.map((transaction) => ({
          accountId: input.accountId,
          statementId: input.statementId,
          date: transaction.date,
          rawDescription: transaction.description,
          merchantNormalized: normalizeDescription(transaction.description),
          amount: BigInt(Math.round(transaction.amount * 100)),
          balanceAfter: transaction.balanceAfter === undefined ? null : BigInt(Math.round(transaction.balanceAfter * 100)),
          sourceRowIndex: transaction.sourceRowIndex,
          dedupeHash: transaction.dedupeHash,
        }));
        const inserted = rows.length
          ? await tx.insert(transactions).values(rows).onConflictDoNothing({ target: [transactions.accountId, transactions.dedupeHash] }).returning({ id: transactions.id })
          : [];
        await tx.update(statements).set({
          parseStatus: "completed",
          parserProfileUsed: input.parserProfileUsed,
          needsReview: input.needsReview,
          reviewRowIndices: input.reviewRowIndices,
        }).where(eq(statements.id, input.statementId));
        return inserted.length;
      });
    },
    async failStatement(statementId) {
      await db.update(statements).set({ parseStatus: "failed" }).where(eq(statements.id, statementId));
    },
  };
}
