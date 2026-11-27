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
  is_clock_rollback?: boolean;
  can_repair_vault?: boolean;
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

export type UpdateLifecycleStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "offline"
  | "error";

export interface UpdateStatusState {
  status: UpdateLifecycleStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  error: string | null;
  checkedAt: number | null;
}

export interface CloudDirectives {
  maintenance_mode?: boolean;
  maintenance_message?: string;
  min_desktop_version?: string;
  global_announcement?: string;
  global_announcement_level?: string;
  school_status?: string;
  school_ban_reason?: string | null;
  school_notice?: string;
  school_notice_level?: string;
  allow_trial_activation?: boolean;
  backup_reminder_days?: number;
  last_cloud_backup_at?: string | null;
  feature_overrides?: Record<string, unknown>;
}

export interface CloudAccountSession {
  signedIn: boolean;
  offline: boolean;
  cloudUrl: string;
  lastSyncedAt: number | null;
  user: {
    id: string;
    email: string;
    full_name: string;
    phone?: string;
    role: string;
    status: string;
    email_verified?: boolean;
  } | null;
  school: {
    id: string;
    school_name: string;
    country_code?: string;
    state_region?: string;
    contact_email?: string;
    status: string;
    ban_reason?: string | null;
    last_cloud_backup_at?: string | null;
  } | null;
  referralCode: string | null;
  licenses: Array<{
    id: string;
    license_key: string;
    plan_tier: string;
    plan_name?: string;
    status: string;
    expires_at: string | null;
    signed_lease_json?: Record<string, unknown> | null;
    revocation_tombstone_json?: Record<string, unknown> | null;
  }>;
  directives?: CloudDirectives | null;
}
