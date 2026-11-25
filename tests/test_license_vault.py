"""
CogniTara v2 — Comprehensive 5-Layer License Vault, Anti-Clock-Tamper,
15-Minute Active-Exam Drain & Internal Desktop Control API Test Suite
"""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from cognitara import create_app
from cognitara.database.connection import SafeRow
from cognitara.database.initialization import init_license_tables, init_phase4_6_schema
from cognitara.security.hwid import (
    compute_fingerprint_from_components,
    match_hardware_fingerprint,
)
from cognitara.security.license_guard import (
    GRACEFUL_DRAIN_SECONDS,
    LicenseGuard,
    export_ed25519_public_key_b64,
    is_testing_bypass_active,
    sign_canonical_ed25519,
)
from cognitara.security.vault_store import (
    RegistryAnchor,
    TripleAnchorVaultStore,
    decrypt_vault_bytes,
    encrypt_vault_bytes,
)


def _init_disposable_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            class TEXT,
            photo TEXT,
            status TEXT DEFAULT 'approved',
            full_name TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            class TEXT,
            photo TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            class TEXT,
            duration INTEGER DEFAULT 30,
            active INTEGER DEFAULT 1,
            deactivated INTEGER DEFAULT 0,
            calculator_type TEXT DEFAULT 'none',
            subject_tag TEXT DEFAULT 'Mathematics'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            question TEXT,
            option1 TEXT, option2 TEXT, option3 TEXT, option4 TEXT,
            answer TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            exam_id INTEGER,
            score INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            submitted INTEGER DEFAULT 0,
            status TEXT DEFAULT 'in_progress',
            start_time DATETIME,
            end_time DATETIME,
            last_heartbeat TIMESTAMP,
            remaining_time INTEGER DEFAULT 1800,
            warnings_count INTEGER DEFAULT 0,
            is_paused INTEGER DEFAULT 0,
            paused_at DATETIME,
            paused_by TEXT,
            pause_reason TEXT,
            authoritative_deadline DATETIME,
            time_adjust_delta INTEGER DEFAULT 0,
            time_adjusted_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ce_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target_class TEXT NOT NULL,
            duration INTEGER DEFAULT 60,
            passing_score INTEGER DEFAULT 50,
            active INTEGER DEFAULT 1,
            calculator_type TEXT DEFAULT 'none'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ce_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            question TEXT,
            answer TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ce_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            full_name TEXT,
            username TEXT UNIQUE,
            password TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ce_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            exam_id INTEGER,
            score INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            status TEXT DEFAULT 'in_progress',
            started_at DATETIME,
            completed_at DATETIME,
            last_heartbeat TIMESTAMP,
            remaining_time INTEGER DEFAULT 3600,
            warnings_count INTEGER DEFAULT 0,
            is_paused INTEGER DEFAULT 0,
            paused_at DATETIME,
            paused_by TEXT,
            pause_reason TEXT,
            authoritative_deadline DATETIME,
            time_adjust_delta INTEGER DEFAULT 0,
            time_adjusted_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    init_phase4_6_schema(conn)
    init_license_tables(conn)
    conn.commit()
    conn.close()


class _FakeClock:
    def __init__(self, start_utc: int | None = None, start_mono: float = 1000.0):
        import time as _t
        self.utc = float(start_utc if start_utc is not None else int(_t.time()))
        self.mono = float(start_mono)

    def get_utc(self) -> float:
        return self.utc

    def get_mono(self) -> float:
        return self.mono

    def advance(self, seconds: int) -> None:
        self.utc += seconds
        self.mono += seconds


