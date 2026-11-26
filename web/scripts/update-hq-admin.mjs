#!/usr/bin/env node
/**
 * Rotate the CogniTara Cloud HQ super-admin email and/or password in Neon Postgres.
 * Uses the exact scrypt format verified by web/lib/auth.ts and revokes prior sessions.
 *
 * Usage (from repository root or web/):
 *   node web/scripts/update-hq-admin.mjs --email new-admin@example.com
 *   (You will be prompted interactively for the new password, or pass via HQ_NEW_PASSWORD env var.)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const envPath = path.join(WEB_DIR, ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error("DATABASE_URL not found in environment or web/.env.local");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1].trim() : "";
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  const sql = neon(loadDatabaseUrl());
  const email = (parseArg("--email") || (await ask("New HQ super-admin email: "))).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error("Please provide a valid email address.");
  }

  const password = process.env.HQ_NEW_PASSWORD || (await ask("New HQ super-admin password (min 8 chars): "));
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existingSuper = await sql`
    SELECT id, email FROM users_hq WHERE role = 'hq_super_admin' ORDER BY created_at ASC LIMIT 1
  `;
  if (!existingSuper.length) {
    throw new Error("No hq_super_admin row found in users_hq.");
  }

  const targetId = String(existingSuper[0].id);
  const conflict = await sql`
    SELECT id FROM users_hq WHERE LOWER(email) = ${email} AND id <> ${targetId}::uuid LIMIT 1
  `;
  if (conflict.length) {
    throw new Error(`Email ${email} is already assigned to another user account.`);
  }

  const pwHash = hashPassword(password);
  await sql`
    UPDATE users_hq
    SET email = ${email},
        password_hash = ${pwHash},
        email_verified = TRUE,
        status = 'active',
        updated_at = NOW()
    WHERE id = ${targetId}::uuid
  `;
  await sql`
    UPDATE cloud_sessions
    SET revoked_at = NOW()
    WHERE user_id = ${targetId}::uuid AND revoked_at IS NULL
  `;

  console.log(`Updated hq_super_admin (${targetId}) email to ${email} and rotated password hash.`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
