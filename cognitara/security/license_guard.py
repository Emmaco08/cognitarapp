"""
CogniTara v2 — Layer 1, 4 & 5 License Guard, Ed25519 Verifier & 15-Min Exam Drain
(cognitara/security/license_guard.py)

Responsibilities:
  1. Verify canonical Ed25519 signatures on `.cgnlic` lease payloads and
     `RevocationTombstone` payloads using `cryptography`.
  2. Enforce hardware fingerprint binding (`>= 3/4` component repair tolerance).
  3. Coordinate Triple-Anchor DPAPI / Registry / SQLite persistence and >300s
     clock-rollback detection via `TripleAnchorVaultStore`.
  4. Track monotonic elapsed runtime (`time.monotonic()`) across a 60-second
     background watchdog thread.
  5. Manage the 15-minute (900s) graceful active-exam drain on licence/lease
     expiry so in-progress candidates can finish and submit without losing work.
  6. Enforce dual-process request gating in Flask (`@app.before_request`) and
     boot-time verification in `wsgi.py`.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from cognitara.database.connection import get_db_connection
from cognitara.security.hwid import (
    get_hardware_fingerprint,
    match_hardware_fingerprint,
)
from cognitara.security.vault_store import (
    TripleAnchorVaultStore,
    canonical_json_bytes,
)

logger = logging.getLogger("cognitara.security.license_guard")

# Production Ed25519 public key (32-byte raw public key encoded in base64url).
# Matches the live CogniTara Cloud Ed25519 signing authority keypair.
DEFAULT_ED25519_PUBLIC_KEY_B64 = "cUDQSjHQMeXyWg3Ydptk-APs7Pd_lEyIp_XqBErD00g"
DEFAULT_KEY_ID = "ct-ed25519-2026-01"
DEFAULT_CLOUD_API_BASE = os.environ.get("COGNITARA_CLOUD_URL", "https://cognitara-cloud.vercel.app")

TRIAL_DURATION_DAYS = 14
TRIAL_DURATION_SECONDS = TRIAL_DURATION_DAYS * 86400

PLAN_LEASE_SECONDS = {
    "trial": TRIAL_DURATION_SECONDS,
    "monthly": 7 * 86400,
    "termly": 14 * 86400,
    "annual": 30 * 86400,
    "lifetime": 90 * 86400,
    "custom": 30 * 86400,
}

GRACEFUL_DRAIN_SECONDS = 900  # 15 minutes
WATCHDOG_INTERVAL_SECONDS = 60

HARD_LOCK_STATES = frozenset({
    "UNACTIVATED",
    "EXPIRED_LOCK",
    "LEASE_EXPIRED_LOCK",
    "CLOCK_TAMPER_LOCK",
    "HWID_MISMATCH_LOCK",
    "HQ_REVOKED_LOCK",
})

# Paths exempt from license lockouts (health, static assets, desktop control APIs, preview)
EXEMPT_PATH_PREFIXES = (
    "/health",
    "/static/",
    "/api/internal/",
    "/desktop-preview",
    "/api/preview/",
)

# Paths permitted during the 15-minute active-exam drain window so in-progress students can finish
DRAIN_ALLOWED_PREFIXES = (
    "/exam/",
    "/exam_heartbeat",
    "/exam_save_single_answer",
    "/exam_auto_save",
    "/exam_auto_submit_close",
    "/exam_check_pause",
    "/exam_get_state",
    "/exam_check_active_session",
    "/exam_check_resume_approved",
    "/exam_request_resume",
    "/save_answer",
    "/submit_exam",
    "/auto_submit_exam",
    "/log_warning",
    "/api/calculate",
    "/exam_page",
    "/take_exam",
    "/ce_exam/",
    "/ce_heartbeat",
    "/ce_save_single_answer",
    "/ce_auto_save",
    "/ce_auto_submit_close",
    "/ce_check_pause",
    "/ce_get_exam_state",
    "/ce_get_saved_state",
    "/ce_check_active_session",
    "/ce_check_resume_approved",
    "/ce_request_resume",
    "/submit_ce_exam",
    "/ce_log_warning",
    "/ce_exam_page",
    "/ce_take_exam",
    "/result",
    "/ce_submitted",
)


# =============================================================================
# Ed25519 Cryptographic Helpers
# =============================================================================

def _b64url_decode(data: str) -> bytes:
    cleaned = str(data or "").strip()
    padding = "=" * (-len(cleaned) % 4)
    return base64.urlsafe_b64decode(cleaned + padding)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def load_ed25519_public_key(public_key_b64: Optional[str] = None) -> Ed25519PublicKey:
    raw_b64 = public_key_b64
    if raw_b64 is None:
        if not getattr(sys, "frozen", False):
            raw_b64 = os.environ.get("COGNITARA_ED25519_PUBLIC_KEY_B64") or DEFAULT_ED25519_PUBLIC_KEY_B64
        else:
            raw_b64 = DEFAULT_ED25519_PUBLIC_KEY_B64
    key_bytes = _b64url_decode(raw_b64)
    if len(key_bytes) != 32:
        raise ValueError(f"Ed25519 public key must be 32 bytes (got {len(key_bytes)})")
    return Ed25519PublicKey.from_public_bytes(key_bytes)


def export_ed25519_public_key_b64(public_key: Ed25519PublicKey) -> str:
    raw = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return _b64url_encode(raw)


def sign_canonical_ed25519(payload_obj: Dict[str, Any], private_key: Ed25519PrivateKey) -> str:
    """Sign a canonical JSON object with Ed25519 and return a base64url signature."""
    sig = private_key.sign(canonical_json_bytes(payload_obj))
    return _b64url_encode(sig)


def verify_canonical_ed25519(
    payload_obj: Dict[str, Any],
    signature_b64: str,
    public_key_b64: Optional[str] = None,
) -> bool:
    """Verify an Ed25519 base64url signature over canonical JSON bytes."""
    if not isinstance(payload_obj, dict) or not signature_b64:
        return False
    try:
        pub = load_ed25519_public_key(public_key_b64)
        sig_bytes = _b64url_decode(signature_b64)
        if len(sig_bytes) != 64:
            return False
        pub.verify(sig_bytes, canonical_json_bytes(payload_obj))
        return True
    except (InvalidSignature, ValueError, TypeError) as exc:
        logger.debug("Ed25519 verification failed: %s", exc)
        return False


def _parse_iso_utc(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


# =============================================================================
# License Guard Engine
# =============================================================================

class LicenseGuard:
    """
    Core 5-layer license and anti-clock-tamper enforcement engine.
    Thread-safe; designed for both boot-time validation and 60s watchdog ticks.
    """

    def __init__(
        self,
        vault_store: Optional[TripleAnchorVaultStore] = None,
        db_conn_factory: Callable[[], sqlite3.Connection] = get_db_connection,
        public_key_b64: Optional[str] = None,
        hwid_provider: Optional[Callable[[], dict]] = None,
        clock_utc: Callable[[], float] = time.time,
        clock_monotonic: Callable[[], float] = time.monotonic,
    ):
        self._db_conn_factory = db_conn_factory
        self.vault = vault_store or TripleAnchorVaultStore(db_conn_factory=db_conn_factory)
        self._public_key_b64 = public_key_b64
        self._hwid_provider = hwid_provider or get_hardware_fingerprint
        self._clock_utc = clock_utc
        self._clock_monotonic = clock_monotonic

        self._lock = threading.RLock()
        self._last_monotonic = self._clock_monotonic()
        self._last_status: Optional[Dict[str, Any]] = None
        self._watchdog_stop = threading.Event()
        self._watchdog_thread: Optional[threading.Thread] = None

    def get_fingerprint(self) -> dict:
        return self._hwid_provider()

    def _count_active_exams(self) -> Tuple[int, int]:
        conn = None
        try:
            conn = self._db_conn_factory()
            reg = 0
            ce = 0
            try:
                row = conn.execute("SELECT COUNT(*) FROM scores WHERE status = 'in_progress'").fetchone()
                reg = int(row[0] or 0) if row else 0
            except Exception:
                reg = 0
            try:
                row = conn.execute("SELECT COUNT(*) FROM ce_attempts WHERE status = 'in_progress'").fetchone()
                ce = int(row[0] or 0) if row else 0
            except Exception:
                ce = 0
            return reg, ce
        except Exception as exc:
            logger.debug("Active exam count query degraded: %s", exc)
            return 0, 0
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    @staticmethod
    def _compute_local_trial_mac(payload: Dict[str, Any], hwid_hash: str) -> str:
        key = hashlib.sha256(f"CogniTara-LocalTrial-v2|{hwid_hash}".encode("utf-8")).digest()
        return hmac.new(key, canonical_json_bytes(payload), hashlib.sha256).hexdigest()

    def verify_lease_envelope(self, lease_envelope: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Verify Ed25519 signature (or machine-bound local trial MAC), schema fields, and hardware binding."""
        if not isinstance(lease_envelope, dict):
            return False, "invalid_lease_format", None
        payload = lease_envelope.get("payload")
        if not isinstance(payload, dict):
            return False, "missing_lease_payload_or_signature", None

        plan_tier = str(payload.get("plan_tier") or "").lower()
        if plan_tier not in PLAN_LEASE_SECONDS:
            return False, "unsupported_plan_tier", None

        if plan_tier == "trial" and lease_envelope.get("trial_mac") and not lease_envelope.get("ed25519_sig"):
            # Local 14-day hardware-bound evaluation trial: strictly capped at 14 days
            expected_mac = self._compute_local_trial_mac(payload, str(payload.get("hwid_hash") or ""))
            provided_mac = str(lease_envelope.get("trial_mac") or "")
            if not hmac.compare_digest(expected_mac, provided_mac):
                return False, "invalid_trial_mac", None
            paid_dur = int(payload.get("paid_duration_seconds") or 0)
            if paid_dur <= 0 or paid_dur > TRIAL_DURATION_SECONDS:
                return False, "invalid_trial_duration", None
        else:
            sig = lease_envelope.get("ed25519_sig")
            if not sig:
                return False, "missing_lease_payload_or_signature", None
            if not verify_canonical_ed25519(payload, sig, public_key_b64=self._public_key_b64):
                return False, "invalid_ed25519_signature", None

        for req in ("license_id", "plan_tier", "hwid_hash", "issued_at"):
            if not payload.get(req):
                return False, f"missing_required_field:{req}", None

        fp = self.get_fingerprint()
        matched, match_count, match_reason = match_hardware_fingerprint(
            expected_hwid_hash=str(payload.get("hwid_hash") or ""),
            current_fp=fp,
            expected_component_hashes=payload.get("hw_component_hashes"),
            min_component_matches=3,
        )
        if not matched:
            return False, "hwid_mismatch", {
                "match_count": match_count,
                "reason": match_reason,
                "expected_hwid": str(payload.get("hwid_hash") or "")[:12],
                "current_hwid": fp["display_hwid"],
            }

        return True, "ok", payload

    def verify_tombstone_envelope(self, tombstone_envelope: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Verify Ed25519 signature on a remote HQ RevocationTombstone."""
        if not isinstance(tombstone_envelope, dict):
            return False, "invalid_tombstone_format", None
        tombstone = tombstone_envelope.get("tombstone")
        sig = tombstone_envelope.get("ed25519_sig")
        if not isinstance(tombstone, dict) or not sig:
            return False, "missing_tombstone_or_signature", None
        if not verify_canonical_ed25519(tombstone, sig, public_key_b64=self._public_key_b64):
            return False, "invalid_tombstone_signature", None
        if not tombstone.get("tombstone_id") or not tombstone.get("license_id"):
            return False, "missing_tombstone_fields", None
        return True, "ok", tombstone

    def activate_lease(self, lease_envelope: Dict[str, Any]) -> Dict[str, Any]:
        """Verify a signed `.cgnlic` lease and seal it atomically across all 3 anchors."""
        with self._lock:
            now_ts = int(self._clock_utc())
            fp = self.get_fingerprint()
            hwid_hash = fp["hwid_hash"]

            # Refuse re-activation if this machine already has a burned HQ revocation tombstone
            existing = self.vault.load_and_reconcile(hwid_hash, now_utc=now_ts)
            if existing["status"] == "REVOKED":
                existing_state = existing.get("state") or {}
                existing_lic = existing_state.get("license_id")
                incoming_lic = (lease_envelope.get("payload") or {}).get("license_id")
                if not existing_lic or existing_lic == incoming_lic:
                    return {
                        "ok": False,
                        "error": "license_revoked_by_hq",
                        "status": self.evaluate(advance_monotonic=False),
                    }

            ok, reason, payload = self.verify_lease_envelope(lease_envelope)
            if not ok or payload is None:
                return {
                    "ok": False,
                    "error": reason,
                    "detail": payload if isinstance(payload, dict) else None,
                }

            prior_state = existing.get("state") if existing["status"] in ("OK", "CLOCK_TAMPER") else None
            same_license = bool(prior_state and prior_state.get("license_id") == payload["license_id"])

            prev_max_seen = max(int(existing.get("max_seen_utc") or 0), now_ts)
            # If clock is rolled back before recorded exam activity or prior anchor, reject activation
            if existing.get("max_seen_utc") and now_ts < int(existing["max_seen_utc"]) - 300:
                return {
                    "ok": False,
                    "error": "clock_rollback_detected",
                    "max_seen_utc": int(existing["max_seen_utc"]),
                    "now_utc": now_ts,
                }

            state = {
                "vault_version": 2,
                "license_id": str(payload["license_id"]),
                "hwid_hash": hwid_hash,
                "signed_lease": lease_envelope,
                "activated_at_utc": int(prior_state["activated_at_utc"]) if same_license else now_ts,
                "last_heartbeat_utc": now_ts,
                "max_seen_utc": prev_max_seen,
                "used_seconds": int(prior_state.get("used_seconds") or 0) if same_license else 0,
                "lease_used_seconds": 0,
                "tamper_strikes": int(prior_state.get("tamper_strikes") or 0) if same_license else 0,
                "lock_state": "ACTIVE",
                "active_exam_drain_until": None,
                "revocation_tombstone": None,
            }
            self.vault.seal_all(state, hwid_hash)
            self._last_monotonic = self._clock_monotonic()
            status = self.evaluate(advance_monotonic=False)
            return {"ok": True, "status": status}

    def activate_trial(self, school_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Activate a one-time 14-day hardware-bound evaluation trial sealed across all
        3 anchors (DPAPI, Registry + AnchorMac, SQLite). Enforces the exact same
        anti-clock-tamper, monotonic usage, and 15-minute drain rules as paid plans.
        """
        with self._lock:
            now_ts = int(self._clock_utc())
            fp = self.get_fingerprint()
            hwid_hash = fp["hwid_hash"]

            existing = self.vault.load_and_reconcile(hwid_hash, now_utc=now_ts)
            if existing["status"] == "REVOKED":
                return {
                    "ok": False,
                    "error": "license_revoked_by_hq",
                    "message": "This device has a revoked licence and cannot start a trial.",
                    "status": self.evaluate(advance_monotonic=False),
                }
            if existing["status"] in ("TAMPERED", "CLOCK_TAMPER"):
                return {
                    "ok": False,
                    "error": "clock_tamper_detected",
                    "message": "System clock tampering was detected. Fix your Windows date & time first.",
                    "status": self.evaluate(advance_monotonic=False),
                }

            prior_state = existing.get("state")
            if prior_state:
                prior_lic = str(prior_state.get("license_id") or "")
                if prior_lic.startswith("TRIAL-"):
                    cur = self.evaluate(advance_monotonic=False)
                    if cur.get("is_licensed"):
                        return {"ok": True, "already_active": True, "status": cur}
                    return {
                        "ok": False,
                        "error": "trial_already_used",
                        "message": "The 14-day evaluation trial on this computer has already ended. Please activate a licence key.",
                        "status": cur,
                    }

            resolved_school = (school_name or "").strip()
            if not resolved_school:
                try:
                    conn = self._db_conn_factory()
                    try:
                        row = conn.execute("SELECT school_name FROM school_settings WHERE id = 1").fetchone()
                        if row and row["school_name"]:
                            resolved_school = str(row["school_name"]).strip()
                    finally:
                        conn.close()
                except Exception:
                    pass
            resolved_school = resolved_school or "CogniTara Evaluation School"

            issued_dt = datetime.fromtimestamp(now_ts, tz=timezone.utc)
            expires_dt = issued_dt + timedelta(days=TRIAL_DURATION_DAYS)
            payload = {
                "schema_version": 2,
                "license_id": f"TRIAL-{hwid_hash[:10].upper()}",
                "license_key": f"TRIAL-{hwid_hash[:4].upper()}-{hwid_hash[4:8].upper()}",
                "school_name": resolved_school,
                "plan_tier": "trial",
                "hwid_hash": hwid_hash,
                "hw_component_hashes": fp["component_hashes"],
                "issued_at": issued_dt.isoformat().replace("+00:00", "Z"),
                "expires_at": expires_dt.isoformat().replace("+00:00", "Z"),
                "paid_duration_seconds": TRIAL_DURATION_SECONDS,
                "lease_seconds": TRIAL_DURATION_SECONDS,
                "key_id": "local-trial-v2",
            }
            trial_envelope = {
                "payload": payload,
                "trial_mac": self._compute_local_trial_mac(payload, hwid_hash),
            }
            return self.activate_lease(trial_envelope)

    def apply_revocation_tombstone(self, tombstone_envelope: Dict[str, Any]) -> Dict[str, Any]:
        """Verify and permanently burn an HQ RevocationTombstone into all 3 anchors."""
        with self._lock:
            ok, reason, tombstone = self.verify_tombstone_envelope(tombstone_envelope)
            if not ok or tombstone is None:
                return {"ok": False, "error": reason}

            now_ts = int(self._clock_utc())
            fp = self.get_fingerprint()
            hwid_hash = fp["hwid_hash"]
            rec = self.vault.load_and_reconcile(hwid_hash, now_utc=now_ts)
            base_state = dict(rec.get("state") or {})

            # If a different license is currently active, ignore mismatched tombstone
            if base_state.get("license_id") and base_state["license_id"] != tombstone["license_id"]:
                return {"ok": False, "error": "tombstone_license_id_mismatch"}

            state = {
                "vault_version": 2,
                "license_id": str(tombstone["license_id"]),
                "hwid_hash": hwid_hash,
                "signed_lease": base_state.get("signed_lease"),
                "activated_at_utc": int(base_state.get("activated_at_utc") or now_ts),
                "last_heartbeat_utc": now_ts,
                "max_seen_utc": max(int(rec.get("max_seen_utc") or 0), now_ts),
                "used_seconds": int(base_state.get("used_seconds") or 0),
                "lease_used_seconds": int(base_state.get("lease_used_seconds") or 0),
                "tamper_strikes": int(base_state.get("tamper_strikes") or 0),
                "lock_state": "HQ_REVOKED_LOCK",
                "active_exam_drain_until": None,
                "revocation_tombstone": tombstone_envelope,
            }
            self.vault.seal_all(state, hwid_hash)
            status = self.evaluate(advance_monotonic=False)
            return {"ok": True, "status": status}

    def activate_online(
        self,
        license_key: str,
        cloud_base_url: Optional[str] = None,
        timeout: float = 12.0,
    ) -> Dict[str, Any]:
        """Contact cognitara.net to activate a license key for this machine's HWID."""
        base = (cloud_base_url or os.environ.get("COGNITARA_CLOUD_URL") or DEFAULT_CLOUD_API_BASE).rstrip("/")
        fp = self.get_fingerprint()
        req_body = json.dumps({
            "license_key": license_key.strip().upper(),
            "hwid_hash": fp["hwid_hash"],
            "display_hwid": fp["display_hwid"],
            "hw_component_hashes": fp["component_hashes"],
            "machine_hostname": fp["hostname"],
            "os_version": fp["os_version"],
            "app_version": "2.2.1",
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/api/v1/licenses/activate",
            data=req_body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(detail)
                msg = parsed.get("message") or parsed.get("error") or f"HTTP {exc.code}"
            except Exception:
                msg = f"HTTP {exc.code}"
            return {"ok": False, "error": "cloud_activation_rejected", "message": msg}
        except Exception as exc:
            return {"ok": False, "error": "cloud_unreachable", "message": str(exc)}

        if (data.get("status") == "REVOKED" or data.get("revoked")) and data.get("tombstone"):
            tomb_env = data["tombstone"] if isinstance(data["tombstone"], dict) and "ed25519_sig" in data["tombstone"] else data
            return self.apply_revocation_tombstone(tomb_env)

        lease = data.get("signed_lease") or data.get("lease") or data
        return self.activate_lease(lease)

    def perform_heartbeat(
        self,
        cloud_base_url: Optional[str] = None,
        timeout: float = 10.0,
    ) -> Dict[str, Any]:
        """Sync with CogniTara Cloud to refresh the offline lease or receive revocations."""
        status = self.evaluate(advance_monotonic=False)
        if not status.get("license_id"):
            return {"ok": False, "error": "not_activated", "status": status}

        base = (cloud_base_url or os.environ.get("COGNITARA_CLOUD_URL") or DEFAULT_CLOUD_API_BASE).rstrip("/")
        fp = self.get_fingerprint()
        req_body = json.dumps({
            "license_id": status["license_id"],
            "hwid_hash": fp["hwid_hash"],
            "app_version": "2.2.1",
            "client_utc": datetime.fromtimestamp(self._clock_utc(), tz=timezone.utc).isoformat(),
            "used_seconds": status.get("used_seconds", 0),
            "lock_state": status["lock_state"],
            "tamper_strikes": status.get("tamper_strikes", 0),
            "active_exams_count": status.get("active_exams_count", 0),
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/api/v1/licenses/heartbeat",
            data=req_body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(detail)
                if (parsed.get("revoked") or parsed.get("status") == "REVOKED") and parsed.get("tombstone"):
                    tomb_env = parsed["tombstone"] if isinstance(parsed["tombstone"], dict) and "ed25519_sig" in parsed["tombstone"] else parsed
                    res = self.apply_revocation_tombstone(tomb_env)
                    return {"ok": False, "revoked": True, "status": res.get("status", self.evaluate(False))}
            except Exception:
                pass
            return {"ok": False, "error": "cloud_unreachable", "message": f"HTTP {exc.code}", "status": status}
        except Exception as exc:
            return {"ok": False, "error": "cloud_unreachable", "message": str(exc), "status": status}

        if (data.get("status") == "REVOKED" or data.get("revoked")) and data.get("tombstone"):
            tomb_env = data["tombstone"] if isinstance(data["tombstone"], dict) and "ed25519_sig" in data["tombstone"] else data
            res = self.apply_revocation_tombstone(tomb_env)
            return {"ok": False, "revoked": True, "status": res.get("status", self.evaluate(False))}

        refreshed = data.get("signed_lease") or data.get("lease") or (data if data.get("payload") and data.get("ed25519_sig") else None)
        if refreshed and isinstance(refreshed, dict) and refreshed.get("payload") and refreshed.get("ed25519_sig"):
            return self.activate_lease(refreshed)

        return {"ok": True, "status": self.evaluate(advance_monotonic=False), "directives": data.get("directives")}

    def evaluate(self, advance_monotonic: bool = True) -> Dict[str, Any]:
        """
        Evaluate the full 5-layer license state machine and optionally advance
        monotonic counters + persist across all 3 anchors.
        """
        with self._lock:
            now_ts = int(self._clock_utc())
            now_mono = self._clock_monotonic()
            mono_delta = max(0, int(now_mono - self._last_monotonic)) if advance_monotonic else 0
            if advance_monotonic:
                self._last_monotonic = now_mono

            fp = self.get_fingerprint()
            hwid_hash = fp["hwid_hash"]
            rec = self.vault.load_and_reconcile(hwid_hash, now_utc=now_ts)
            reg_active, ce_active = self._count_active_exams()
            active_exams_count = reg_active + ce_active

            base_report: Dict[str, Any] = {
                "lock_state": "UNACTIVATED",
                "is_licensed": False,
                "allow_portal": False,
                "allow_new_exams": False,
                "is_draining": False,
                "drain_remaining_seconds": 0,
                "active_exams_count": active_exams_count,
                "display_hwid": fp["display_hwid"],
                "hwid_hash": hwid_hash,
                "component_hashes": fp["component_hashes"],
                "anchors": rec["anchors"],
                "now_utc": now_ts,
                "max_seen_utc": int(rec.get("max_seen_utc") or 0),
                "tamper_reason": rec.get("tamper_reason"),
                "license_id": None,
                "license_key": None,
                "school_name": None,
                "plan_tier": None,
                "expires_at": None,
                "days_remaining": None,
                "total_days": None,
                "lease_seconds": None,
                "lease_remaining_seconds": None,
                "last_heartbeat_utc": None,
                "used_seconds": 0,
                "tamper_strikes": 0,
                "tombstone": None,
            }

            if rec["status"] == "UNACTIVATED":
                self._last_status = base_report
                return dict(base_report)

            state = rec.get("state")

            # Permanent HQ Revocation
            if rec["status"] == "REVOKED":
                tomb_env = (state or {}).get("revocation_tombstone") or {}
                tomb = tomb_env.get("tombstone") if isinstance(tomb_env, dict) else {}
                base_report.update({
                    "lock_state": "HQ_REVOKED_LOCK",
                    "license_id": (state or {}).get("license_id"),
                    "used_seconds": int((state or {}).get("used_seconds") or 0),
                    "tamper_strikes": int((state or {}).get("tamper_strikes") or 0),
                    "tombstone": tomb or None,
                })
                self._last_status = base_report
                return dict(base_report)

            # Anchor tampering or >300s clock rollback
            if rec["status"] in ("TAMPERED", "CLOCK_TAMPER"):
                if state is not None:
                    state["tamper_strikes"] = int(state.get("tamper_strikes") or 0) + 1
                    state["lock_state"] = "CLOCK_TAMPER_LOCK"
                    if rec["status"] == "CLOCK_TAMPER":
                        try:
                            self.vault.seal_all(state, hwid_hash)
                        except Exception as exc:
                            logger.warning("Failed to seal tamper strike: %s", exc)
                base_report.update({
                    "lock_state": "CLOCK_TAMPER_LOCK",
                    "license_id": (state or {}).get("license_id"),
                    "used_seconds": int((state or {}).get("used_seconds") or 0),
                    "tamper_strikes": int((state or {}).get("tamper_strikes") or 1),
                    "tamper_reason": rec.get("tamper_reason") or "clock_rollback_detected",
                })
                self._last_status = base_report
                return dict(base_report)

            # Status is OK — verify Ed25519 signature & HWID on stored signed_lease
            assert state is not None
            signed_lease = state.get("signed_lease")
            ok_lease, lease_err, payload = self.verify_lease_envelope(signed_lease)
            if not ok_lease or payload is None:
                lock_state = "HWID_MISMATCH_LOCK" if lease_err == "hwid_mismatch" else "CLOCK_TAMPER_LOCK"
                state["lock_state"] = lock_state
                state["tamper_strikes"] = int(state.get("tamper_strikes") or 0) + 1
                try:
                    self.vault.seal_all(state, hwid_hash)
                except Exception:
                    pass
                base_report.update({
                    "lock_state": lock_state,
                    "license_id": state.get("license_id"),
                    "tamper_reason": lease_err,
                    "tamper_strikes": state["tamper_strikes"],
                })
                self._last_status = base_report
                return dict(base_report)

            # Advance monotonic counters & high-water-mark UTC
            used_seconds = int(state.get("used_seconds") or 0) + mono_delta
            lease_used_seconds = int(state.get("lease_used_seconds") or 0) + mono_delta
            max_seen_utc = max(int(state.get("max_seen_utc") or 0), now_ts)
            state["used_seconds"] = used_seconds
            state["lease_used_seconds"] = lease_used_seconds
            state["max_seen_utc"] = max_seen_utc

            plan_tier = str(payload.get("plan_tier") or "annual").lower()
            paid_duration_seconds = payload.get("paid_duration_seconds")
            expires_at_str = payload.get("expires_at")
            expires_at_ts = _parse_iso_utc(expires_at_str) if expires_at_str else None
            lease_seconds = int(payload.get("lease_seconds") or PLAN_LEASE_SECONDS.get(plan_tier, 30 * 86400))

            # Determine paid expiry & offline lease expiry
            paid_expired = False
            if paid_duration_seconds is not None and used_seconds >= int(paid_duration_seconds):
                paid_expired = True
            if expires_at_ts is not None and now_ts >= expires_at_ts:
                paid_expired = True

            last_hb = int(state.get("last_heartbeat_utc") or state.get("activated_at_utc") or now_ts)
            wall_since_hb = max(0, now_ts - last_hb)
            lease_elapsed = max(lease_used_seconds, wall_since_hb)
            lease_expired = lease_elapsed >= lease_seconds

            drain_until = state.get("active_exam_drain_until")
            target_lock = "ACTIVE"
            drain_remaining = 0

            if paid_expired or lease_expired:
                hard_target = "EXPIRED_LOCK" if paid_expired else "LEASE_EXPIRED_LOCK"
                if active_exams_count > 0:
                    if drain_until is None:
                        drain_until = now_ts + GRACEFUL_DRAIN_SECONDS
                        state["active_exam_drain_until"] = drain_until
                    if now_ts < int(drain_until):
                        target_lock = "DRAINING"
                        drain_remaining = int(drain_until) - now_ts
                    else:
                        target_lock = hard_target
                else:
                    state["active_exam_drain_until"] = None
                    target_lock = hard_target
            else:
                state["active_exam_drain_until"] = None
                target_lock = "ACTIVE"

            prev_lock = state.get("lock_state")
            state["lock_state"] = target_lock

            # Persist updated monotonic counters / state atomically across all 3 anchors
            readonly_worker = os.environ.get("COGNITARA_VAULT_READONLY_WATCHDOG", "").strip() == "1"
            should_seal = advance_monotonic or (prev_lock != target_lock) or not readonly_worker
            if should_seal:
                try:
                    self.vault.seal_all(state, hwid_hash)
                except Exception as exc:
                    logger.warning("Triple-anchor seal update error: %s", exc)

            # Compute friendly remaining days / lease metadata
            days_remaining: Optional[int] = None
            total_days: Optional[int] = None
            if paid_duration_seconds is not None:
                total_days = max(1, int(round(int(paid_duration_seconds) / 86400)))
                rem_by_used = max(0, int(paid_duration_seconds) - used_seconds)
                rem_by_wall = max(0, expires_at_ts - now_ts) if expires_at_ts is not None else rem_by_used
                rem_sec = min(rem_by_used, rem_by_wall)
                days_remaining = int(rem_sec // 86400) if rem_sec > 0 else 0
            elif expires_at_ts is not None:
                rem_sec = max(0, expires_at_ts - now_ts)
                days_remaining = int(rem_sec // 86400)

            lease_remaining = max(0, lease_seconds - lease_elapsed)

            report = {
                **base_report,
                "lock_state": target_lock,
                "is_licensed": target_lock in ("ACTIVE", "DRAINING"),
                "allow_portal": target_lock in ("ACTIVE", "DRAINING"),
                "allow_new_exams": target_lock == "ACTIVE",
                "is_draining": target_lock == "DRAINING",
                "drain_remaining_seconds": drain_remaining,
                "license_id": str(payload.get("license_id")),
                "license_key": payload.get("license_key"),
                "school_name": payload.get("school_name"),
                "plan_tier": plan_tier,
                "expires_at": expires_at_str,
                "days_remaining": days_remaining,
                "total_days": total_days,
                "lease_seconds": lease_seconds,
                "lease_remaining_seconds": lease_remaining,
                "last_heartbeat_utc": last_hb,
                "used_seconds": used_seconds,
                "lease_used_seconds": lease_used_seconds,
                "max_seen_utc": max_seen_utc,
                "tamper_strikes": int(state.get("tamper_strikes") or 0),
                "features": payload.get("features") or {},
                "anchors": {
                    "dpapi_vault": "ok",
                    "registry": "ok",
                    "sqlite": "ok",
                },
            }
            self._last_status = report
            return dict(report)

    def get_cached_or_evaluate(self) -> Dict[str, Any]:
        with self._lock:
            if self._last_status is not None:
                return dict(self._last_status)
        return self.evaluate(advance_monotonic=False)

    # ---- Background 60s Monotonic Watchdog ----
    def start_watchdog(self, interval_seconds: int = WATCHDOG_INTERVAL_SECONDS) -> None:
        with self._lock:
            if self._watchdog_thread and self._watchdog_thread.is_alive():
                return
            self._watchdog_stop.clear()

            def _loop():
                while not self._watchdog_stop.wait(interval_seconds):
                    try:
                        self.evaluate(advance_monotonic=True)
                    except Exception as exc:
                        logger.warning("License watchdog tick error: %s", exc)

            t = threading.Thread(target=_loop, name="cognitara-license-watchdog", daemon=True)
            t.start()
            self._watchdog_thread = t

    def stop_watchdog(self) -> None:
        self._watchdog_stop.set()
        t = self._watchdog_thread
        if t and t.is_alive():
            t.join(timeout=2.0)


# =============================================================================
# Process-Wide Singleton & Flask Dual-Process Enforcement Hook
# =============================================================================

_GLOBAL_GUARD: Optional[LicenseGuard] = None


def get_license_guard() -> LicenseGuard:
    global _GLOBAL_GUARD
    if _GLOBAL_GUARD is None:
        _GLOBAL_GUARD = LicenseGuard()
    return _GLOBAL_GUARD


def set_license_guard(guard: Optional[LicenseGuard]) -> None:
    """Allow tests to inject an isolated LicenseGuard instance."""
    global _GLOBAL_GUARD
    _GLOBAL_GUARD = guard


def is_testing_bypass_active(app) -> bool:
    """
    Test isolation bypass (`COGNITARA_TESTING_BYPASS_LICENSE=1`) ONLY applies when
    `app.config['TESTING'] == True` and is STRICTLY disabled in frozen builds
    (`getattr(sys, 'frozen', False)`).
    """
    if getattr(sys, "frozen", False):
        return False
    if not app.config.get("TESTING", False):
        return False
    if app.config.get("ENFORCE_LICENSE", False):
        return False
    raw = os.environ.get("COGNITARA_TESTING_BYPASS_LICENSE")
    if raw is None:
        # Legacy test suites set TESTING=True without specifying the env var
        return True
    return raw == "1"


def should_enforce_license(app) -> bool:
    """
    Determine whether strict license gating should run for this Flask app.
    Always True when frozen (`cognitara-engine.exe`), desktop-managed, or
    explicitly enabled via `COGNITARA_ENFORCE_LICENSE=1` or `app.config['ENFORCE_LICENSE']`.
    """
    if getattr(sys, "frozen", False):
        return True
    if is_testing_bypass_active(app):
        return False
    if app.config.get("ENFORCE_LICENSE", False):
        return True
    if os.environ.get("COGNITARA_ENFORCE_LICENSE") == "1":
        return True
    if os.environ.get("COGNITARA_DESKTOP_MANAGED") == "1":
        return True
    return False


def _is_exempt_path(path: str) -> bool:
    for prefix in EXEMPT_PATH_PREFIXES:
        if path == prefix.rstrip("/") or path.startswith(prefix):
            return True
    return False


def _is_drain_allowed_path(path: str) -> bool:
    for prefix in DRAIN_ALLOWED_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


def _render_lock_html(status: Dict[str, Any]) -> str:
    state = status.get("lock_state", "EXPIRED_LOCK")
    titles = {
        "UNACTIVATED": "CogniTara Licence Required",
        "EXPIRED_LOCK": "Your CogniTara Licence Has Ended",
        "LEASE_EXPIRED_LOCK": "Offline Check-In Required",
        "CLOCK_TAMPER_LOCK": "Server Date & Time Verification Required",
        "HWID_MISMATCH_LOCK": "Licence Locked to Another Computer",
        "HQ_REVOKED_LOCK": "This Licence Has Been Revoked",
        "DRAINING": "New Exam Sessions Are Paused",
    }
    bodies = {
        "UNACTIVATED": "Open CogniTara Studio on the server computer to activate your school's licence.",
        "EXPIRED_LOCK": "New exams are paused. All exam records, questions, and student results remain safely stored on this server.",
        "LEASE_EXPIRED_LOCK": "Connect the server computer to the internet and open CogniTara Studio to refresh your offline lease.",
        "CLOCK_TAMPER_LOCK": "The server computer's clock appears earlier than its last verified time. Fix Windows date and time in CogniTara Studio.",
        "HWID_MISMATCH_LOCK": "This licence is bound to a different server PC. Contact support@cognitara.net or reset the device in your cognitara.net account.",
        "HQ_REVOKED_LOCK": "This licence was disabled by CogniTara HQ. Your local school data has not been deleted.",
        "DRAINING": "Students already writing have a 15-minute grace window to finish and submit. No new sessions can begin.",
    }
    title = titles.get(state, "CogniTara Server Locked")
    body = bodies.get(state, "Open CogniTara Studio on the server computer for details.")
    drain_rem = int(status.get("drain_remaining_seconds") or 0)
    extra = ""
    if state == "DRAINING" and drain_rem > 0:
        mins, secs = divmod(drain_rem, 60)
        extra = f"<p class='meta'>Active exam grace window remaining: <code>{mins:02d}:{secs:02d}</code></p>"
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{title} — CogniTara</title>"
        "<style>"
        "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0E1A;color:#F3F6FB;"
        "font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}"
        ".card{max-width:520px;background:#121825;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:32px;text-align:center}"
        "h1{margin:0 0 12px;font-size:22px;font-weight:600}p{margin:0 0 12px;color:#A9B6CA;line-height:1.55}"
        ".pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;"
        "background:rgba(248,113,113,.15);color:#F87171;margin-bottom:16px}"
        ".meta{font-size:13px;color:#94A3B8}code{font-family:ui-monospace,Consolas,monospace;color:#00D2FF}"
        "</style></head><body><div class='card'>"
        f"<span class='pill'>{state}</span><h1>{title}</h1><p>{body}</p>{extra}"
        "</div></body></html>"
    )


def enforce_license_before_request():
    """Flask `before_request` hook implementing Layer 5 engine-side enforcement."""
    from flask import current_app, jsonify, request

    if not should_enforce_license(current_app):
        return None

    path = request.path or "/"
    if _is_exempt_path(path):
        return None

    guard = current_app.extensions.get("license_guard") or get_license_guard()
    status = guard.evaluate(advance_monotonic=False)
    lock_state = status.get("lock_state", "UNACTIVATED")

    if lock_state == "ACTIVE":
        return None

    if lock_state == "DRAINING":
        if _is_drain_allowed_path(path):
            return None
        if request.is_json or path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "license_draining",
                "lock_state": "DRAINING",
                "drain_remaining_seconds": status.get("drain_remaining_seconds", 0),
                "message": "Licence expired. Active exams have 15 minutes to finish; new sessions are blocked.",
            }), 403
        return _render_lock_html(status), 403

    # Hard lock states
    if request.is_json or path.startswith("/api/"):
        return jsonify({
            "ok": False,
            "error": "license_locked",
            "lock_state": lock_state,
            "tamper_reason": status.get("tamper_reason"),
            "message": "CogniTara server is locked. Open CogniTara Studio for details.",
        }), 403
    return _render_lock_html(status), 403
