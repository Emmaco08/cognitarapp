import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(raw: string): Buffer {
  const clean = String(raw || "")
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a cryptographically random 160-bit Base32 TOTP secret (RFC 6238). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function buildTotpUri(params: { secret: string; email: string; issuer?: string }): string {
  const issuer = params.issuer || "CogniTara HQ";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(params.email)}`;
  return `otpauth://totp/${label}?secret=${encodeURIComponent(params.secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function generateHotp(secretBuf: Buffer, counter: bigint): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter, 0);
  const hmac = crypto.createHmac("sha1", secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Verify a 6-digit RFC 6238 TOTP code with ±1 window (30s) clock-skew tolerance. */
export function verifyTotpCode(secretBase32: string, rawCode: string, nowMs = Date.now()): boolean {
  const clean = String(rawCode || "").replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBuf = base32Decode(secretBase32);
  if (secretBuf.length < 10) return false;

  const step = BigInt(Math.floor(nowMs / 1000 / 30));
  const actualBuf = Buffer.from(clean, "utf8");
  for (const delta of [-1n, 0n, 1n]) {
    const candidate = generateHotp(secretBuf, step + delta);
    const candBuf = Buffer.from(candidate, "utf8");
    if (candBuf.length === actualBuf.length && crypto.timingSafeEqual(candBuf, actualBuf)) {
      return true;
    }
  }
  return false;
}

/** Generate 8 human-readable single-use recovery codes and their salted SHA-256 hashes. */
export function generateRecoveryCodes(): { plainCodes: string[]; hashedCodes: string[] } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const bytes = crypto.randomBytes(8);
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += alphabet[bytes[j] % alphabet.length];
    }
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    plainCodes.push(formatted);
    const salt = crypto.randomBytes(12).toString("hex");
    const digest = crypto.createHash("sha256").update(`${salt}:${formatted}`).digest("hex");
    hashedCodes.push(`${salt}:${digest}`);
  }
  return { plainCodes, hashedCodes };
}

/** Verify and consume a single-use recovery code. Returns remaining hashes if matched, or null. */
export function consumeRecoveryCode(rawInput: string, storedHashes: string[]): string[] | null {
  const normalized = String(rawInput || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 8) return null;
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;

  for (let i = 0; i < storedHashes.length; i++) {
    const [salt, expected] = String(storedHashes[i] || "").split(":");
    if (!salt || !expected) continue;
    const actual = crypto.createHash("sha256").update(`${salt}:${formatted}`).digest("hex");
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const remaining = storedHashes.slice();
      remaining.splice(i, 1);
      return remaining;
    }
  }
  return null;
}
