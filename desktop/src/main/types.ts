export type ThemeMode = "dark" | "light";
export type ServerLifecycleState = "stopped" | "starting" | "running" | "stopping" | "locked";

export interface StudioSettings {
  theme: ThemeMode;
  startWithWindows: boolean;
  autoStartServer: boolean;
  port: number;
  lanOnly: boolean;
  backupSchedule: "30m" | "60m" | "daily" | "off";
  backupDir: string;
  selectedLanIp: string;
  onboardingComplete: boolean;
  adminFullName: string;
  adminUsername: string;
}

export interface LicenseStatus {
  lock_state:
    | "ACTIVE"
    | "DRAINING"
    | "UNACTIVATED"
    | "EXPIRED_LOCK"
    | "LEASE_EXPIRED_LOCK"
    | "CLOCK_TAMPER_LOCK"
    | "HWID_MISMATCH_LOCK"
    | "HQ_REVOKED_LOCK";
  is_licensed: boolean;
  allow_portal: boolean;
  allow_new_exams: boolean;
  is_draining: boolean;
  drain_remaining_seconds: number;
  active_exams_count: number;
  display_hwid: string;
  hwid_hash: string;
  anchors: {
    dpapi_vault: string;
    registry: string;
    sqlite: string;
  };
  now_utc: number;
  max_seen_utc: number;
  tamper_reason: string | null;
  license_id: string | null;
  license_key: string | null;
  school_name: string | null;
  plan_tier: "trial" | "monthly" | "annual" | "lifetime" | null;
  expires_at: string | null;
  days_remaining: number | null;
  total_days: number | null;
  lease_seconds: number | null;
  lease_remaining_seconds: number | null;
  last_heartbeat_utc: number | null;
  used_seconds: number;
  tamper_strikes: number;
  tombstone: {
    tombstone_id?: string;
    reason_code?: string;
    reason_detail?: string;
    revoked_at?: string;
  } | null;
}

export interface BackupEntry {
  filename: string;
  type: string;
  size_bytes: number;
  size_label: string;
  created_at_utc: number;
  created_label: string;
  verified: boolean;
}

export interface NetworkAdapterInfo {
  name: string;
  ip: string;
  recommended: boolean;
  muted: boolean;
  note: string;
}
