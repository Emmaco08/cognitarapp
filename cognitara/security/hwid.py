"""
CogniTara v2 — Layer 2 Hardware Fingerprint Binding (cognitara/security/hwid.py)

Computes a deterministic HMAC-SHA256 hardware fingerprint from 4 machine identifiers:
  1. SMBIOS UUID (Win32_ComputerSystemProduct.UUID)
  2. CPU ProcessorId (Win32_Processor.ProcessorId)
  3. Primary physical boot disk serial (Win32_DiskDrive Index=0)
  4. Windows MachineGuid (HKLM\\SOFTWARE\\Microsoft\\Cryptography\\MachineGuid)

Supports >= 3/4 component tolerance so routine hardware repairs (such as an SSD
swap) do not lock out a legitimate school server, while cloning to another PC
(<= 2/4 matches) triggers HWID_MISMATCH_LOCK.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import platform
import socket
import subprocess
import sys
import uuid
from typing import Dict, Optional, Tuple

logger = logging.getLogger("cognitara.security.hwid")

APP_HWID_PEPPER = b"CogniTara-HWID-Pepper-v2-2026"
COMPONENT_KEYS = ("smbios_uuid", "cpu_id", "disk_serial", "machine_guid")

_CACHED_FINGERPRINT: Optional[dict] = None


def _run_hidden_cmd(args: list[str], timeout: float = 4.0) -> str:
    """Run a command without flashing a console window on Windows."""
    kwargs: dict = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.DEVNULL,
        "text": True,
        "timeout": timeout,
        "check": False,
    }
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        kwargs["creationflags"] = creationflags
    try:
        proc = subprocess.run(args, **kwargs)
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout.strip()
    except Exception as exc:
        logger.debug("HWID probe command failed (%s): %s", args[0], exc)
    return ""


def _read_winreg_value(subkey: str, value_name: str) -> str:
    if sys.platform != "win32":
        return ""
    try:
        import winreg  # type: ignore

        access = winreg.KEY_READ | getattr(winreg, "KEY_WOW64_64KEY", 0)
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey, 0, access) as key:
            val, _ = winreg.QueryValueEx(key, value_name)
            if val is not None:
                return str(val).strip()
    except Exception:
        pass
    return ""


def _read_windows_machine_guid() -> str:
    return _read_winreg_value(r"SOFTWARE\Microsoft\Cryptography", "MachineGuid")


def _read_windows_registry_fallbacks() -> Tuple[str, str, str]:
    """
    Instant, zero-subprocess Windows Registry fallbacks for SMBIOS, CPU, and
    machine profile identifiers. Completely immune to PowerShell cold-start
    timeouts and volatile network/VPN MAC addresses (`uuid.getnode()`).
    """
    if sys.platform != "win32":
        return "", "", ""

    hw_profile = _read_winreg_value(
        r"SYSTEM\CurrentControlSet\Control\IDConfigDB\Hardware Profiles\0001",
        "HwProfileGuid",
    )
    bios_vendor = _read_winreg_value(r"HARDWARE\DESCRIPTION\System\BIOS", "SystemManufacturer")
    bios_product = _read_winreg_value(r"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName")
    board_product = _read_winreg_value(r"HARDWARE\DESCRIPTION\System\BIOS", "BaseBoardProduct")
    smbios_fallback = "|".join(p for p in (hw_profile, bios_vendor, bios_product, board_product) if p)

    cpu_name = _read_winreg_value(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString")
    cpu_ident = _read_winreg_value(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "Identifier")
    cpu_fallback = cpu_name or cpu_ident or os.environ.get("PROCESSOR_IDENTIFIER", "")

    machine_guid = _read_windows_machine_guid()
    disk_fallback = f"WIN-REG-DISK-{machine_guid}" if machine_guid else ""
    return smbios_fallback, cpu_fallback, disk_fallback


def _read_windows_cim_batch() -> Tuple[str, str, str]:
    """
    Collect SMBIOS UUID, CPU ProcessorId, and primary internal physical disk
    serial in a single non-interactive PowerShell CIM call (zero console window).
    Excludes USB/removable drives so plugging in flash drives never shifts HWID.
    """
    if sys.platform != "win32":
        return "", "", ""

    ps_script = (
        "$ErrorActionPreference='SilentlyContinue';"
        "$u=(Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1 -ExpandProperty UUID);"
        "$c=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId);"
        "$disks=(Get-CimInstance Win32_DiskDrive | Where-Object { $_.InterfaceType -ne 'USB' -and $_.MediaType -notmatch 'Removable' } | Sort-Object Index);"
        "$d=($disks | Where-Object { $_.Index -eq 0 } | Select-Object -First 1 -ExpandProperty SerialNumber);"
        "if (-not $d) { $d=($disks | Select-Object -First 1 -ExpandProperty SerialNumber) };"
        "if (-not $d) { $d=(Get-CimInstance Win32_DiskDrive | Sort-Object Index | Select-Object -First 1 -ExpandProperty SerialNumber) };"
        "Write-Output (\"$u`n$c`n$d\")"
    )
    out = _run_hidden_cmd(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
        timeout=12.0,
    )
    if out:
        lines = [line.strip() for line in out.splitlines()]
        smbios = lines[0] if len(lines) > 0 else ""
        cpu = lines[1] if len(lines) > 1 else ""
        disk = lines[2] if len(lines) > 2 else ""
        return smbios, cpu, disk

    return "", "", ""


def _read_first_file(paths: Tuple[str, ...]) -> str:
    for path in paths:
        try:
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    val = f.read().strip()
                    if val:
                        return val
        except OSError:
            continue
    return ""


def _collect_linux_components() -> Dict[str, str]:
    smbios = _read_first_file((
        "/sys/class/dmi/id/product_uuid",
        "/sys/devices/virtual/dmi/id/product_uuid",
        "/sys/class/dmi/id/board_serial",
    ))
    machine_guid = _read_first_file((
        "/etc/machine-id",
        "/var/lib/dbus/machine-id",
    ))

    cpu_id = ""
    try:
        if os.path.isfile("/proc/cpuinfo"):
            lines = []
            with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    lower = line.lower()
                    if any(
                        lower.startswith(prefix)
                        for prefix in ("vendor_id", "cpu family", "model\t", "model name", "stepping", "serial")
                    ):
                        lines.append(line.strip())
                    if len(lines) >= 8:
                        break
            if lines:
                cpu_id = hashlib.sha256("|".join(lines).encode("utf-8")).hexdigest()[:16]
    except OSError:
        pass

    disk_serial = ""
    try:
        if os.path.isdir("/sys/block"):
            for dev in sorted(os.listdir("/sys/block")):
                if dev.startswith(("loop", "ram", "dm-")):
                    continue
                candidate = _read_first_file((
                    f"/sys/block/{dev}/device/serial",
                    f"/sys/block/{dev}/device/wwid",
                ))
                if candidate:
                    disk_serial = candidate
                    break
    except OSError:
        pass

    host_fallback = socket.gethostname() or "cognitara-host"
    node_fallback = f"{uuid.getnode():012x}"

    return {
        "smbios_uuid": smbios or f"LINUX-HOST-{host_fallback}",
        "cpu_id": cpu_id or (platform.processor() or platform.machine() or "CPU-GENERIC"),
        "disk_serial": disk_serial or f"DISK-{node_fallback}",
        "machine_guid": machine_guid or f"node-{node_fallback}",
    }


def _collect_raw_components() -> Dict[str, str]:
    if sys.platform == "win32":
        smbios, cpu, disk = _read_windows_cim_batch()
        reg_smbios, reg_cpu, reg_disk = _read_windows_registry_fallbacks()
        machine_guid = _read_windows_machine_guid()
        host_fallback = socket.gethostname() or "WIN-HOST"
        return {
            "smbios_uuid": smbios or reg_smbios or f"WIN-HOST-{host_fallback}",
            "cpu_id": cpu or reg_cpu or platform.processor() or "WIN-CPU",
            "disk_serial": disk or reg_disk or f"WIN-DISK-{host_fallback}",
            "machine_guid": machine_guid or f"win-host-{host_fallback}",
        }
    return _collect_linux_components()


def _normalize_components(components: Dict[str, str]) -> Dict[str, str]:
    return {
        "smbios_uuid": str(components.get("smbios_uuid") or "").strip().upper(),
        "cpu_id": str(components.get("cpu_id") or "").strip().upper(),
        "disk_serial": str(components.get("disk_serial") or "").strip().upper(),
        "machine_guid": str(components.get("machine_guid") or "").strip().lower(),
    }


def compute_fingerprint_from_components(components: Dict[str, str]) -> dict:
    """
    Deterministically compute `hwid_hash`, `display_hwid`, and individual
    domain-separated `component_hashes` from the 4 normalized hardware values.
    """
    norm = _normalize_components(components)
    raw = "|".join([
        norm["smbios_uuid"],
        norm["cpu_id"],
        norm["disk_serial"],
        norm["machine_guid"],
    ])
    hwid_hash = hmac.new(APP_HWID_PEPPER, raw.encode("utf-8"), hashlib.sha256).hexdigest()
    display_hwid = f"CT-HWID-{hwid_hash[:4].upper()}-{hwid_hash[4:8].upper()}-{hwid_hash[8:12].upper()}"

    component_hashes: Dict[str, str] = {}
    for key in COMPONENT_KEYS:
        val = norm[key]
        component_hashes[key] = hmac.new(
            APP_HWID_PEPPER,
            f"{key}:{val}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    return {
        "hwid_hash": hwid_hash,
        "display_hwid": display_hwid,
        "component_hashes": component_hashes,
        "hostname": socket.gethostname() or "localhost",
        "os_version": f"{platform.system()} {platform.release()}".strip(),
    }


def get_hardware_fingerprint(
    force_refresh: bool = False,
    override_components: Optional[Dict[str, str]] = None,
) -> dict:
    """
    Return the current machine's deterministic hardware fingerprint.
    Caches the OS-detected fingerprint per process to avoid repeated WMI calls.
    """
    global _CACHED_FINGERPRINT
    if override_components is not None:
        return compute_fingerprint_from_components(override_components)
    if _CACHED_FINGERPRINT is None or force_refresh:
        raw = _collect_raw_components()
        _CACHED_FINGERPRINT = compute_fingerprint_from_components(raw)
    return dict(_CACHED_FINGERPRINT)


def match_hardware_fingerprint(
    expected_hwid_hash: str,
    current_fp: dict,
    expected_component_hashes: Optional[Dict[str, str]] = None,
    min_component_matches: int = 3,
) -> Tuple[bool, int, str]:
    """
    Verify whether `current_fp` matches `expected_hwid_hash` exactly, or satisfies
    the >= 3/4 component tolerance rule for hardware repairs.

    Returns:
        (is_match, matched_components_count, reason_code)
    """
    current_hash = str(current_fp.get("hwid_hash") or "").strip().lower()
    expected_clean = str(expected_hwid_hash or "").strip().lower()

    if expected_clean and current_hash and hmac.compare_digest(expected_clean, current_hash):
        return True, len(COMPONENT_KEYS), "exact_match"

    if isinstance(expected_component_hashes, dict) and expected_component_hashes:
        current_comp = current_fp.get("component_hashes") or {}
        matches = 0
        for key in COMPONENT_KEYS:
            exp_val = str(expected_component_hashes.get(key) or "").strip().lower()
            cur_val = str(current_comp.get(key) or "").strip().lower()
            if exp_val and cur_val and hmac.compare_digest(exp_val, cur_val):
                matches += 1
        if matches >= min_component_matches:
            return True, matches, "component_tolerance_match"
        return False, matches, "hwid_mismatch"

    return False, 0, "hwid_mismatch"