def _build_signed_lease(
    priv_key: Ed25519PrivateKey,
    fp: dict,
    *,
    license_id: str = "lic_01TESTVAULT001",
    plan_tier: str = "annual",
    issued_utc: int | None = None,
    paid_duration_seconds: int | None = 365 * 86400,
    lease_seconds: int = 30 * 86400,
) -> dict:
    import time as _t
    issued_ts = int(issued_utc if issued_utc is not None else _t.time())
    issued_iso = datetime.fromtimestamp(issued_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    expires_iso = (
        datetime.fromtimestamp(issued_ts + paid_duration_seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if paid_duration_seconds is not None
        else None
    )
    payload = {
        "license_id": license_id,
        "license_key": "CGNT-84K2-91MP-Q7RX-V3N8",
        "school_id": "sch_01TEST0001",
        "school_name": "CogniTara High School",
        "plan_tier": plan_tier,
        "issued_at": issued_iso,
        "expires_at": expires_iso,
        "paid_duration_seconds": paid_duration_seconds,
        "bonus_days_applied": 0,
        "lease_seconds": lease_seconds,
        "hwid_hash": fp["hwid_hash"],
        "hw_component_hashes": fp["component_hashes"],
        "features": {"max_concurrent_stations": 300, "ce_portal": True},
    }
    return {
        "schema_version": 2,
        "key_id": "ct-ed25519-test-01",
        "payload": payload,
        "ed25519_sig": sign_canonical_ed25519(payload, priv_key),
    }


def _make_guard(tmp_path, *, clock: _FakeClock | None = None, components: dict | None = None):
    db_path = str(tmp_path / "exam_test.db")
    _init_disposable_db(db_path)

    def db_factory():
        conn = sqlite3.connect(db_path)
        conn.row_factory = SafeRow
        return conn

    priv = Ed25519PrivateKey.generate()
    pub_b64 = export_ed25519_public_key_b64(priv.public_key())
    base_comp = components or {
        "smbios_uuid": "11111111-2222-3333-4444-555555555555",
        "cpu_id": "BFEBFBFF000906EA",
        "disk_serial": "WD-WCAV12345678",
        "machine_guid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }
    current_comp = dict(base_comp)
    clk = clock or _FakeClock()

    vault_file = str(tmp_path / "vault" / "license_vault.bin")
    reg_file = str(tmp_path / "reg" / "registry_anchor.json")
    reg = RegistryAnchor(fallback_file=reg_file, force_file_backend=True)
    store = TripleAnchorVaultStore(db_conn_factory=db_factory, vault_path=vault_file, registry_anchor=reg)
    guard = LicenseGuard(
        vault_store=store,
        db_conn_factory=db_factory,
        public_key_b64=pub_b64,
        hwid_provider=lambda: compute_fingerprint_from_components(current_comp),
        clock_utc=clk.get_utc,
        clock_monotonic=clk.get_mono,
    )
    return {
        "guard": guard,
        "store": store,
        "priv": priv,
        "pub_b64": pub_b64,
        "fp": compute_fingerprint_from_components(current_comp),
        "current_comp": current_comp,
        "clock": clk,
        "db_path": db_path,
        "vault_file": vault_file,
        "reg_file": reg_file,
    }


# =============================================================================
# Layer 1 & Layer 2 Tests: Ed25519 & HWID (>= 3/4 Tolerance)
# =============================================================================

def test_ed25519_valid_lease_and_tamper_rejection(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    res = env["guard"].activate_lease(lease)
    assert res["ok"] is True
    assert res["status"]["lock_state"] == "ACTIVE"
    assert res["status"]["is_licensed"] is True

    # Tamper 1 byte in payload -> must fail closed
    tampered = json.loads(json.dumps(lease))
    tampered["payload"]["school_name"] = "Tampered High School"
    bad = env["guard"].activate_lease(tampered)
    assert bad["ok"] is False
    assert bad["error"] == "invalid_ed25519_signature"


def test_hwid_exact_and_3_of_4_repair_tolerance(tmp_path):
    orig_comp = {
        "smbios_uuid": "AAAA-1111",
        "cpu_id": "CPU-2222",
        "disk_serial": "DISK-3333",
        "machine_guid": "guid-4444",
    }
    fp_orig = compute_fingerprint_from_components(orig_comp)
    assert fp_orig["display_hwid"].startswith("CT-HWID-")

    # Swap 1 component (SSD replacement) -> 3/4 match -> allowed
    repaired_comp = dict(orig_comp, disk_serial="NEW-NVME-9999")
    fp_repaired = compute_fingerprint_from_components(repaired_comp)
    matched, count, reason = match_hardware_fingerprint(
        fp_orig["hwid_hash"], fp_repaired, fp_orig["component_hashes"], min_component_matches=3
    )
    assert matched is True
    assert count == 3
    assert reason == "component_tolerance_match"

    # Swap 2 components (cloned to another PC) -> 2/4 match -> rejected
    cloned_comp = dict(orig_comp, disk_serial="OTHER-DISK", smbios_uuid="OTHER-BIOS")
    fp_cloned = compute_fingerprint_from_components(cloned_comp)
    matched2, count2, reason2 = match_hardware_fingerprint(
        fp_orig["hwid_hash"], fp_cloned, fp_orig["component_hashes"], min_component_matches=3
    )
    assert matched2 is False
    assert count2 == 2
    assert reason2 == "hwid_mismatch"


def test_hwid_mismatch_locks_activated_vault(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Simulate copying vault onto a completely different machine (change 3/4 components)
    other_fp = compute_fingerprint_from_components({
        "smbios_uuid": "DIFFERENT-BIOS",
        "cpu_id": "DIFFERENT-CPU",
        "disk_serial": "DIFFERENT-DISK",
        "machine_guid": "different-guid",
    })
    bad_lease = _build_signed_lease(env["priv"], other_fp)
    res = env["guard"].activate_lease(bad_lease)
    assert res["ok"] is False
    assert res["error"] == "hwid_mismatch"


# =============================================================================
# Layer 3 Tests: DPAPI/AES Vault, Monotonic Counter & Anti-Clock-Tamper
# =============================================================================

def test_dpapi_or_aes_vault_roundtrip():
    secret_payload = b'{"license_id":"lic_123","used_seconds":42}'
    ct = encrypt_vault_bytes(secret_payload, "hwid_abc")
    assert ct != secret_payload
    pt = decrypt_vault_bytes(ct, "hwid_abc")
    assert pt == secret_payload


def test_monotonic_accumulation_and_clock_rollback_tamper(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Advance 120s normally
    env["clock"].advance(120)
    st = env["guard"].evaluate(advance_monotonic=True)
    assert st["lock_state"] == "ACTIVE"
    assert st["used_seconds"] == 120

    # Roll wall clock back by 301 seconds (>300s threshold)
    env["clock"].utc -= 301
    tampered = env["guard"].evaluate(advance_monotonic=False)
    assert tampered["lock_state"] == "CLOCK_TAMPER_LOCK"
    assert tampered["tamper_reason"] == "clock_rollback_detected"


def test_vault_deletion_with_secondary_anchors_trips_tamper(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Delete Anchor A while Anchor B (Registry) and Anchor C (SQLite) remain
    os.remove(env["vault_file"])
    st = env["guard"].evaluate(advance_monotonic=False)
    assert st["lock_state"] == "CLOCK_TAMPER_LOCK"
    assert st["tamper_reason"] == "vault_deleted_while_secondary_anchors_present"


def test_registry_and_sqlite_anchor_tampering_detected(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Manually edit Anchor B (Registry) without valid AnchorMac
    with open(env["reg_file"], "r", encoding="utf-8") as f:
        reg_data = json.load(f)
    reg_data["UsedSeconds"] = 0
    reg_data["MaxSeenUtc"] = 100
    with open(env["reg_file"], "w", encoding="utf-8") as f:
        json.dump(reg_data, f)

    st = env["guard"].evaluate(advance_monotonic=False)
    assert st["lock_state"] == "CLOCK_TAMPER_LOCK"
    assert st["tamper_reason"] == "anchor_b_mac_mismatch"


def test_exam_timestamp_cross_check_catches_clock_rollback(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Insert an exam score timestamp 2 hours ahead of the current system clock
    future_iso = datetime.fromtimestamp(env["clock"].utc + 7200, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(env["db_path"])
    conn.execute("INSERT INTO scores (student_id, exam_id, status, start_time, updated_at) VALUES (1, 1, 'completed', ?, ?)", (future_iso, future_iso))
    conn.commit()
    conn.close()

    st = env["guard"].evaluate(advance_monotonic=False)
    assert st["lock_state"] == "CLOCK_TAMPER_LOCK"


# =============================================================================
# Layer 4 Tests: Signed Revocation Tombstone (Permanent Offline Burn)
# =============================================================================

def test_revocation_tombstone_burns_permanently(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    tombstone_body = {
        "schema_version": 2,
        "tombstone_id": "tmb_01JXZ99887766",
        "school_id": "sch_01TEST0001",
        "license_id": "lic_01TESTVAULT001",
        "reason_code": "TOS_VIOLATION_NONPAYMENT",
        "reason_detail": "License permanently revoked by CogniTara HQ.",
        "revoked_at": "2026-11-20T14:22:10Z",
        "effective_immediately": True,
    }
    tomb_env = {
        "status": "REVOKED",
        "tombstone": tombstone_body,
        "ed25519_sig": sign_canonical_ed25519(tombstone_body, env["priv"]),
    }

    # Forged tombstone must be rejected
    bad_tomb = json.loads(json.dumps(tomb_env))
    bad_tomb["tombstone"]["reason_code"] = "FORGED"
    assert env["guard"].apply_revocation_tombstone(bad_tomb)["ok"] is False

    # Valid tombstone burns into all 3 anchors
    burn = env["guard"].apply_revocation_tombstone(tomb_env)
    assert burn["ok"] is True
    assert burn["status"]["lock_state"] == "HQ_REVOKED_LOCK"

    # Re-activating the revoked license must fail
    react = env["guard"].activate_lease(lease)
    assert react["ok"] is False
    assert react["error"] == "license_revoked_by_hq"


# =============================================================================
# Layer 5 Tests: 15-Minute Graceful Active-Exam Drain & Flask Request Gating
# =============================================================================

def test_15_minute_graceful_active_exam_drain_and_flask_enforcement(tmp_path, monkeypatch):
    env = _make_guard(tmp_path)
    # Monthly lease lasting 1000 seconds for fast test
    lease = _build_signed_lease(
        env["priv"],
        env["fp"],
        plan_tier="monthly",
        paid_duration_seconds=1000,
        lease_seconds=7 * 86400,
    )
    assert env["guard"].activate_lease(lease)["ok"] is True

    # Seed an active in-progress exam attempt
    conn = sqlite3.connect(env["db_path"])
    conn.execute("INSERT INTO students (username, password, class, status, full_name) VALUES ('stu1', 'hash', 'JSS 1', 'approved', 'Ada Student')")
    conn.execute("INSERT INTO exams (name, class, duration, active) VALUES ('Math CA', 'JSS 1', 30, 1)")
    conn.execute("INSERT INTO scores (student_id, exam_id, status, remaining_time) VALUES (1, 1, 'in_progress', 900)")
    conn.commit()
    conn.close()

    # Expire the paid duration while student is actively writing
    env["clock"].advance(1005)
    st_drain = env["guard"].evaluate(advance_monotonic=True)
    assert st_drain["lock_state"] == "DRAINING"
    assert st_drain["is_draining"] is True
    assert st_drain["drain_remaining_seconds"] == GRACEFUL_DRAIN_SECONDS
    assert st_drain["allow_new_exams"] is False

    # Wire into Flask with strict enforcement enabled
    monkeypatch.setenv("COGNITARA_TESTING_BYPASS_LICENSE", "0")
    app = create_app({
        "TESTING": True,
        "ENFORCE_LICENSE": True,
        "WTF_CSRF_ENABLED": False,
        "DATABASE_NAME": env["db_path"],
        "SECRET_KEY": "test-secret",
    })
    app.extensions["license_guard"] = env["guard"]
    client = app.test_client()

    # Health check stays 200
    assert client.get("/health").status_code == 200
    # New logins are blocked (403) during DRAINING
    assert client.get("/login").status_code == 403
    # Active-exam heartbeat endpoint is NOT blocked by license guard during DRAINING
    hb_resp = client.post("/exam_heartbeat", json={})
    assert hb_resp.status_code != 403

    # Advance past the 15-minute (900s) drain window -> hard EXPIRED_LOCK
    env["clock"].advance(GRACEFUL_DRAIN_SECONDS + 5)
    st_expired = env["guard"].evaluate(advance_monotonic=True)
    assert st_expired["lock_state"] == "EXPIRED_LOCK"
    assert client.post("/exam_heartbeat", json={}).status_code == 403


def test_testing_bypass_strictly_disabled_when_frozen_or_not_testing(tmp_path, monkeypatch):
    app_prod = create_app({"TESTING": False, "SECRET_KEY": "s"})
    monkeypatch.setenv("COGNITARA_TESTING_BYPASS_LICENSE", "1")
    assert is_testing_bypass_active(app_prod) is False

    app_test = create_app({"TESTING": True, "SECRET_KEY": "s"})
    assert is_testing_bypass_active(app_test) is True

    # Simulate PyInstaller frozen binary -> bypass MUST be strictly disabled
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert is_testing_bypass_active(app_test) is False


# =============================================================================
# Internal Desktop Control API Tests (Token Auth, Hot Backup, Setup, Live Exams)
# =============================================================================

def test_internal_desktop_api_auth_backups_and_setup(tmp_path):
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    token = secrets.token_hex(24)
    backup_dir = str(tmp_path / "backups")

    app = create_app({
        "TESTING": True,
        "ENFORCE_LICENSE": True,
        "WTF_CSRF_ENABLED": False,
        "DATABASE_NAME": env["db_path"],
        "DESKTOP_CONTROL_TOKEN": token,
        "BACKUP_DIR": backup_dir,
        "SECRET_KEY": "test-secret",
    })
    app.extensions["license_guard"] = env["guard"]
    client = app.test_client()
    headers = {"X-CogniTara-Desktop-Token": token}

    # Missing or wrong token rejected
    assert client.get("/api/internal/license-status").status_code == 401
    assert client.get("/api/internal/license-status", headers={"X-CogniTara-Desktop-Token": "wrong"}).status_code == 401

    # Non-loopback remote_addr rejected
    assert client.get(
        "/api/internal/license-status",
        headers=headers,
        environ_base={"REMOTE_ADDR": "192.168.1.50"},
    ).status_code == 403

    # Valid loopback request succeeds
    r_lic = client.get("/api/internal/license-status", headers=headers)
    assert r_lic.status_code == 200
    assert r_lic.get_json()["license"]["lock_state"] == "ACTIVE"

    # Setup school profile
    r_sch = client.post(
        "/api/internal/setup/school",
        headers=headers,
        json={
            "school_name": "Luminary Academy Lagos",
            "school_motto": "Truth & Clarity",
            "academic_session": "2026/2027",
            "current_term": "Second Term",
        },
    )
    assert r_sch.status_code == 200
    assert r_sch.get_json()["school"]["school_name"] == "Luminary Academy Lagos"

    # Setup super admin + hashed recovery codes
    r_adm = client.post(
        "/api/internal/setup/superadmin",
        headers=headers,
        json={
            "username": "superadmin",
            "password": "StrongPassword!2026",
            "recovery_codes": ["ABCD-1234", "EFGH-5678"],
        },
    )
    assert r_adm.status_code == 200
    assert r_adm.get_json()["recovery_codes_saved"] == 2

    # Hot SQLite backup & list & restore
    r_bk = client.post("/api/internal/hot-backup", headers=headers, json={"type": "manual"})
    assert r_bk.status_code == 200
    bk_name = r_bk.get_json()["backup"]["filename"]
    assert os.path.isfile(os.path.join(backup_dir, bk_name))

    r_list = client.get("/api/internal/backups", headers=headers)
    assert r_list.status_code == 200
    assert any(b["filename"] == bk_name for b in r_list.get_json()["backups"])

    r_restore = client.post("/api/internal/backups/restore", headers=headers, json={"filename": bk_name})
    assert r_restore.status_code == 200
    assert r_restore.get_json()["restored_from"] == bk_name


def test_hwid_1_of_4_drift_auto_heals_triple_anchors_without_false_clock_lock(tmp_path):
    """
    Replacing 1 of 4 hardware components (e.g. SSD swap or transient WMI disk change)
    must seamlessly re-seal Anchor A, B, and C without triggering a false clock tamper lock,
    while preserving monotonic used_seconds and max_seen_utc.
    """
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    env["clock"].advance(300)
    st1 = env["guard"].evaluate(advance_monotonic=True)
    assert st1["lock_state"] == "ACTIVE"
    assert st1["used_seconds"] == 300

    # Simulate 1-of-4 component change (e.g. disk serial shifts on Windows)
    env["current_comp"]["disk_serial"] = "NVME-REPLACED-9999"
    env["clock"].advance(60)
    st2 = env["guard"].evaluate(advance_monotonic=True)
    assert st2["lock_state"] == "ACTIVE"
    assert st2["is_licensed"] is True
    assert st2["is_clock_rollback"] is False
    assert st2["used_seconds"] == 360

    # Subsequent evaluation under the new HWID stays clean and verified
    env["clock"].advance(60)
    st3 = env["guard"].evaluate(advance_monotonic=True)
    assert st3["lock_state"] == "ACTIVE"
    assert st3["used_seconds"] == 420

    # Meanwhile changing 2+ components (cloning to another PC) STILL fails closed
    env["current_comp"]["smbios_uuid"] = "CLONED-PC-BIOS"
    env["current_comp"]["cpu_id"] = "CLONED-PC-CPU"
    st4 = env["guard"].evaluate(advance_monotonic=False)
    assert st4["lock_state"] in ("CLOCK_TAMPER_LOCK", "HWID_MISMATCH_LOCK")
    assert st4["is_licensed"] is False
    assert st4["is_clock_rollback"] is False
    assert st4["can_repair_vault"] is True


def test_repair_corrupt_vault_allowed_only_when_clock_valid_and_not_revoked(tmp_path):
    """
    When a local vault is mismatched/legacy while the system clock IS valid and NOT revoked,
    repair_or_reset_corrupt_vault() cleanly returns to UNACTIVATED so the user can re-activate.
    Genuine clock rollback and HQ revocation tombstones MUST strictly refuse repair.
    """
    env = _make_guard(tmp_path)
    lease = _build_signed_lease(env["priv"], env["fp"])
    assert env["guard"].activate_lease(lease)["ok"] is True

    # 1. Corrupt Anchor A while clock is completely valid (10 minutes forward)
    with open(env["vault_file"], "wb") as f:
        f.write(b"CORRUPT-LEGACY-VAULT-BYTES")
    env["clock"].advance(600)

    locked = env["guard"].evaluate(advance_monotonic=False)
    assert locked["lock_state"] == "CLOCK_TAMPER_LOCK"
    assert locked["is_clock_rollback"] is False
    assert locked["can_repair_vault"] is True

    # Repair via internal desktop API succeeds and returns clean UNACTIVATED state
    token = secrets.token_hex(16)
    app = create_app({
        "TESTING": True,
        "ENFORCE_LICENSE": True,
        "WTF_CSRF_ENABLED": False,
        "DATABASE_NAME": env["db_path"],
        "DESKTOP_CONTROL_TOKEN": token,
        "SECRET_KEY": "test-secret",
    })
    app.extensions["license_guard"] = env["guard"]
    client = app.test_client()
    r_rep = client.post("/api/internal/license/repair-vault", headers={"X-CogniTara-Desktop-Token": token})
    assert r_rep.status_code == 200
    assert r_rep.get_json()["ok"] is True
    assert r_rep.get_json()["status"]["lock_state"] == "UNACTIVATED"

    # Re-activate cleanly after repair
    assert env["guard"].activate_lease(lease)["ok"] is True

    # 2. Genuine clock rollback MUST strictly refuse repair
    env["clock"].utc -= 1200
    rolled = env["guard"].evaluate(advance_monotonic=False)
    assert rolled["lock_state"] == "CLOCK_TAMPER_LOCK"
    assert rolled["is_clock_rollback"] is True
    assert rolled["can_repair_vault"] is False
    r_refuse_clock = client.post("/api/internal/license/repair-vault", headers={"X-CogniTara-Desktop-Token": token})
    assert r_refuse_clock.status_code == 403
    assert r_refuse_clock.get_json()["error"] == "clock_rollback_detected"

    # Restore valid clock
    env["clock"].utc += 1500
    assert env["guard"].evaluate(advance_monotonic=False)["lock_state"] == "ACTIVE"

    # 3. Permanent HQ revocation MUST strictly refuse repair
    tombstone_body = {
        "schema_version": 2,
        "tombstone_id": "tmb_01REPAIRBLOCK",
        "school_id": "sch_01TEST0001",
        "license_id": "lic_01TESTVAULT001",
        "reason_code": "CHARGEBACK",
        "reason_detail": "Revoked by HQ",
        "revoked_at": "2026-11-25T00:00:00Z",
        "effective_immediately": True,
    }
    tomb_env = {
        "status": "REVOKED",
        "tombstone": tombstone_body,
        "ed25519_sig": sign_canonical_ed25519(tombstone_body, env["priv"]),
    }
    assert env["guard"].apply_revocation_tombstone(tomb_env)["ok"] is True
    r_refuse_rev = client.post("/api/internal/license/repair-vault", headers={"X-CogniTara-Desktop-Token": token})
    assert r_refuse_rev.status_code == 403
    assert r_refuse_rev.get_json()["error"] == "license_revoked_by_hq"

