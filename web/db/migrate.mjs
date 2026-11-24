import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("ERROR: DATABASE_URL or DATABASE_URL_DIRECT must be set.");
  process.exit(1);
}

const sql = neon(dbUrl);
const rawSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

// Split SQL into individual top-level statements safely (no plpgsql blocks in schema.sql)
const statements = rawSql
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) =>
    s
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter(Boolean);

async function run() {
  console.log(`Applying ${statements.length} DDL statements to Neon Postgres...`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    await sql(stmt);
  }
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log(`Migration complete! Verified ${tables.length} tables:`);
  for (const row of tables) {
    console.log(`  - ${row.table_name}`);
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
