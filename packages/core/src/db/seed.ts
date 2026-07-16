import "../configure-env.js";
import { createDatabase } from "./client.js";
import { categories } from "./schema.js";
import { defaultCategoryTaxonomy } from "./taxonomy.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const { client, db } = createDatabase(databaseUrl);

try {
  await db.insert(categories).values([...defaultCategoryTaxonomy]).onConflictDoNothing();
} finally {
  await client.end();
}
