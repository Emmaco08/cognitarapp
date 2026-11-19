#!/usr/bin/env python3
"""
Cross-runtime Ed25519 verification check:
Signs a canonical lease payload in Python (`cryptography`) and verifies it in
Node.js using the compiled Electron Layer 5 verifier (`desktop/dist/main/license-bridge.js`),
asserting both valid signature acceptance and tampered payload rejection.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from cognitara.security.license_guard import canonical_json_bytes


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def main() -> int:
    priv = Ed25519PrivateKey.generate()
    pub_raw = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    pub_b64 = _b64u(pub_raw)

    payload = {
        "license_id": "LIC-CI-CROSS-CHECK",
        "plan_tier": "annual",
        "school_name": "CogniTara CI Academy",
        "hwid_hash": "ci-hwid-digest-001",
        "nested": {"b": 2, "a": 1},
    }
    sig_b64 = _b64u(priv.sign(canonical_json_bytes(payload)))
    valid_env = {"payload": payload, "ed25519_sig": sig_b64}

    tampered_payload = dict(payload, plan_tier="lifetime")
    tampered_env = {"payload": tampered_payload, "ed25519_sig": sig_b64}

    bridge_path = os.path.join(ROOT_DIR, "desktop", "dist", "main", "license-bridge.js")
    if not os.path.isfile(bridge_path):
        raise FileNotFoundError(f"Compiled Electron bridge not found: {bridge_path}")

    node_script = (
        "const { verifyEd25519LeaseInElectron } = require(process.argv[1]);\n"
        "const data = JSON.parse(process.argv[2]);\n"
        "const okRes = verifyEd25519LeaseInElectron(data.valid, data.pub);\n"
        "const badRes = verifyEd25519LeaseInElectron(data.tampered, data.pub);\n"
        "console.log(JSON.stringify({ okRes, badRes }));\n"
        "if (!okRes.ok || badRes.ok) process.exit(1);\n"
    )
    arg_payload = json.dumps({"valid": valid_env, "tampered": tampered_env, "pub": pub_b64})

    proc = subprocess.run(
        ["node", "-e", node_script, bridge_path, arg_payload],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        print("Cross-runtime Ed25519 check FAILED:", proc.stdout, proc.stderr, file=sys.stderr)
        return proc.returncode

    print("Cross-runtime Python <-> Electron Ed25519 check PASSED:", proc.stdout.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
