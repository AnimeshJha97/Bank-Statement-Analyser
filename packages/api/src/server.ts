import { createDatabase, parseEncryptionKey } from "@statement/core";
import { buildApp } from "./app.js";
import { createDrizzleStatementRepository } from "./repository.js";
import { createDrizzleFinanceRepository } from "./finance.js";
import { createDrizzleDashboardRepository } from "./dashboard.js";
import { createDrizzleStatementCategorizer } from "./categorization.js";
import { AuthService } from "./auth.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const { client, db } = createDatabase(databaseUrl);
const openaiApiKey = process.env.OPENAI_API_KEY || undefined;
const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) throw new Error("ENCRYPTION_KEY is required");
const auth = new AuthService(db, parseEncryptionKey(encryptionKey));

const app = buildApp(
  createDrizzleStatementRepository(db),
  createDrizzleFinanceRepository(db),
  createDrizzleDashboardRepository(db, { openaiApiKey }),
  createDrizzleStatementCategorizer(db, { openaiApiKey, openaiApiKeyForUser: (userId) => auth.getOpenAIKey(userId) }),
  auth,
);

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "127.0.0.1";

const shutdown = async () => {
  await app.close();
  await client.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host });
console.log(`Statement API listening on http://${host}:${port}`);
