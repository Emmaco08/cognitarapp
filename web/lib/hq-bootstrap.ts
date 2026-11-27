import { getSql } from "./db";
import { hashPassword, isValidEmail, normalizeEmail, verifyPassword } from "./auth";

/**
 * Optionally synchronizes the primary `hq_super_admin` record from deployment
 * environment variables (`HQ_SUPER_ADMIN_EMAIL` and/or `HQ_SUPER_ADMIN_PASSWORD`).
 *
 * Fast-paths immediately when neither environment variable is configured.
 * Allows project owners to rotate HQ admin credentials directly from Vercel
 * Project Settings -> Environment Variables without direct SQL access.
 */
export async function syncEnvSuperAdminIfConfigured(): Promise<void> {
  const rawEmail = (process.env.HQ_SUPER_ADMIN_EMAIL || "").trim();
  const rawPassword = (process.env.HQ_SUPER_ADMIN_PASSWORD || "").trim();
  if (!rawEmail && !rawPassword) return;

  const targetEmail = rawEmail ? normalizeEmail(rawEmail) : "";
  if (targetEmail && !isValidEmail(targetEmail)) return;
  if (rawPassword && rawPassword.length < 8) return;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, password_hash, status, email_verified
      FROM users_hq
      WHERE role = 'hq_super_admin'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (!rows.length) return;

    const current = rows[0] as Record<string, any>;
    const currentId = String(current.id);
    const currentEmail = normalizeEmail(String(current.email || ""));
    const currentHash = String(current.password_hash || "");

    const needsEmailUpdate = Boolean(targetEmail && targetEmail !== currentEmail);
    const needsPasswordUpdate = Boolean(rawPassword && !verifyPassword(rawPassword, currentHash));
    const needsActiveUpdate = current.status !== "active" || !current.email_verified;

    if (!needsEmailUpdate && !needsPasswordUpdate && !needsActiveUpdate) return;

    if (needsEmailUpdate) {
      const conflict = await sql`
        SELECT id FROM users_hq WHERE LOWER(email) = ${targetEmail} AND id <> ${currentId}::uuid LIMIT 1
      `;
      if (conflict.length) return;
    }

    const nextEmail = needsEmailUpdate ? targetEmail : currentEmail;
    const nextHash = needsPasswordUpdate ? hashPassword(rawPassword) : currentHash;

    await sql`
      UPDATE users_hq
      SET email = ${nextEmail},
          password_hash = ${nextHash},
          email_verified = TRUE,
          status = 'active',
          updated_at = NOW()
      WHERE id = ${currentId}::uuid
    `;

    if (needsEmailUpdate || needsPasswordUpdate) {
      await sql`
        UPDATE cloud_sessions
        SET revoked_at = NOW()
        WHERE user_id = ${currentId}::uuid AND revoked_at IS NULL
      `;
    }
  } catch (err) {
    console.error("HQ super-admin env sync warning:", err);
  }
}
