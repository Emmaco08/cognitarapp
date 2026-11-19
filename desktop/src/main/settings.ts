import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import { NetworkAdapterInfo, StudioSettings } from "./types";

const SETTINGS_FILENAME = "studio-settings.json";

export function getDefaultDataDir(): string {
  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    const candidate = path.join(programData, "CogniTara", "data");
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      const localFallback = path.join(app.getPath("userData"), "data");
      fs.mkdirSync(localFallback, { recursive: true });
      return localFallback;
    }
  }
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDefaultBackupDir(): string {
  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    const candidate = path.join(programData, "CogniTara", "Backups");
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      const localFallback = path.join(app.getPath("userData"), "Backups");
      fs.mkdirSync(localFallback, { recursive: true });
      return localFallback;
    }
  }
  const dir = path.join(app.getPath("userData"), "Backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultSettings(): StudioSettings {
  const adapters = listNetworkAdapters();
  const primary = adapters.find((a) => a.recommended)?.ip || adapters[0]?.ip || "127.0.0.1";
  return {
    theme: "dark",
    startWithWindows: true,
    autoStartServer: false,
    port: 5000,
    lanOnly: true,
    backupSchedule: "30m",
    backupDir: getDefaultBackupDir(),
    selectedLanIp: primary,
    onboardingComplete: false,
    adminFullName: "",
    adminUsername: "superadmin",
  };
}

export function loadSettings(): StudioSettings {
  const defaults = defaultSettings();
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILENAME);
  try {
    if (!fs.existsSync(filePath)) {
      return defaults;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StudioSettings>;
    return {
      ...defaults,
      ...parsed,
      port:
        typeof parsed.port === "number" && parsed.port >= 1024 && parsed.port <= 65535
          ? Math.floor(parsed.port)
          : defaults.port,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: StudioSettings): StudioSettings {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILENAME);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function listNetworkAdapters(): NetworkAdapterInfo[] {
  const ifaces = os.networkInterfaces();
  const results: NetworkAdapterInfo[] = [];
  const seen = new Set<string>();

  for (const [ifaceName, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;
      if (seen.has(addr.address)) continue;
      seen.add(addr.address);

      const lower = ifaceName.toLowerCase();
      const isVirtual =
        addr.address.startsWith("192.168.56.") ||
        lower.includes("virtual") ||
        lower.includes("vbox") ||
        lower.includes("vmware") ||
        lower.includes("wsl") ||
        lower.includes("hyper-v") ||
        lower.includes("docker");

      results.push({
        name: ifaceName,
        ip: addr.address,
        recommended: !isVirtual && results.filter((r) => !r.muted).length === 0,
        muted: isVirtual,
        note: isVirtual ? "Virtual adapter, not for students" : "Recommended",
      });
    }
  }

  // Sort real adapters first
  results.sort((a, b) => Number(a.muted) - Number(b.muted));
  if (results.length > 0 && !results.some((r) => r.recommended)) {
    const firstReal = results.find((r) => !r.muted);
    if (firstReal) firstReal.recommended = true;
  }

  if (results.length === 0) {
    results.push({
      name: "This computer only",
      ip: "127.0.0.1",
      recommended: false,
      muted: true,
      note: "No school network found",
    });
  }
  return results;
}
