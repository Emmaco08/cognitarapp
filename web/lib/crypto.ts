import crypto from "node:crypto";

const DEFAULT_KEY_ID = "ct-ed25519-2026-01";

/**
 * Deterministic canonical JSON identical to Python `canonical_json_bytes`
 * and Electron `license-bridge.ts` `canonicalize()`.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeJson).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalizeJson(v)).join(",") + "}";
}

function getEncryptionKeyBuffer(): Buffer {
  const hex = process.env.COGNITARA_ENCRYPTION_KEY || "";
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  const fallback = process.env.COGNITARA_AUTH_SECRET || "cognitara-fallback-enc-key";
  return crypto.createHash("sha256").update(`ct-aes256:${fallback}`).digest();
}

/** AES-256-GCM authenticated encryption for sensitive credentials (e.g. Paystack Secret Key). */
export function encryptSecret(plaintext: string): string {
  const clean = String(plaintext || "").trim();
  if (!clean) return "";
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `encv1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  const raw = String(stored).trim();
  if (!raw.startsWith("encv1:")) return "";
  const parts = raw.split(":");
  if (parts.length !== 4) return "";
  try {
    const key = getEncryptionKeyBuffer();
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecretKey(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 10) return "••••••••";
  return `${secret.slice(0, 7)}••••••••••••${secret.slice(-4)}`;
}

function loadEd25519PrivateKey(): crypto.KeyObject {
  const b64 = (process.env.COGNITARA_ED25519_PRIVATE_KEY_B64 || "").trim();
  if (!b64) {
    throw new Error("COGNITARA_ED25519_PRIVATE_KEY_B64 is not configured on this server.");
  }
  const der = Buffer.from(b64, "base64");
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

export function getEd25519PublicKeyB64Url(): string {
  const priv = loadEd25519PrivateKey();
  const pub = crypto.createPublicKey(priv);
  const spki = pub.export({ format: "der", type: "spki" });
  return spki.subarray(spki.length - 32).toString("base64url");
}

export function signEd25519Canonical(payload: Record<string, unknown>): string {
  const priv = loadEd25519PrivateKey();
  const msg = Buffer.from(canonicalizeJson(payload), "utf8");
  const sig = crypto.sign(null, msg, priv);
  return sig.toString("base64url");
}

export function generateLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  const chars: string[] = [];
  for (let i = 0; i < 16; i++) {
    chars.push(alphabet[bytes[i] % alphabet.length]);
  }
  return `CGNT-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}`;
}

export function signLicenseLease(params: {
  licenseId: string;
  licenseKey: string;
  schoolName: string;
  planTier: string;
  planSlug: string;
  planName: string;
  hwidHash: string;
  hwComponentHashes?: Record<string, string> | null;
  issuedAtIso: string;
  expiresAtIso: string | null;
  paidDurationSeconds: number | null;
  leaseSeconds: number;
}): { payload: Record<string, unknown>; ed25519_sig: string } {
  const normalizedTier = ["monthly", "termly", "annual", "lifetime", "custom"].includes(params.planTier)
    ? params.planTier
    : "annual";

  const payload: Record<string, unknown> = {
    schema_version: 2,
    key_id: DEFAULT_KEY_ID,
    license_id: params.licenseId,
    license_key: params.licenseKey,
    school_name: params.schoolName,
    plan_tier: normalizedTier,
    plan_slug: params.planSlug,
    plan_name: params.planName,
    hwid_hash: params.hwidHash,
    issued_at: params.issuedAtIso,
    expires_at: params.expiresAtIso,
    paid_duration_seconds: params.paidDurationSeconds,
    lease_seconds: params.leaseSeconds,
  };
  if (params.hwComponentHashes && Object.keys(params.hwComponentHashes).length > 0) {
    payload.hw_component_hashes = params.hwComponentHashes;
  }
  const ed25519_sig = signEd25519Canonical(payload);
  return { payload, ed25519_sig };
}

export function signRevocationTombstone(params: {
  licenseId: string;
  reasonCode: string;
  reasonDetail: string;
}): { status: "REVOKED"; tombstone: Record<string, unknown>; ed25519_sig: string } {
  const tombstone: Record<string, unknown> = {
    schema_version: 2,
    key_id: DEFAULT_KEY_ID,
    tombstone_id: `TOMB-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
    license_id: params.licenseId,
    reason_code: params.reasonCode,
    reason_detail: params.reasonDetail,
    revoked_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  const ed25519_sig = signEd25519Canonical(tombstone);
  return { status: "REVOKED", tombstone, ed25519_sig };
}

export function verifyPaystackWebhookSignature(rawBody: string, signatureHeader: string, secretKey: string): boolean {
  if (!rawBody || !signatureHeader || !secretKey) return false;
  try {
    const expected = crypto.createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
