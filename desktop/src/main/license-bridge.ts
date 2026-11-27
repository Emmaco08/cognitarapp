/**
 * CogniTara v2: Layer 5 Electron-Side Independent Ed25519 License Bridge
 *
 * Performs independent Ed25519 signature verification in the Electron main
 * process (using Node's native `crypto.verify`) so tampering with only the
 * renderer or only the Python engine cannot unlock server startup.
 *
 * Production hardening: In packaged builds (`app.isPackaged`), the pinned
 * Ed25519 public key CANNOT be overridden via environment variables.
 */

import crypto from "crypto";
import { LicenseStatus } from "./types";

// Matches cognitara/security/license_guard.py DEFAULT_ED25519_PUBLIC_KEY_B64
const DEFAULT_ED25519_PUBLIC_KEY_B64 = "cUDQSjHQMeXyWg3Ydptk-APs7Pd_lEyIp_XqBErD00g";

// ASN.1 DER SPKI prefix for raw 32-byte Ed25519 public key (RFC 8410)
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function isElectronPackaged(): boolean {
  if (!process.versions || !process.versions.electron) {
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    return Boolean(electron && electron.app && electron.app.isPackaged);
  } catch {
    return true;
  }
}

function b64urlDecode(input: string): Buffer {
  const cleaned = String(input || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = cleaned.length % 4 === 0 ? "" : "=".repeat(4 - (cleaned.length % 4));
  return Buffer.from(cleaned + pad, "base64");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v)).join(",") + "}";
}

export function verifyEd25519LeaseInElectron(
  leaseEnvelope: Record<string, unknown>,
  overridePubKeyB64?: string
): { ok: boolean; reason: string } {
  if (!leaseEnvelope || typeof leaseEnvelope !== "object") {
    return { ok: false, reason: "invalid_lease_format" };
  }
  const payload = leaseEnvelope.payload;
  const sigStr = leaseEnvelope.ed25519_sig;
  if (!payload || typeof payload !== "object" || typeof sigStr !== "string") {
    return { ok: false, reason: "missing_payload_or_signature" };
  }

  try {
    // Hardened: ignore COGNITARA_ED25519_PUBLIC_KEY_B64 env var in packaged builds!
    const allowEnvOverride = !isElectronPackaged();
    const pubB64 =
      overridePubKeyB64 ||
      (allowEnvOverride ? process.env.COGNITARA_ED25519_PUBLIC_KEY_B64 : undefined) ||
      DEFAULT_ED25519_PUBLIC_KEY_B64;
    const rawPub = b64urlDecode(pubB64);
    if (rawPub.length !== 32) {
      return { ok: false, reason: "invalid_public_key" };
    }
    const sigBytes = b64urlDecode(sigStr);
    if (sigBytes.length !== 64) {
      return { ok: false, reason: "invalid_signature_length" };
    }

    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawPub]);
    const keyObj = crypto.createPublicKey({ key: spkiDer, format: "der", type: "spki" });
    const message = Buffer.from(canonicalize(payload), "utf-8");
    const valid = crypto.verify(null, message, keyObj, sigBytes);
    return valid ? { ok: true, reason: "ok" } : { ok: false, reason: "invalid_ed25519_signature" };
  } catch {
    return { ok: false, reason: "signature_verification_error" };
  }
}

export function isLockStateBlockingStart(status: LicenseStatus | null): boolean {
  if (!status) return true;
  return status.lock_state !== "ACTIVE";
}

export function mapLockStateToScreenKind(
  lockState: LicenseStatus["lock_state"]
): "expired" | "clock" | "revoked" | null {
  switch (lockState) {
    case "EXPIRED_LOCK":
    case "LEASE_EXPIRED_LOCK":
    case "DRAINING":
      return "expired";
    case "CLOCK_TAMPER_LOCK":
    case "HWID_MISMATCH_LOCK":
      return "clock";
    case "HQ_REVOKED_LOCK":
      return "revoked";
    default:
      return null;
  }
}
