import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assignDedupeHashes,
  createDedupeHash,
  decodeCsv,
  inferDateOrder,
  matchHeaders,
  normalizeDescription,
  parseCsv,
} from "../dist/index.js";

const fixtureUrl = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const fixture = (name) => readFile(fixtureUrl(name));

const cases = [
  ["comma-signed-dmy.csv", { delimiter: ",", order: "DMY", amounts: [-4.5, 2000], firstDate: "2026-01-11" }],
  ["semicolon-split-dmy.csv", { delimiter: ";", order: "DMY", amounts: [-80.25, 25], firstDate: "2026-02-05" }],
  ["comma-signed-mdy.csv", { delimiter: ",", order: "MDY", amounts: [-19.99, 1.25], firstDate: "2026-01-11" }],
  ["tab-split-ymd.csv", { delimiter: "\t", order: "YMD", amounts: [-750, 300], firstDate: "2026-03-02" }],
  ["quoted-preamble.csv", { delimiter: ",", order: "DMY", amounts: [-1234.56, 2000], firstDate: "2026-04-13" }],
];

for (const [name, expected] of cases) {
  test(`parses fixture ${name}`, async () => {
    const result = parseCsv(await fixture(name), { sourceStatementId: name });
    assert.equal(result.delimiter, expected.delimiter);
    assert.equal(result.dateOrder, expected.order);
    assert.equal(result.transactions[0].date, expected.firstDate);
    assert.deepEqual(result.transactions.map(({ amount }) => amount), expected.amounts);
    assert.deepEqual(result.transactions.map(({ sourceStatementId }) => sourceStatementId), [name, name]);
  });
}

test("range-scans all dates instead of choosing from the first ambiguous row", async () => {
  const result = parseCsv(await fixture("ambiguous-range.csv"), { sourceStatementId: "range" });
  assert.equal(result.dateOrder, "MDY");
  assert.deepEqual(result.transactions.map(({ date }) => date), ["2026-01-02", "2026-02-03", "2026-03-13"]);
  assert.equal(inferDateOrder(["01/02/2026", "25/02/2026"]), "DMY");
});

test("scored synonym matcher maps different bank headings", () => {
  assert.deepEqual(matchHeaders(["Txn Date", "Narrative", "Debit Amount", "Paid In", "Running Balance"]), {
    date: 0, description: 1, debit: 2, credit: 3, balance: 4,
  });
});

test("decodes UTF-16LE BOM input", () => {
  const body = Buffer.from("Date,Description,Amount\n23/01/2026,Café,-2.00\n", "utf16le");
  const input = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  const decoded = decodeCsv(input);
  assert.equal(decoded.encoding, "utf-16le");
  assert.match(decoded.text, /Café/);
  assert.equal(parseCsv(input, { sourceStatementId: "utf16" }).transactions[0].amount, -2);
});

test("normalizes descriptions and gives genuine duplicate ties ordinal suffixes", () => {
  assert.equal(normalizeDescription("  COFFEE—SHOP!! "), "coffee shop");
  const base = { date: "2026-01-01", amount: -5, description: "Coffee Shop", sourceStatementId: "s", sourceRowIndex: 1 };
  const sameIdentity = { ...base, description: "coffee--shop", sourceRowIndex: 2 };
  assert.equal(createDedupeHash("acct", base), createDedupeHash("acct", sameIdentity));
  const hashed = assignDedupeHashes("acct", [base, sameIdentity]);
  assert.match(hashed[0].dedupeHash, /^[a-f0-9]{64}$/);
  assert.equal(hashed[1].dedupeHash, `${hashed[0].dedupeHash}:2`);
});

test("reports contradictory date evidence", () => {
  assert.throws(() => inferDateOrder(["13/01/2026", "01/13/2026"]), /conflicting/);
});
