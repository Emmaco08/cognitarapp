import { getSql } from "./db";

let ensuredOnce = false;

/**
 * Idempotently guarantees that the extended onboarding & school profile columns
 * exist on the Neon Postgres `schools` table so Desktop Studio onboarding and
 * post-onboarding school profile/logo edits sync cleanly to CogniTara HQ.
 */
export async function ensureSchoolProfileColumns(sqlArg?: ReturnType<typeof getSql>): Promise<void> {
  if (ensuredOnce) return;
  const sql = sqlArg || getSql();
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_motto TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS academic_session TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS current_term TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_data_url TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS admin_full_name TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS admin_username TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_lan_ip TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_machine_hostname TEXT DEFAULT ''`;
  await sql`ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_os_version TEXT DEFAULT ''`;
  ensuredOnce = true;
}
