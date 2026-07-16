import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parsePdf } from "../dist/index.js";

const fixture = (name) => readFile(new URL(`./fixtures/pdf/${name}.pdf`, import.meta.url));

test("extracts Northstar rows by y clustering and profile x ranges", async () => {
  const result = await parsePdf(await fixture("northstar"), { sourceStatementId: "northstar" });
  assert.equal(result.profileId, "northstar"); assert.equal(result.extractionMethod, "digital"); assert.equal(result.needsReview, false);
  assert.deepEqual(result.transactions.map(({ date, description, amount }) => [date, description, amount]), [["2026-06-16", "Corner Market", -42.5], ["2026-06-17", "Salary", 1200]]);
});

test("supports a second bank layout with swapped credit/debit positions", async () => {
  const result = await parsePdf(await fixture("harbor"), { sourceStatementId: "harbor" });
  assert.equal(result.profileId, "harbor");
  assert.deepEqual(result.transactions.map(({ amount }) => amount), [-18.25, 30]);
});

test("unknown bank uses header-position generic fallback", async () => {
  const result = await parsePdf(await fixture("generic"), { sourceStatementId: "generic" });
  assert.equal(result.profileId, "generic"); assert.deepEqual(result.transactions.map(({ amount }) => amount), [-5.75, 250]);
});

test("image-only PDF invokes OCR and lowers confidence/needs-review", async () => {
  const words = [
    ["Northstar", 35, 40], ["Bank", 105, 40], ["Date", 40, 110], ["Description", 120, 110], ["Debit", 345, 110], ["Credit", 420, 110], ["Balance", 500, 110],
    ["22/06/2026", 40, 140], ["Scanned Grocery", 120, 140], ["12.40", 345, 140], ["987.60", 500, 140],
  ].map(([text, x, y]) => ({ text, confidence: 72, bbox: { x0: x, y0: y, x1: x + String(text).length * 6, y1: y + 10 } }));
  const result = await parsePdf(await fixture("scanned"), { sourceStatementId: "scan", ocr: async () => [{ page: 1, width: 612, height: 792, words }] });
  assert.equal(result.extractionMethod, "ocr"); assert.equal(result.needsReview, true); assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].confidence, .72); assert.equal(result.transactions[0].extractionMethod, "ocr"); assert.equal(result.transactions[0].amount, -12.4);
});
