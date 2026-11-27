"""
CogniTara v2 - Layer 3 Triple-Anchor DPAPI, Registry & SQLite Vault Store
(cognitara/security/vault_store.py)

Persists license state, monotonic elapsed runtime, high-water-mark UTC clock,
and revocation tombstones atomically across three independent anchors:
  - Anchor A: Encrypted Windows DPAPI file (%ProgramData%\\CogniTara\\vault\\license_vault.bin
              with %LOCALAPPDATA% fallback; AES-GCM hardware-bound envelope on non-Windows)
  - Anchor B: Windows Registry (HKLM\\SOFTWARE\\CogniTara\\Vault with HKCU fallback)
              protected by AnchorMac HMAC-SHA256
  - Anchor C: SQLite `local_license_state` in `exam.db` + cross-check against
              recorded exam timestamps in `scores` and `ce_attempts`
"""

from __future__ import annotations

import ctypes
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import sys
import tempfile
import time
from typing import Any, Callable, Dict, Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from cognitara.database.initialization import init_license_tables
from cognitara.security.hwid import match_hardware_fingerprint

logger = logging.getLogger("cognitara.security.vault_store")

VAULT_VERSION = 2
DPAPI_ENTROPY = b"CogniTara-Vault-v2"
STATE_HMAC_DOMAIN = b"CogniTara-Vault-v2-StateKey"
REGISTRY_MAC_DOMAIN = b"CogniTara-Registry-Anchor-v2"
DB_CHECKSUM_DOMAIN = b"CogniTara-DB-Anchor-v2"
AES_MAGIC = b"CTV2AES\x00"
AES_MAGIC_V3 = b"CTV3AES\x00"

CLOCK_ROLLBACK_TOLERANCE_SECONDS = 300  # > 5 minutes rollback trips CLOCK_TAMPER_LOCK


