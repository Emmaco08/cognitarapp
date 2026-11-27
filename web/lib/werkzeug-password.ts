import crypto from "node:crypto";

const SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomWerkzeugSalt(length = 16): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SALT_CHARS[bytes[i] % SALT_CHARS.length];
  }
  return out;
}

/**
 * Generates a Werkzeug 3.x compatible scrypt password hash:
 * `scrypt:32768:8:1$<salt>$<64-byte hex>`
 * Verifies seamlessly in both Node.js (online portal) and Python Werkzeug (offline desktop app).
 */
export function hashWerkzeugPassword(password: string): string {
  const n = 32768;
  const r = 8;
  const p = 1;
  const salt = randomWerkzeugSalt(16);
  const derived = crypto
    .scryptSync(password, salt, 64, {
      N: n,
      r,
      p,
      maxmem: 128 * n * r * 2,
    })
    .toString("hex");
  return `scrypt:${n}:${r}:${p}$${salt}$${derived}`;
}

/**
 * Verifies an input password against any stored password from CogniTara's offline SQLite `exam.db`:
 * - Werkzeug 3.x scrypt: `scrypt:N:r:p$salt$hex`
 * - Werkzeug 2.x/3.x pbkdf2: `pbkdf2:sha256:iterations$salt$hex` (or sha512/sha1)
 * - Legacy plaintext fallback (constant-time comparison, matching cognitara/security/passwords.py)
 */
export function verifyWerkzeugPassword(inputPassword: string, storedHash: string): boolean {
  if (!storedHash || inputPassword === null || inputPassword === undefined) return false;
  const stored = String(storedHash);
  const input = String(inputPassword);

  if (stored.startsWith("scrypt:")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [methodSpec, salt, expectedHex] = parts;
    const specParts = methodSpec.split(":");
    const n = Number(specParts[1] || 32768);
    const r = Number(specParts[2] || 8);
    const p = Number(specParts[3] || 1);
    if (!salt || !expectedHex || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false;
    }
    try {
      const expected = Buffer.from(expectedHex, "hex");
      if (!expected.length) return false;
      const derived = crypto.scryptSync(input, salt, expected.length, {
        N: n,
        r,
        p,
        maxmem: Math.max(64 * 1024 * 1024, 128 * n * r * 2),
      });
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [methodSpec, salt, expectedHex] = parts;
    const specParts = methodSpec.split(":");
    const digest = (specParts[1] || "sha256").toLowerCase();
    const iterations = Number(specParts[2] || 600000);
    if (!salt || !expectedHex || !Number.isFinite(iterations) || iterations <= 0) {
      return false;
    }
    try {
      const expected = Buffer.from(expectedHex, "hex");
      if (!expected.length) return false;
      const derived = crypto.pbkdf2Sync(input, salt, iterations, expected.length, digest);
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  // Legacy plaintext compatibility (same behavior as cognitara/security/passwords.py)
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(input, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
