import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildApp } from "../dist/index.js";

class MemoryRepository {
  statements = new Map();
  hashes = new Set();
  nextId = 1;
  async createStatement(input) {
    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
    this.statements.set(id, { ...input, id, parseStatus: "processing", transactions: [] });
    return id;
  }
  async completeStatement(input) {
    const statement = this.statements.get(input.statementId);
    let inserted = 0;
    for (const transaction of input.transactions) {
      const key = `${input.accountId}:${transaction.dedupeHash}`;
      if (this.hashes.has(key)) continue;
      this.hashes.add(key); statement.transactions.push(transaction); inserted++;
    }
    Object.assign(statement, input, { parseStatus: "completed" });
    return inserted;
  }
  async failStatement(id) { this.statements.get(id).parseStatus = "failed"; }
}

function multipart(accountId, filename, contents) {
  const boundary = "statement-test-boundary";
  const chunks = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="accountId"\r\n\r\n${accountId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    Buffer.from(contents),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const accountId = "10000000-0000-4000-8000-000000000001";

test("uploads a clean CSV and persists deduped transactions", async () => {
  const repository = new MemoryRepository(); const app = buildApp(repository);
  const csv = "Date,Description,Amount,Balance\n2026-06-01,Opening deposit,100.00,1000.00\n2026-06-02,Groceries,-25.50,974.50\n2026-06-03,Refund,5.50,980.00\n";
  const response = await app.inject({ method: "POST", url: "/api/statements", ...multipart(accountId, "clean.csv", csv) });
  assert.equal(response.statusCode, 202);
  const body = response.json(); assert.equal(body.needsReview, false); assert.equal(body.transactionCount, 3);
  const saved = repository.statements.get(body.statementId); assert.equal(saved.transactions.length, 3); assert.equal(saved.transactions[1].amount, -25.5);
  const duplicate = await app.inject({ method: "POST", url: "/api/statements", ...multipart(accountId, "clean.csv", csv) });
  assert.equal(duplicate.json().transactionCount, 0);
  await app.close();
});

test("uploads a clean digital PDF through the PDF parser", async () => {
  const repository = new MemoryRepository(); const app = buildApp(repository);
  const pdf = await readFile(new URL("../../parsers/test/fixtures/pdf/northstar.pdf", import.meta.url));
  const response = await app.inject({ method: "POST", url: "/api/statements", ...multipart(accountId, "northstar.pdf", pdf) });
  assert.equal(response.statusCode, 202);
  const body = response.json(); assert.equal(body.parserProfileUsed, "northstar"); assert.equal(body.needsReview, false); assert.equal(body.transactionCount, 2);
  await app.close();
});

test("flags a corrupted balance chain and records the source row index", async () => {
  const repository = new MemoryRepository(); const app = buildApp(repository);
  const csv = "Date,Description,Amount,Balance\n2026-06-01,Opening deposit,100.00,1000.00\n2026-06-02,Groceries,-25.50,999.99\n2026-06-03,Refund,5.50,1005.49\n";
  const response = await app.inject({ method: "POST", url: "/api/statements", ...multipart(accountId, "corrupted.csv", csv) });
  assert.equal(response.statusCode, 202);
  const body = response.json(); assert.equal(body.needsReview, true); assert.deepEqual(body.reviewRowIndices, [2]);
  const saved = repository.statements.get(body.statementId); assert.deepEqual(saved.reviewRowIndices, [2]); assert.equal(saved.transactions.length, 3);
  await app.close();
});
