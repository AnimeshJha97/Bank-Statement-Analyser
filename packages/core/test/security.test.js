import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, hashPassword, hashSessionToken, parseEncryptionKey, verifyPassword } from "../dist/index.js";

test("AES-256-GCM secrets round-trip and reject tampering", () => {
  const key = parseEncryptionKey(Buffer.alloc(32, 7).toString("base64"));
  const encrypted = encryptSecret("sk-example-secret-value-123456", key);
  assert.equal(decryptSecret(encrypted, key), "sk-example-secret-value-123456");
  assert.equal(encrypted.includes("sk-example"), false);
  const envelope = JSON.parse(encrypted);
  envelope.ciphertext = `${envelope.ciphertext.slice(0, -1)}A`;
  assert.throws(() => decryptSecret(JSON.stringify(envelope), key));
});

test("password and session token storage use one-way hashes", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(hashSessionToken("session-token"), hashSessionToken("session-token"));
  assert.notEqual(hashSessionToken("session-token"), "session-token");
});