def canonical_json_bytes(obj: Any) -> bytes:
    """Deterministic UTF-8 JSON serialization (sorted keys, compact separators)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_state_hmac(state: Dict[str, Any], hwid_hash: str) -> str:
    payload = {k: v for k, v in state.items() if k != "state_hmac" and not str(k).startswith("_")}
    key = hmac.new(STATE_HMAC_DOMAIN, hwid_hash.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(key, canonical_json_bytes(payload), hashlib.sha256).hexdigest()


def compute_anchor_mac(
    domain: bytes,
    license_id: str,
    max_seen_utc: int,
    used_seconds: int,
    lock_state: str,
    tombstone_id: str,
    hwid_hash: str,
) -> str:
    msg = f"{license_id}|{int(max_seen_utc)}|{int(used_seconds)}|{lock_state}|{tombstone_id}|{hwid_hash}"
    return hmac.new(domain, msg.encode("utf-8"), hashlib.sha256).hexdigest()


# =============================================================================
# Platform Encryption Helpers (Windows DPAPI + Cross-Platform AES-GCM Fallback)
# =============================================================================

if sys.platform == "win32":
    from ctypes import wintypes

    class _DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_char)),
        ]

    _CRYPTPROTECT_UI_FORBIDDEN = 0x01
    _CRYPTPROTECT_LOCAL_MACHINE = 0x04

    def _make_blob(data: bytes) -> Tuple[_DATA_BLOB, Any]:
        buf = ctypes.create_string_buffer(data, len(data))
        blob = _DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
        return blob, buf

    def _dpapi_protect(plaintext: bytes, entropy: bytes = DPAPI_ENTROPY) -> bytes:
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        in_blob, _in_buf = _make_blob(plaintext)
        ent_blob, _ent_buf = _make_blob(entropy)
        out_blob = _DATA_BLOB()

        for flags in (
            _CRYPTPROTECT_LOCAL_MACHINE | _CRYPTPROTECT_UI_FORBIDDEN,
            _CRYPTPROTECT_UI_FORBIDDEN,
        ):
            ok = crypt32.CryptProtectData(
                ctypes.byref(in_blob),
                "CogniTara License Vault",
                ctypes.byref(ent_blob),
                None,
                None,
                flags,
                ctypes.byref(out_blob),
            )
            if ok:
                try:
                    return ctypes.string_at(out_blob.pbData, out_blob.cbData)
                finally:
                    kernel32.LocalFree(out_blob.pbData)
        raise OSError("Windows DPAPI CryptProtectData failed")

    def _dpapi_unprotect(ciphertext: bytes, entropy: bytes = DPAPI_ENTROPY) -> bytes:
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        in_blob, _in_buf = _make_blob(ciphertext)
        ent_blob, _ent_buf = _make_blob(entropy)
        out_blob = _DATA_BLOB()

        ok = crypt32.CryptUnprotectData(
            ctypes.byref(in_blob),
            None,
            ctypes.byref(ent_blob),
            None,
            None,
            _CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
        if not ok:
            raise ValueError("Windows DPAPI CryptUnprotectData failed")
        try:
            return ctypes.string_at(out_blob.pbData, out_blob.cbData)
        finally:
            kernel32.LocalFree(out_blob.pbData)


def encrypt_vault_bytes(plaintext: bytes, hwid_hash: str) -> bytes:
    """Encrypt Anchor A bytes using Windows DPAPI on Win32 or AES-GCM elsewhere."""
    if sys.platform == "win32":
        return _dpapi_protect(plaintext, DPAPI_ENTROPY)
    hwid_bytes = hwid_hash.encode("utf-8")
    key = hmac.new(DPAPI_ENTROPY, hwid_bytes, hashlib.sha256).digest()
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext, DPAPI_ENTROPY)
    return AES_MAGIC_V3 + len(hwid_bytes).to_bytes(2, "big") + hwid_bytes + nonce + ct


def decrypt_vault_bytes(
    ciphertext: bytes,
    hwid_hash: str,
    allow_embedded_hwid: bool = False,
) -> bytes:
    """Decrypt Anchor A bytes using Windows DPAPI on Win32 or AES-GCM elsewhere."""
    if ciphertext.startswith(AES_MAGIC_V3):
        header_len = len(AES_MAGIC_V3) + 2
        if len(ciphertext) < header_len + 12 + 16:
            raise ValueError("Truncated AES v3 vault envelope")
        hwid_len = int.from_bytes(ciphertext[len(AES_MAGIC_V3):header_len], "big")
        if len(ciphertext) < header_len + hwid_len + 12 + 16:
            raise ValueError("Truncated AES v3 vault header")
        embedded_hwid = ciphertext[header_len:header_len + hwid_len].decode("utf-8", errors="strict")
        nonce_start = header_len + hwid_len
        nonce = ciphertext[nonce_start:nonce_start + 12]
        body = ciphertext[nonce_start + 12:]
        effective_hwid = embedded_hwid if allow_embedded_hwid else hwid_hash
        key = hmac.new(DPAPI_ENTROPY, effective_hwid.encode("utf-8"), hashlib.sha256).digest()
        return AESGCM(key).decrypt(nonce, body, DPAPI_ENTROPY)
    if ciphertext.startswith(AES_MAGIC):
        if len(ciphertext) < len(AES_MAGIC) + 12 + 16:
            raise ValueError("Truncated AES vault envelope")
        nonce = ciphertext[len(AES_MAGIC): len(AES_MAGIC) + 12]
        body = ciphertext[len(AES_MAGIC) + 12:]
        key = hmac.new(DPAPI_ENTROPY, hwid_hash.encode("utf-8"), hashlib.sha256).digest()
        return AESGCM(key).decrypt(nonce, body, DPAPI_ENTROPY)
    if sys.platform == "win32":
        return _dpapi_unprotect(ciphertext, DPAPI_ENTROPY)
    raise ValueError("Unrecognized vault encryption envelope")


# =============================================================================
# Anchor Path Resolvers
# =============================================================================

def _default_vault_paths() -> list[str]:
    if sys.platform == "win32":
        paths: list[str] = []
        program_data = os.environ.get("PROGRAMDATA") or r"C:\ProgramData"
        paths.append(os.path.join(program_data, "CogniTara", "vault", "license_vault.bin"))
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            paths.append(os.path.join(local_app_data, "CogniTara", "vault", "license_vault.bin"))
        return paths
    base = os.path.expanduser(os.environ.get("XDG_DATA_HOME", "~/.local/share"))
    return [os.path.join(base, "CogniTara", "vault", "license_vault.bin")]


def _default_registry_fallback_path() -> str:
    base = os.path.expanduser(os.environ.get("XDG_CONFIG_HOME", "~/.config"))
    return os.path.join(base, "CogniTara", "vault_registry_anchor.json")


def _atomic_write_bytes(path: str, data: bytes) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".ct_vault_", suffix=".tmp", dir=parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# =============================================================================
# Anchor B: Windows Registry (HKCU + HKLM synchronized) / File Fallback
# =============================================================================

class RegistryAnchor:
    """Persists Anchor B in Windows Registry (HKCU + best-effort HKLM mirror) or sidecar file."""

    SUBKEY = r"SOFTWARE\CogniTara\Vault"

    def __init__(self, fallback_file: Optional[str] = None, force_file_backend: bool = False):
        self.fallback_file = fallback_file
        self.force_file_backend = force_file_backend or (sys.platform != "win32")

    def _file_path(self) -> str:
        return self.fallback_file or _default_registry_fallback_path()

    @staticmethod
    def _mac_matches(entry: Dict[str, Any], hwid_hash: str) -> bool:
        expected = compute_anchor_mac(
            REGISTRY_MAC_DOMAIN,
            str(entry.get("LicenseId") or ""),
            int(entry.get("MaxSeenUtc") or 0),
            int(entry.get("UsedSeconds") or 0),
            str(entry.get("LockState") or ""),
            str(entry.get("TombstoneId") or ""),
            hwid_hash,
        )
        actual = str(entry.get("AnchorMac") or "")
        return bool(actual and hmac.compare_digest(actual, expected))

    def read(self, preferred_hwids: Optional[Tuple[str, ...]] = None) -> Optional[Dict[str, Any]]:
        if self.force_file_backend:
            path = self._file_path()
            if not os.path.isfile(path):
                return None
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data if isinstance(data, dict) else {"_corrupt": True}
            except Exception:
                return {"_corrupt": True}

        import winreg  # type: ignore

        entries: list[Dict[str, Any]] = []
        had_corrupt = False
        for hive, label in ((winreg.HKEY_CURRENT_USER, "HKCU"), (winreg.HKEY_LOCAL_MACHINE, "HKLM")):
            try:
                access = winreg.KEY_READ | getattr(winreg, "KEY_WOW64_64KEY", 0)
                with winreg.OpenKey(hive, self.SUBKEY, 0, access) as key:
                    license_id, _ = winreg.QueryValueEx(key, "LicenseId")
                    max_seen, _ = winreg.QueryValueEx(key, "MaxSeenUtc")
                    used_sec, _ = winreg.QueryValueEx(key, "UsedSeconds")
                    lock_state, _ = winreg.QueryValueEx(key, "LockState")
                    anchor_mac, _ = winreg.QueryValueEx(key, "AnchorMac")
                    try:
                        tombstone_id, _ = winreg.QueryValueEx(key, "TombstoneId")
                    except FileNotFoundError:
                        tombstone_id = ""
                    entries.append({
                        "LicenseId": str(license_id),
                        "MaxSeenUtc": int(max_seen),
                        "UsedSeconds": int(used_sec),
                        "LockState": str(lock_state),
                        "TombstoneId": str(tombstone_id or ""),
                        "AnchorMac": str(anchor_mac),
                        "hive": label,
                    })
            except FileNotFoundError:
                continue
            except Exception as exc:
                logger.warning("Registry anchor read error (%s): %s", label, exc)
                had_corrupt = True

        if not entries:
            return {"_corrupt": True} if had_corrupt else None

        if len(entries) == 1:
            return entries[0]

        # Resolve HKCU vs HKLM cleanly: prefer entries with a valid MAC and higher monotonic progress
        hwids = tuple(h for h in (preferred_hwids or ()) if h)
        def _rank(item: Dict[str, Any]) -> Tuple[int, int, int, int]:
            is_revoked = 1 if (item.get("LockState") == "HQ_REVOKED_LOCK" or item.get("TombstoneId")) else 0
            mac_ok = 1 if (hwids and any(self._mac_matches(item, h) for h in hwids)) else 0
            return (is_revoked, mac_ok, int(item.get("MaxSeenUtc") or 0), int(item.get("UsedSeconds") or 0))

        entries.sort(key=_rank, reverse=True)
        return entries[0]

    def write(
        self,
        license_id: str,
        max_seen_utc: int,
        used_seconds: int,
        lock_state: str,
        tombstone_id: str,
        hwid_hash: str,
    ) -> str:
        mac = compute_anchor_mac(
            REGISTRY_MAC_DOMAIN,
            license_id,
            max_seen_utc,
            used_seconds,
            lock_state,
            tombstone_id,
            hwid_hash,
        )
        payload = {
            "LicenseId": str(license_id),
            "MaxSeenUtc": int(max_seen_utc),
            "UsedSeconds": int(used_seconds),
            "LockState": str(lock_state),
            "TombstoneId": str(tombstone_id or ""),
            "AnchorMac": mac,
        }

        if self.force_file_backend:
            _atomic_write_bytes(self._file_path(), canonical_json_bytes(payload))
            return "FILE_REG_ANCHOR"

        import winreg  # type: ignore

        access = winreg.KEY_WRITE | getattr(winreg, "KEY_WOW64_64KEY", 0)
        written_labels: list[str] = []
        last_exc: Optional[Exception] = None
        # Always write HKCU (reliable for non-elevated user sessions) and best-effort mirror to HKLM
        for hive, label in ((winreg.HKEY_CURRENT_USER, "HKCU"), (winreg.HKEY_LOCAL_MACHINE, "HKLM")):
            try:
                with winreg.CreateKeyEx(hive, self.SUBKEY, 0, access) as key:
                    winreg.SetValueEx(key, "LicenseId", 0, winreg.REG_SZ, payload["LicenseId"])
                    winreg.SetValueEx(key, "MaxSeenUtc", 0, winreg.REG_QWORD, payload["MaxSeenUtc"])
                    winreg.SetValueEx(key, "UsedSeconds", 0, winreg.REG_QWORD, payload["UsedSeconds"])
                    winreg.SetValueEx(key, "LockState", 0, winreg.REG_SZ, payload["LockState"])
                    winreg.SetValueEx(key, "TombstoneId", 0, winreg.REG_SZ, payload["TombstoneId"])
                    winreg.SetValueEx(key, "AnchorMac", 0, winreg.REG_SZ, payload["AnchorMac"])
                written_labels.append(label)
            except (PermissionError, OSError) as exc:
                last_exc = exc
                continue
        if written_labels:
            return "+".join(written_labels)
        raise OSError(f"Unable to write Windows Registry anchor: {last_exc}")

    def clear(self) -> None:
        if self.force_file_backend:
            path = self._file_path()
            try:
                if os.path.isfile(path):
                    os.unlink(path)
            except OSError:
                pass
            return

        import winreg  # type: ignore

        access = winreg.KEY_ALL_ACCESS | getattr(winreg, "KEY_WOW64_64KEY", 0)
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                winreg.DeleteKeyEx(hive, self.SUBKEY, access, 0)
            except FileNotFoundError:
                continue
            except OSError:
                try:
                    with winreg.OpenKey(hive, self.SUBKEY, 0, access) as key:
                        for name in ("LicenseId", "MaxSeenUtc", "UsedSeconds", "LockState", "TombstoneId", "AnchorMac"):
                            try:
                                winreg.DeleteValue(key, name)
                            except OSError:
                                pass
                except OSError:
                    continue


# =============================================================================
# Anchor C: SQLite `local_license_state` + Exam Timestamp Cross-Check
# =============================================================================

def _parse_db_epoch(conn: sqlite3.Connection, table: str, columns: Tuple[str, ...]) -> int:
    """Safely query MAX(strftime('%s', col)) for columns that exist on `table`."""
    try:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if not exists:
            return 0
        existing_cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        max_epoch = 0
        for col in columns:
            if col not in existing_cols:
                continue
            row = conn.execute(
                f"SELECT MAX(CAST(strftime('%s', {col}) AS INTEGER)) FROM {table} WHERE {col} IS NOT NULL"
            ).fetchone()
            if row and row[0] is not None:
                try:
                    val = int(row[0])
                    # Ignore implausible future garbage (> 2100-01-01)
                    if 1_577_836_800 <= val <= 4_102_444_800 and val > max_epoch:
                        max_epoch = val
                except (TypeError, ValueError):
                    pass
        return max_epoch
    except Exception as exc:
        logger.debug("Exam timestamp cross-check skipped for %s: %s", table, exc)
        return 0


def get_max_exam_activity_utc(conn: sqlite3.Connection) -> int:
    """Inspect recorded student exam timestamps across `scores` and `ce_attempts`."""
    reg_max = _parse_db_epoch(
        conn,
        "scores",
        ("start_time", "end_time", "last_heartbeat", "time_adjusted_at", "updated_at"),
    )
    ce_max = _parse_db_epoch(
        conn,
        "ce_attempts",
        ("started_at", "completed_at", "last_heartbeat", "time_adjusted_at", "updated_at"),
    )
    return max(reg_max, ce_max)


# =============================================================================
# Unified Triple-Anchor Vault Store
# =============================================================================

class TripleAnchorVaultStore:
    """
    Coordinates atomic reads, writes, integrity verification, and anti-tamper
    reconciliation across Anchor A (DPAPI file), Anchor B (Registry), and
    Anchor C (SQLite `local_license_state` + exam timestamps).
    """

    def __init__(
        self,
        db_conn_factory: Callable[[], sqlite3.Connection],
        vault_path: Optional[str] = None,
        registry_anchor: Optional[RegistryAnchor] = None,
    ):
        self._db_conn_factory = db_conn_factory
        self._explicit_vault_path = vault_path
        self.registry = registry_anchor or RegistryAnchor()
        self._resolved_vault_path: Optional[str] = vault_path

    def _candidate_vault_paths(self) -> list[str]:
        if self._explicit_vault_path:
            return [self._explicit_vault_path]
        env_override = None
        if not getattr(sys, "frozen", False):
            env_override = os.environ.get("COGNITARA_VAULT_PATH")
        if env_override:
            return [env_override]
        return _default_vault_paths()

    def get_active_vault_path(self) -> str:
        if self._resolved_vault_path:
            return self._resolved_vault_path
        candidates = self._candidate_vault_paths()
        for path in candidates:
            if os.path.isfile(path):
                self._resolved_vault_path = path
                return path
        return candidates[0]

    # ---- Anchor A ----
    def _try_parse_anchor_a_file(
        self,
        path: str,
        hwid_hash: str,
        current_fp: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            with open(path, "rb") as f:
                raw = f.read()
            plaintext = decrypt_vault_bytes(raw, hwid_hash, allow_embedded_hwid=bool(current_fp))
            data = json.loads(plaintext.decode("utf-8"))
            if not isinstance(data, dict):
                return None, "anchor_a_corrupt"
        except Exception as exc:
            logger.warning("Anchor A decrypt/parse failure (%s): %s", path, exc)
            return None, "anchor_a_corrupt"

        stored_hmac = str(data.get("state_hmac") or "")
        expected_hmac = compute_state_hmac(data, hwid_hash)
        if stored_hmac and hmac.compare_digest(stored_hmac, expected_hmac):
            return data, None

        # Check >= 3/4 hardware component tolerance (same physical PC after minor drift / disk / WMI change)
        stored_hwid = str(data.get("hwid_hash") or "").strip()
        if (
            current_fp
            and stored_hwid
            and stored_hwid != hwid_hash
            and stored_hmac
            and hmac.compare_digest(stored_hmac, compute_state_hmac(data, stored_hwid))
        ):
            lease_payload = (data.get("signed_lease") or {}).get("payload") or {}
            expected_comps = data.get("hw_component_hashes") or lease_payload.get("hw_component_hashes")
            matched, match_count, _ = match_hardware_fingerprint(
                expected_hwid_hash=stored_hwid,
                current_fp=current_fp,
                expected_component_hashes=expected_comps,
                min_component_matches=3,
            )
            if matched:
                rebound = dict(data)
                rebound["_rebind_from_hwid"] = stored_hwid
                rebound["_rebind_match_count"] = match_count
                return rebound, None

        return None, "anchor_a_hmac_mismatch"

    def read_anchor_a(
        self,
        hwid_hash: str,
        current_fp: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Returns (state_dict_or_none, error_code_or_none).
        Returns (None, None) when no vault file exists yet.
        Checks all candidate paths (e.g. %ProgramData% and %LOCALAPPDATA%) and
        prefers the freshest valid vault to prevent multi-path split-brain.
        """
        existing_paths = [p for p in self._candidate_vault_paths() if os.path.isfile(p)]
        if not existing_paths:
            return None, None

        valid_entries: list[Tuple[str, Dict[str, Any]]] = []
        first_err: Optional[str] = None
        for path in existing_paths:
            data, err = self._try_parse_anchor_a_file(path, hwid_hash, current_fp=current_fp)
            if data is not None and err is None:
                valid_entries.append((path, data))
            elif first_err is None:
                first_err = err

        if valid_entries:
            valid_entries.sort(
                key=lambda item: (
                    1 if item[1].get("lock_state") == "HQ_REVOKED_LOCK" else 0,
                    0 if item[1].get("_rebind_from_hwid") else 1,
                    int(item[1].get("max_seen_utc") or 0),
                    int(item[1].get("used_seconds") or 0),
                ),
                reverse=True,
            )
            best_path, best_data = valid_entries[0]
            self._resolved_vault_path = best_path
            return best_data, None

        self._resolved_vault_path = existing_paths[0]
        return None, first_err or "anchor_a_corrupt"

    def write_anchor_a(self, state: Dict[str, Any], hwid_hash: str) -> str:
        signed_state = {k: v for k, v in state.items() if not str(k).startswith("_")}
        signed_state["vault_version"] = VAULT_VERSION
        signed_state["hwid_hash"] = hwid_hash
        signed_state["state_hmac"] = compute_state_hmac(signed_state, hwid_hash)
        encrypted = encrypt_vault_bytes(canonical_json_bytes(signed_state), hwid_hash)

        written_paths: list[str] = []
        last_exc: Optional[Exception] = None
        for path in self._candidate_vault_paths():
            try:
                _atomic_write_bytes(path, encrypted)
                written_paths.append(path)
            except (PermissionError, OSError) as exc:
                last_exc = exc
                continue
        if written_paths:
            self._resolved_vault_path = written_paths[0]
            return written_paths[0]
        raise OSError(f"Unable to persist Anchor A vault file: {last_exc}")

    # ---- Anchor B ----
    def read_anchor_b(
        self,
        hwid_hash: str,
        alternate_hwid: Optional[str] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        preferred = (hwid_hash, alternate_hwid) if alternate_hwid else (hwid_hash,)
        raw = self.registry.read(preferred_hwids=preferred)
        if raw is None:
            return None, None
        if raw.get("_corrupt"):
            return None, "anchor_b_corrupt"

        candidates = [hwid_hash]
        if alternate_hwid and alternate_hwid != hwid_hash:
            candidates.append(alternate_hwid)
        for cand_hwid in candidates:
            if RegistryAnchor._mac_matches(raw, cand_hwid):
                return raw, None
        return raw, "anchor_b_mac_mismatch"

    # ---- Anchor C ----
    def read_anchor_c(self, hwid_hash: str) -> Tuple[Optional[Dict[str, Any]], int, Optional[str]]:
        conn = None
        try:
            conn = self._db_conn_factory()
            init_license_tables(conn)
            exam_max_utc = get_max_exam_activity_utc(conn)
            row = conn.execute(
                "SELECT license_id, max_seen_utc, used_seconds, lock_state, "
                "active_exam_drain_until, vault_checksum, updated_at "
                "FROM local_license_state WHERE id = 1"
            ).fetchone()
            if not row:
                return None, exam_max_utc, None
            data = {
                "license_id": str(row["license_id"]),
                "max_seen_utc": int(row["max_seen_utc"]),
                "used_seconds": int(row["used_seconds"]),
                "lock_state": str(row["lock_state"]),
                "active_exam_drain_until": row["active_exam_drain_until"],
                "vault_checksum": str(row["vault_checksum"]),
            }
            return data, exam_max_utc, None
        except Exception as exc:
            logger.warning("Anchor C read error: %s", exc)
            return None, 0, "anchor_c_error"
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def verify_anchor_c_checksum(
        self,
        anchor_c: Dict[str, Any],
        tombstone_id: str,
        hwid_hash: str,
        alternate_hwid: Optional[str] = None,
    ) -> bool:
        actual = str(anchor_c.get("vault_checksum") or "")
        if not actual:
            return False
        candidates = [hwid_hash]
        if alternate_hwid and alternate_hwid != hwid_hash:
            candidates.append(alternate_hwid)
        for cand_hwid in candidates:
            expected = compute_anchor_mac(
                DB_CHECKSUM_DOMAIN,
                anchor_c["license_id"],
                anchor_c["max_seen_utc"],
                anchor_c["used_seconds"],
                anchor_c["lock_state"],
                tombstone_id,
                cand_hwid,
            )
            if hmac.compare_digest(actual, expected):
                return True
        return False

    def write_anchor_c(
        self,
        license_id: str,
        max_seen_utc: int,
        used_seconds: int,
        lock_state: str,
        active_exam_drain_until: Optional[int],
        tombstone_id: str,
        hwid_hash: str,
    ) -> None:
        checksum = compute_anchor_mac(
            DB_CHECKSUM_DOMAIN,
            license_id,
            max_seen_utc,
            used_seconds,
            lock_state,
            tombstone_id,
            hwid_hash,
        )
        conn = None
        try:
            conn = self._db_conn_factory()
            init_license_tables(conn)
            conn.execute(
                """
                INSERT INTO local_license_state
                    (id, license_id, max_seen_utc, used_seconds, lock_state,
                     active_exam_drain_until, vault_checksum, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    license_id = excluded.license_id,
                    max_seen_utc = excluded.max_seen_utc,
                    used_seconds = excluded.used_seconds,
                    lock_state = excluded.lock_state,
                    active_exam_drain_until = excluded.active_exam_drain_until,
                    vault_checksum = excluded.vault_checksum,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    license_id,
                    int(max_seen_utc),
                    int(used_seconds),
                    lock_state,
                    active_exam_drain_until,
                    checksum,
                ),
            )
            conn.commit()
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def clear_anchors(self) -> None:
        """
        Remove Anchor A files, Anchor B registry keys, and Anchor C SQLite row.
        Caller MUST verify the vault is NOT revoked and system clock is valid first.
        """
        for path in self._candidate_vault_paths():
            try:
                if os.path.isfile(path):
                    os.unlink(path)
            except OSError:
                pass
        self._resolved_vault_path = self._explicit_vault_path
        self.registry.clear()

        conn = None
        try:
            conn = self._db_conn_factory()
            init_license_tables(conn)
            conn.execute("DELETE FROM local_license_state")
            conn.commit()
        except Exception as exc:
            logger.warning("Failed clearing Anchor C SQLite row: %s", exc)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    # ---- Unified Atomic Seal ----
    def seal_all(self, state: Dict[str, Any], hwid_hash: str) -> Dict[str, Any]:
        """Persist state atomically across Anchor A (DPAPI), Anchor B (Registry), and Anchor C (SQLite)."""
        license_id = str(state["license_id"])
        max_seen_utc = int(state["max_seen_utc"])
        used_seconds = int(state["used_seconds"])
        lock_state = str(state.get("lock_state") or "ACTIVE")
        drain_until = state.get("active_exam_drain_until")
        tombstone = state.get("revocation_tombstone") or {}
        tombstone_id = str(
            (tombstone.get("tombstone") or {}).get("tombstone_id")
            or tombstone.get("tombstone_id")
            or ""
        )

        vault_path = self.write_anchor_a(state, hwid_hash)
        reg_target = self.registry.write(
            license_id=license_id,
            max_seen_utc=max_seen_utc,
            used_seconds=used_seconds,
            lock_state=lock_state,
            tombstone_id=tombstone_id,
            hwid_hash=hwid_hash,
        )
        self.write_anchor_c(
            license_id=license_id,
            max_seen_utc=max_seen_utc,
            used_seconds=used_seconds,
            lock_state=lock_state,
            active_exam_drain_until=drain_until,
            tombstone_id=tombstone_id,
            hwid_hash=hwid_hash,
        )
        return {
            "vault_path": vault_path,
            "registry_target": reg_target,
            "sqlite_anchor": "local_license_state",
        }

    # ---- Triple-Anchor Load & Anti-Tamper Reconciliation ----
    def load_and_reconcile(
        self,
        hwid_hash: str,
        now_utc: Optional[int] = None,
        current_fp: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Reads Anchor A, B, C and exam activity timestamps, returning a structured
        reconciliation report indicating whether the vault is unactivated, healthy,
        clock-tampered, anchor-tampered, or revoked.
        """
        now_ts = int(now_utc if now_utc is not None else time.time())
        anchor_a, err_a = self.read_anchor_a(hwid_hash, current_fp=current_fp)
        rebind_from_hwid = str((anchor_a or {}).get("_rebind_from_hwid") or "").strip() or None
        anchor_b, err_b = self.read_anchor_b(hwid_hash, alternate_hwid=rebind_from_hwid)
        anchor_c, exam_max_utc, err_c = self.read_anchor_c(hwid_hash)

        anchors_health = {
            "dpapi_vault": "ok" if (anchor_a is not None and not err_a) else (err_a or "missing"),
            "registry": "ok" if (anchor_b is not None and not err_b) else (err_b or "missing"),
            "sqlite": "ok" if (anchor_c is not None and not err_c) else (err_c or "missing"),
        }

        # Case 1: Completely fresh installation (no anchor exists anywhere)
        if anchor_a is None and err_a is None and anchor_b is None and err_b is None and anchor_c is None:
            return {
                "status": "UNACTIVATED",
                "state": None,
                "tamper_reason": None,
                "max_seen_utc": exam_max_utc,
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Case 2: Anchor A deleted while Anchor B or C exists (delete-and-reinstall attack)
        if anchor_a is None and err_a is None and (anchor_b is not None or anchor_c is not None):
            max_seen = max(
                int((anchor_b or {}).get("MaxSeenUtc") or 0),
                int((anchor_c or {}).get("max_seen_utc") or 0),
                exam_max_utc,
            )
            is_revoked_secondary = (
                (anchor_b and (anchor_b.get("LockState") == "HQ_REVOKED_LOCK" or bool(anchor_b.get("TombstoneId"))))
                or (anchor_c and anchor_c.get("lock_state") == "HQ_REVOKED_LOCK")
            )
            if is_revoked_secondary:
                return {
                    "status": "REVOKED",
                    "state": {
                        "license_id": (anchor_b or {}).get("LicenseId") or (anchor_c or {}).get("license_id"),
                        "lock_state": "HQ_REVOKED_LOCK",
                        "revocation_tombstone": {"tombstone_id": (anchor_b or {}).get("TombstoneId") or "TMB-HQ-REVOKED"},
                    },
                    "tamper_reason": None,
                    "max_seen_utc": max_seen,
                    "exam_max_utc": exam_max_utc,
                    "now_utc": now_ts,
                    "anchors": anchors_health,
                }
            return {
                "status": "TAMPERED",
                "state": None,
                "tamper_reason": "vault_deleted_while_secondary_anchors_present",
                "max_seen_utc": max_seen,
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Case 3: Anchor A corrupted or HMAC mismatch (edited or copied from another PC)
        if err_a is not None or anchor_a is None:
            max_seen = max(
                int((anchor_b or {}).get("MaxSeenUtc") or 0),
                int((anchor_c or {}).get("max_seen_utc") or 0),
                exam_max_utc,
            )
            is_revoked_secondary = (
                (anchor_b and (anchor_b.get("LockState") == "HQ_REVOKED_LOCK" or bool(anchor_b.get("TombstoneId"))))
                or (anchor_c and anchor_c.get("lock_state") == "HQ_REVOKED_LOCK")
            )
            if is_revoked_secondary:
                return {
                    "status": "REVOKED",
                    "state": {
                        "license_id": (anchor_b or {}).get("LicenseId") or (anchor_c or {}).get("license_id"),
                        "lock_state": "HQ_REVOKED_LOCK",
                        "revocation_tombstone": {"tombstone_id": (anchor_b or {}).get("TombstoneId") or "TMB-HQ-REVOKED"},
                    },
                    "tamper_reason": None,
                    "max_seen_utc": max_seen,
                    "exam_max_utc": exam_max_utc,
                    "now_utc": now_ts,
                    "anchors": anchors_health,
                }
            return {
                "status": "TAMPERED",
                "state": None,
                "tamper_reason": err_a or "anchor_a_invalid",
                "max_seen_utc": max_seen,
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        state = {k: v for k, v in anchor_a.items() if not str(k).startswith("_")}
        tombstone = state.get("revocation_tombstone") or {}
        tombstone_id = str(
            (tombstone.get("tombstone") or {}).get("tombstone_id")
            or tombstone.get("tombstone_id")
            or ""
        )

        # Verify Anchor B integrity if present
        if err_b is not None:
            return {
                "status": "TAMPERED",
                "state": state,
                "tamper_reason": err_b,
                "max_seen_utc": max(int(state.get("max_seen_utc") or 0), exam_max_utc),
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Verify Anchor C checksum if present
        if anchor_c is not None and not self.verify_anchor_c_checksum(
            anchor_c, tombstone_id, hwid_hash, alternate_hwid=rebind_from_hwid
        ):
            anchors_health["sqlite"] = "anchor_c_checksum_mismatch"
            return {
                "status": "TAMPERED",
                "state": state,
                "tamper_reason": "anchor_c_checksum_mismatch",
                "max_seen_utc": max(
                    int(state.get("max_seen_utc") or 0),
                    int(anchor_c.get("max_seen_utc") or 0),
                    exam_max_utc,
                ),
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Cross-anchor high-water-mark reconciliation (monotonically take the maximum)
        effective_max_seen = max(
            int(state.get("max_seen_utc") or 0),
            int((anchor_b or {}).get("MaxSeenUtc") or 0),
            int((anchor_c or {}).get("max_seen_utc") or 0),
            exam_max_utc,
        )
        effective_used = max(
            int(state.get("used_seconds") or 0),
            int((anchor_b or {}).get("UsedSeconds") or 0),
            int((anchor_c or {}).get("used_seconds") or 0),
        )
        state["max_seen_utc"] = effective_max_seen
        state["used_seconds"] = effective_used

        # Permanent revocation check across all anchors
        if (
            state.get("lock_state") == "HQ_REVOKED_LOCK"
            or (anchor_b and anchor_b.get("LockState") == "HQ_REVOKED_LOCK")
            or (anchor_c and anchor_c.get("lock_state") == "HQ_REVOKED_LOCK")
            or bool(tombstone_id)
            or bool((anchor_b or {}).get("TombstoneId"))
        ):
            state["lock_state"] = "HQ_REVOKED_LOCK"
            return {
                "status": "REVOKED",
                "state": state,
                "tamper_reason": None,
                "max_seen_utc": effective_max_seen,
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Clock rollback check (> 300s behind high-water-mark or recorded exam activity)
        if effective_max_seen > 0 and now_ts < (effective_max_seen - CLOCK_ROLLBACK_TOLERANCE_SECONDS):
            return {
                "status": "CLOCK_TAMPER",
                "state": state,
                "tamper_reason": "clock_rollback_detected",
                "max_seen_utc": effective_max_seen,
                "exam_max_utc": exam_max_utc,
                "now_utc": now_ts,
                "anchors": anchors_health,
            }

        # Auto-heal all 3 anchors cleanly after verified >=3/4 hardware component tolerance match
        if rebind_from_hwid and current_fp:
            try:
                state["hwid_hash"] = hwid_hash
                if current_fp.get("component_hashes"):
                    state["hw_component_hashes"] = current_fp["component_hashes"]
                self.seal_all(state, hwid_hash)
                logger.info(
                    "Seamlessly re-bound triple-anchor vault to updated HWID after >=3/4 component match."
                )
            except Exception as exc:
                logger.warning("Failed to persist HWID auto-rebind: %s", exc)

        return {
            "status": "OK",
            "state": state,
            "tamper_reason": None,
            "max_seen_utc": effective_max_seen,
            "exam_max_utc": exam_max_utc,
            "now_utc": now_ts,
            "anchors": anchors_health,
            "hwid_rebound": bool(rebind_from_hwid),
        }
