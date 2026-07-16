import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_BYTES = 32;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 200) throw new Error("Password must be between 12 and 200 characters");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_BYTES) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type Envelope = { v: 1; alg: "A256GCM"; iv: string; tag: string; ciphertext: string };

export function parseEncryptionKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (base64 or 64 hex characters)");
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const envelope: Envelope = { v: 1, alg: "A256GCM", iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
  return JSON.stringify(envelope);
}

export function decryptSecret(encoded: string, key: Buffer): string {
  const envelope = JSON.parse(encoded) as Envelope;
  if (envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error("Unsupported encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
