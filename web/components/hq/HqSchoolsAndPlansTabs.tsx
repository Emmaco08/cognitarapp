"use client";

import React, { useEffect, useState } from "react";
import { IconCopy } from "@/components/Icons";

export interface HqSchoolRow {
  school_id: string;
  school_name: string;
  school_motto?: string | null;
  academic_session?: string | null;
  current_term?: string | null;
  logo_data_url?: string | null;
  admin_full_name?: string | null;
  admin_username?: string | null;
  onboarding_completed_at?: string | null;
  last_lan_ip?: string | null;
  last_machine_hostname?: string | null;
  last_os_version?: string | null;
  country_code: string;
  state_region: string | null;
  contact_email: string;
  contact_phone: string | null;
  phone?: string | null;
  school_status: string;
  ban_reason: string | null;
  custom_notice: string | null;
  custom_notice_level: string | null;
  last_seen_at: string | null;
  last_app_version: string | null;
  last_hwid: string | null;
  created_at: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  total_paid_ngn: number;
  orders_count: number;
  active_sessions: number;
  license_id: string | null;
  license_key: string | null;
  plan_tier: string | null;
  plan_name: string | null;
  license_status: string | null;
  license_expires_at: string | null;
  bonus_days_total: number | null;
  active_hwids: number | null;
}

function schoolInitials(name: string): string {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "CT"
  );
}

export interface HqPlanRow {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  badge: string;
  sort_order: number;
  billing_cycle: string;
  plan_tier: string;
  duration_days: number | null;
  lease_days: number;
  price_ngn_kobo: number;
  price_usd_cents: number;
  max_devices: number;
  is_active: boolean;
  features_json?: { highlights?: string[] };
  licenses_issued?: number;
  paid_orders?: number;
}

export interface HqCodeRow {
  id: string;
  code: string;
  code_type: "discount" | "redeem";
  discount_kind: string | null;
  discount_value: number;
  grant_plan_id: string | null;
  grant_plan_name?: string | null;
  grant_duration_days: number | null;
  applicable_plan_ids?: string[] | null;
  min_amount_ngn_kobo?: number | null;
  min_amount_usd_cents?: number | null;
  max_uses: number | null;
  uses_count: number;
  per_school_limit: number;
  per_email_limit?: number;
  starts_at?: string | null;
  expires_at: string | null;
  is_active: boolean;
  notes: string | null;
  description?: string | null;
  created_at: string;
}

export interface HqRedemptionRow {
  id: string;
  promo_code_id: string;
  code: string;
  code_type: "discount" | "redeem";
  school_name: string | null;
  email: string | null;
  buyer_email?: string | null;
  reference: string | null;
  currency: string | null;
  discount_applied_minor: number;
  license_key: string | null;
  ip_address: string | null;
  created_at: string;
}

function fmtNgn(kobo: number) {
  return `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/* ==========================================================================
   1. SCHOOLS & ACCOUNTS (+ FRAUD & BANS FILTER) + SLIDE-OVER POWER DRAWER
   ========================================================================== */
export function HqSchoolsTab({
  schools,
  plans,
  mode,
  onRefresh,
  onToast,
}: {
  schools: HqSchoolRow[];
  plans: HqPlanRow[];
  mode: "all" | "bans";
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(mode === "bans" ? "flagged" : "all");
  const [selected, setSelected] = useState<HqSchoolRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Power Drawer controls
  const [grantPlanId, setGrantPlanId] = useState(plans[0]?.id || "");
  const [grantDays, setGrantDays] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [noticeText, setNoticeText] = useState("");
  const [noticeLevel, setNoticeLevel] = useState("info");
  const [reason, setReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    action: string;
    title: string;
    detail: string;
    danger?: boolean;
  } | null>(null);

  useEffect(() => {
    setStatusFilter(mode === "bans" ? "flagged" : "all");
  }, [mode]);

  useEffect(() => {
    if (!grantPlanId && plans[0]?.id) setGrantPlanId(plans[0].id);
  }, [plans, grantPlanId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmModal) setConfirmModal(null);
        else if (selected) setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, confirmModal]);

  const filtered = schools.filter((s) => {
    if (statusFilter === "flagged" && s.school_status === "active") return false;
    if (statusFilter === "active" && s.school_status !== "active") return false;
    if (statusFilter === "banned" && s.school_status !== "banned") return false;
    if (statusFilter === "suspended" && s.school_status !== "suspended") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(s.school_name || "").toLowerCase().includes(q) ||
      String(s.school_motto || "").toLowerCase().includes(q) ||
      String(s.email || "").toLowerCase().includes(q) ||
      String(s.full_name || "").toLowerCase().includes(q) ||
      String(s.admin_full_name || "").toLowerCase().includes(q) ||
      String(s.admin_username || "").toLowerCase().includes(q) ||
      String(s.license_key || "").toLowerCase().includes(q) ||
      String(s.last_hwid || "").toLowerCase().includes(q) ||
      String(s.last_machine_hostname || "").toLowerCase().includes(q)
    );
  });

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/hq/users/${selected.school_id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined, ...extra }),
      }).then((r) => r.json());
      onToast(
        res?.temporary_password
          ? `${res.message} Temp password: ${res.temporary_password}`
          : res?.message || (res?.ok ? "Action completed." : "Action failed.")
      );
      setConfirmModal(null);
      if (action === "delete_school" && res?.ok) {
        setSelected(null);
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="hq-head">
        <div>
          <h1>{mode === "bans" ? "Fraud & bans" : "Schools & accounts"}</h1>
          <p>
            {mode === "bans"
              ? "Review suspended or banned school accounts, inspect ban reasons, and restore or permanently lock devices."
              : "Every registered school, onboarding profile, licence status, active devices, and lifetime spend. Open any school for full details & remote controls."}
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      <div className="hq-toolbar">
        <div className="hq-chips">
          {(mode === "bans"
            ? [
                ["flagged", "Banned & suspended"],
                ["banned", "Banned"],
                ["suspended", "Suspended"],
                ["all", "All schools"],
              ]
            : [
                ["all", "All"],
                ["active", "Active"],
                ["suspended", "Suspended"],
                ["banned", "Banned"],
              ]
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              className={`hq-chip ${statusFilter === k ? "is-active" : ""}`}
              onClick={() => setStatusFilter(k)}
            >
              {lbl}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search school, owner, superadmin, licence key, or HWID"
          className="hq-search"
        />
      </div>

      <div className="hq-table-wrap">
        <table className="hq-table">
          <thead>
            <tr>
              <th>School</th>
              <th>Owner</th>
              <th>Licence</th>
              <th>Status</th>
              <th>Spend</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>
                  No school accounts match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.school_id}
                  className="is-clickable"
                  onClick={() => {
                    setSelected(s);
                    setNoticeText(s.custom_notice || "");
                    setNoticeLevel(s.custom_notice_level || "info");
                    setReason("");
                  }}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#fff",
                          background: s.logo_data_url ? "var(--surface-2)" : "linear-gradient(155deg, #2B2926, #141312)",
                          border: "1px solid var(--border-2)",
                        }}
                      >
                        {s.logo_data_url ? (
                          <img
                            src={s.logo_data_url}
                            alt={`${s.school_name} crest`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : (
                          schoolInitials(s.school_name)
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 620 }}>{s.school_name}</span>
                          {s.onboarding_completed_at ? (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 650,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "var(--ok-soft)",
                                color: "var(--ok)",
                                border: "1px solid var(--border-2)",
                              }}
                            >
                              Onboarded
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          {s.current_term && s.academic_session
                            ? `${s.current_term} · ${s.academic_session}`
                            : s.last_app_version
                              ? `Studio v${s.last_app_version}`
                              : "Web account"}
                          {s.active_hwids ? ` · ${s.active_hwids} PC` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{s.full_name}</div>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.email}</div>
                  </td>
                  <td>
                    {s.license_key ? (
                      <>
                        <div className="mono" style={{ fontSize: 12 }}>{s.license_key}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {s.plan_name || s.plan_tier} · {s.license_status}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>No licence</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-txt ${s.school_status === "active" ? "status-txt--ok" : s.school_status === "banned" ? "status-txt--bad" : "status-txt--warn"}`}>
                      {s.school_status}
                    </span>
                  </td>
                  <td className="mono">{fmtNgn(s.total_paid_ngn)}</td>
                  <td className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-Over School Power Drawer */}
      {selected ? (
        <div className="hq-drawer-bg" onClick={() => setSelected(null)}>
          <aside className="hq-drawer" onClick={(e) => e.stopPropagation()} aria-label="School controls">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 15,
                    fontWeight: 750,
                    color: "#fff",
                    background: selected.logo_data_url ? "var(--surface-2)" : "linear-gradient(155deg, #2B2926, #141312)",
                    border: "1px solid var(--border-2)",
                  }}
                >
                  {selected.logo_data_url ? (
                    <img
                      src={selected.logo_data_url}
                      alt={`${selected.school_name} logo`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    schoolInitials(selected.school_name)
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 19 }}>{selected.school_name}</h2>
                  {selected.school_motto ? (
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontStyle: "italic", marginTop: 2 }}>
                      “{selected.school_motto}”
                    </div>
                  ) : null}
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {selected.email} · {selected.active_sessions} active session(s)
                  </div>
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            {selected.ban_reason ? (
              <div className="alert alert--bad">
                <strong>Disabled reason:</strong> {selected.ban_reason}
              </div>
            ) : null}

            {/* Synced Desktop Onboarding & School Profile Details */}
            <div className="hq-section-block">
              <h3>School onboarding &amp; desktop profile</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "10px 14px",
                  fontSize: 12.5,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--field)",
                  border: "1px solid var(--border-2)",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Session &amp; Term</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {selected.current_term || selected.academic_session
                      ? `${selected.current_term || "-"} · ${selected.academic_session || "-"}`
                      : "Not configured yet"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Onboarding status</div>
                  <div style={{ fontWeight: 600, marginTop: 2, color: selected.onboarding_completed_at ? "var(--ink)" : "var(--ink-2)" }}>
                    {selected.onboarding_completed_at
                      ? `Completed ${new Date(selected.onboarding_completed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                      : "Pending desktop finish"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Cloud owner &amp; phone</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {selected.full_name}
                    {selected.contact_phone || selected.phone ? ` · ${selected.contact_phone || selected.phone}` : ""}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Local Super Admin</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {selected.admin_full_name || selected.admin_username
                      ? `${selected.admin_full_name || "Super Admin"}${selected.admin_username ? ` (@${selected.admin_username})` : ""}`
                      : "Not synced yet"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Machine HWID</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 2, wordBreak: "break-all" }}>
                    {selected.last_hwid || "-"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Host · LAN IP · Studio</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {[
                      selected.last_machine_hostname,
                      selected.last_lan_ip,
                      selected.last_app_version ? `v${selected.last_app_version}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </div>
                </div>
                {selected.last_os_version ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Operating system</div>
                    <div className="mono" style={{ fontSize: 11.5, marginTop: 2 }}>{selected.last_os_version}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="field">
              <label htmlFor="hqReason">Audit reason (optional note for actions below)</label>
              <input id="hqReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Support ticket #412" />
            </div>

            <div className="hq-section-block">
              <h3>Grant or extend licence</h3>
              <div className="form-row">
                <div className="field">
                  <label>Plan</label>
                  <select value={grantPlanId} onChange={(e) => setGrantPlanId(e.target.value)}>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Custom days (blank = plan default)</label>
                  <input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(e.target.value)} placeholder="Default" />
                </div>
              </div>
              <div className="hq-btn-row">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={() => void runAction("grant_license", { plan_id: grantPlanId, duration_days: grantDays || undefined })}
                >
                  Grant licence
                </button>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                    style={{ width: 72, height: 32, padding: "0 8px", borderRadius: 7, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)" }}
                  />
                  <button
                    type="button"
                    className="btn btn--ok btn--sm"
                    disabled={busy}
                    onClick={() => void runAction("extend_license", { days: Number(extendDays || 30) })}
                  >
                    + Extend days
                  </button>
                </div>
              </div>
            </div>

            <div className="hq-section-block">
              <h3>Push live notice to desktop app &amp; dashboard</h3>
              <div className="form-row">
                <div className="field">
                  <label>Message</label>
                  <input value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="Your renewal is due next week…" />
                </div>
                <div className="field">
                  <label>Tone</label>
                  <select value={noticeLevel} onChange={(e) => setNoticeLevel(e.target.value)}>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="hq-btn-row">
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void runAction("send_notice", { notice: noticeText, level: noticeLevel })}>
                  Send notice
                </button>
                <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => void runAction("clear_notice")}>
                  Clear notice
                </button>
              </div>
            </div>

            <div className="hq-section-block">
              <h3>Device &amp; account controls</h3>
              <div className="hq-btn-row">
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void runAction("reset_hwid")}>
                  Reset machine HWID
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void runAction("force_signout")}>
                  Force sign-out
                </button>
                <button
                  type="button"
                  className="btn btn--warn btn--sm"
                  disabled={busy}
                  onClick={() =>
                    setConfirmModal({
                      action: "revoke_license",
                      title: "Revoke active licence?",
                      detail: `Revoking will immediately burn a revocation notice so ${selected.school_name}'s desktop app locks on next check-in.`,
                      danger: true,
                    })
                  }
                >
                  Revoke licence
                </button>
              </div>

              <div className="form-row" style={{ marginTop: 6 }}>
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Optional custom new password (8+ chars)"
                  style={{ height: 34, padding: "0 10px", borderRadius: 7, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)", fontSize: 12.5 }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => void runAction("reset_password", { new_password: newPassword.trim() || undefined })}
                >
                  Reset password
                </button>
              </div>
            </div>

            <div className="hq-section-block">
              <h3>Enforcement</h3>
              <div className="hq-btn-row">
                {selected.school_status === "active" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--warn btn--sm"
                      disabled={busy}
                      onClick={() =>
                        setConfirmModal({
                          action: "suspend_school",
                          title: `Suspend ${selected.school_name}?`,
                          detail: "Active sessions will be ended and the school cannot sign in until restored.",
                        })
                      }
                    >
                      Suspend school
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      disabled={busy}
                      onClick={() =>
                        setConfirmModal({
                          action: "ban_school",
                          title: `Ban ${selected.school_name}?`,
                          detail: "This disables the school, revokes all active licences, and terminates all sessions.",
                          danger: true,
                        })
                      }
                    >
                      Ban &amp; revoke
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--ok btn--sm" disabled={busy} onClick={() => void runAction("unban_school")}>
                    Restore to Active
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={busy}
                  onClick={() =>
                    setConfirmModal({
                      action: "delete_school",
                      title: `Permanently delete ${selected.school_name}?`,
                      detail: "This permanently removes the school, owner account, sessions, and referral records. This cannot be undone.",
                      danger: true,
                    })
                  }
                >
                  Delete account
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {confirmModal ? (
        <div className="modal-bg" onClick={() => setConfirmModal(null)}>
          <div className="modal-panel" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>{confirmModal.title}</h3>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--ink-2)" }}>{confirmModal.detail}</p>
            <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn--sm ${confirmModal.danger ? "btn--danger" : "btn--primary"}`}
                disabled={busy}
                onClick={() => void runAction(confirmModal.action)}
              >
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   2. PLANS & PRICES TAB
   ========================================================================== */
export function HqPlansTab({
  plans,
  onRefresh,
  onToast,
}: {
  plans: HqPlanRow[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [badge, setBadge] = useState("");
  const [description, setDescription] = useState("");
  const [priceNgn, setPriceNgn] = useState("25000");
  const [priceUsd, setPriceUsd] = useState("19");
  const [durationDays, setDurationDays] = useState("30");
  const [leaseDays, setLeaseDays] = useState("14");
  const [maxDevices, setMaxDevices] = useState("1");
  const [highlights, setHighlights] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function loadForEdit(p: HqPlanRow) {
    setEditingId(p.id);
    setDisplayName(p.display_name);
    setSlug(p.slug);
    setBadge(p.badge || "");
    setDescription(p.description || "");
    setPriceNgn(String(Math.round(Number(p.price_ngn_kobo || 0) / 100)));
    setPriceUsd(String(Math.round(Number(p.price_usd_cents || 0) / 100)));
    setDurationDays(p.duration_days === null ? "" : String(p.duration_days));
    setLeaseDays(String(p.lease_days || 30));
    setMaxDevices(String(p.max_devices || 1));
    setHighlights((p.features_json?.highlights || []).join("\n"));
    setIsActive(Boolean(p.is_active));
  }

  function clearForm() {
    setEditingId(null);
    setDisplayName("");
    setSlug("");
    setBadge("");
    setDescription("");
    setPriceNgn("25000");
    setPriceUsd("19");
    setDurationDays("30");
    setLeaseDays("14");
    setMaxDevices("1");
    setHighlights("");
    setIsActive(true);
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/hq/plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          display_name: displayName,
          slug: slug || undefined,
          badge,
          description,
          price_ngn: Number(priceNgn || 0),
          price_usd: Number(priceUsd || 0),
          duration_days: durationDays.trim() === "" ? null : Number(durationDays),
          lease_days: Number(leaseDays || 30),
          max_devices: Number(maxDevices || 1),
          highlights,
          is_active: isActive,
        }),
      }).then((r) => r.json());
      onToast(res?.message || "Saved plan.");
      if (res?.ok) {
        clearForm();
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function archivePlan(id: string) {
    const res = await fetch(`/api/v1/hq/plans?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    await onRefresh();
  }

  return (
    <div>
      <div className="hq-head">
        <div>
          <h1>Plans &amp; prices</h1>
          <p>Set school licence prices in NGN and USD, offline lease duration, and featured badges. Updates immediately everywhere.</p>
        </div>
      </div>

      <div className="hq-grid2">
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr><th>Plan</th><th>NGN</th><th>USD</th><th>Duration</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.display_name}</strong>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {p.slug}{p.badge ? ` · ${p.badge}` : ""}
                    </div>
                  </td>
                  <td className="mono">{fmtNgn(p.price_ngn_kobo)}</td>
                  <td className="mono">${(Number(p.price_usd_cents || 0) / 100).toLocaleString()}</td>
                  <td className="mono">{p.duration_days ? `${p.duration_days}d` : "Lifetime"}</td>
                  <td>
                    <span className={`status-txt ${p.is_active ? "status-txt--ok" : "status-txt--bad"}`}>
                      {p.is_active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="btn btn--ghost btn--xs" onClick={() => loadForEdit(p)}>Edit</button>
                      <button type="button" className="btn btn--danger btn--xs" onClick={() => void archivePlan(p.id)}>Archive</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="card">
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>{editingId ? "Edit plan" : "Create new plan"}</h2>
          <form className="form-grid" onSubmit={savePlan}>
            <div className="form-row">
              <div className="field">
                <label>Plan name</label>
                <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Termly School Plan" />
              </div>
              <div className="field">
                <label>Slug</label>
                <input className="mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="termly" />
              </div>
            </div>
            <div className="form-row3">
              <div className="field">
                <label>Price (₦ NGN)</label>
                <input type="number" min={0} required value={priceNgn} onChange={(e) => setPriceNgn(e.target.value)} />
              </div>
              <div className="field">
                <label>Price ($ USD)</label>
                <input type="number" min={0} required value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} />
              </div>
              <div className="field">
                <label>Badge (optional)</label>
                <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Popular" />
              </div>
            </div>
            <div className="form-row3">
              <div className="field">
                <label>Days (blank = Lifetime)</label>
                <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="120" />
              </div>
              <div className="field">
                <label>Offline lease (days)</label>
                <input type="number" min={1} max={365} required value={leaseDays} onChange={(e) => setLeaseDays(e.target.value)} />
              </div>
              <div className="field">
                <label>Max PCs</label>
                <input type="number" min={1} max={50} required value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Feature highlights (one per line)</label>
              <textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder={"Up to 300 concurrent students\nAutomatic cloud exam backups"} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Show this plan in checkout store
            </label>
            <div className="hq-btn-row">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update plan" : "Create plan"}
              </button>
              {editingId ? (
                <button type="button" className="btn btn--ghost" onClick={clearForm}>Cancel</button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. REDEEM & DISCOUNT CODES TAB (Upgraded: Eligibility, Windows, Limits, CSV, Audit Log)
   ========================================================================== */
export function HqCodesTab({
  codes,
  redemptions = [],
  plans,
  onRefresh,
  onToast,
}: {
  codes: HqCodeRow[];
  redemptions?: HqRedemptionRow[];
  plans: HqPlanRow[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<"codes" | "redemptions">("codes");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "discount" | "redeem">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "expired">("all");

  // Generator form state
  const [codeType, setCodeType] = useState<"discount" | "redeem">("discount");
  const [customCode, setCustomCode] = useState("");
  const [prefix, setPrefix] = useState("SAVE");
  const [batchCount, setBatchCount] = useState("1");
  const [discountKind, setDiscountKind] = useState("percent");
  const [discountValue, setDiscountValue] = useState("20");
  const [grantPlanId, setGrantPlanId] = useState(plans[0]?.id || "");
  const [grantDays, setGrantDays] = useState("");
  const [applicablePlanIds, setApplicablePlanIds] = useState<string[]>([]);
  const [minAmountNgn, setMinAmountNgn] = useState("");
  const [minAmountUsd, setMinAmountUsd] = useState("");
  const [maxUses, setMaxUses] = useState("25");
  const [perSchoolLimit, setPerSchoolLimit] = useState("1");
  const [perEmailLimit, setPerEmailLimit] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!grantPlanId && plans[0]?.id) setGrantPlanId(plans[0].id);
  }, [plans, grantPlanId]);

  function togglePlanEligibility(id: string) {
    setApplicablePlanIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function codeStatus(c: HqCodeRow): { label: string; kind: "ok" | "warn" | "bad" } {
    const now = Date.now();
    if (!c.is_active) return { label: "Paused", kind: "warn" };
    if (c.expires_at && new Date(c.expires_at).getTime() <= now) return { label: "Expired", kind: "bad" };
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Scheduled", kind: "warn" };
    if (c.max_uses && c.uses_count >= c.max_uses) return { label: "Exhausted", kind: "bad" };
    return { label: "Active", kind: "ok" };
  }

  const filteredCodes = codes.filter((c) => {
    if (typeFilter !== "all" && c.code_type !== typeFilter) return false;
    const st = codeStatus(c);
    if (statusFilter === "active" && st.label !== "Active") return false;
    if (statusFilter === "paused" && st.label !== "Paused" && st.label !== "Scheduled") return false;
    if (statusFilter === "expired" && st.label !== "Expired" && st.label !== "Exhausted") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      (c.grant_plan_name || "").toLowerCase().includes(q)
    );
  });

  const filteredRedemptions = redemptions.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.code || "").toLowerCase().includes(q) ||
      (r.school_name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.reference || "").toLowerCase().includes(q) ||
      (r.license_key || "").toLowerCase().includes(q)
    );
  });

  function exportCodesCsv() {
    const headers = [
      "Code",
      "Type",
      "Value_or_Plan",
      "Uses",
      "Max_Uses",
      "Per_School_Limit",
      "Per_Email_Limit",
      "Starts_At",
      "Expires_At",
      "Status",
      "Description",
      "Notes",
    ];
    const rows = filteredCodes.map((c) => {
      const val =
        c.code_type === "redeem"
          ? c.grant_plan_name || "Licence"
          : c.discount_kind === "percent"
          ? `${c.discount_value}%`
          : `${c.discount_kind === "fixed_usd" ? "$" : "NGN "}${c.discount_value}`;
      return [
        c.code,
        c.code_type,
        val,
        String(c.uses_count),
        c.max_uses === null ? "Unlimited" : String(c.max_uses),
        String(c.per_school_limit || 1),
        String(c.per_email_limit || 1),
        c.starts_at || "",
        c.expires_at || "",
        codeStatus(c).label,
        (c.description || "").replace(/"/g, '""'),
        (c.notes || "").replace(/"/g, '""'),
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognitara-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onToast(`Exported ${filteredCodes.length} codes to CSV.`);
  }

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/hq/codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code_type: codeType,
          code: customCode.trim() || undefined,
          prefix: prefix.trim() || (codeType === "redeem" ? "CT-FREE" : "SAVE"),
          batch_count: Number(batchCount || 1),
          discount_kind: discountKind,
          discount_value: Number(discountValue || 0),
          grant_plan_id: codeType === "redeem" ? grantPlanId : undefined,
          grant_duration_days: grantDays.trim() ? Number(grantDays) : undefined,
          applicable_plan_ids: codeType === "discount" ? applicablePlanIds : [],
          min_amount_ngn: codeType === "discount" && minAmountNgn.trim() ? Number(minAmountNgn) : 0,
          min_amount_usd: codeType === "discount" && minAmountUsd.trim() ? Number(minAmountUsd) : 0,
          max_uses: maxUses.trim() ? Number(maxUses) : null,
          per_school_limit: Number(perSchoolLimit || 1),
          per_email_limit: Number(perEmailLimit || 1),
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          description: description.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      }).then((r) => r.json());
      onToast(res?.message || "Created.");
      if (res?.ok) {
        setCustomCode("");
        setDescription("");
        setNotes("");
        setApplicablePlanIds([]);
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleCode(id: string) {
    const res = await fetch("/api/v1/hq/codes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    await onRefresh();
  }

  async function deleteCode(id: string) {
    const res = await fetch(`/api/v1/hq/codes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    }).then((r) => r.json());
    onToast(res?.message || "Deleted.");
    await onRefresh();
  }

  const activeCount = codes.filter((c) => codeStatus(c).label === "Active").length;
  const voucherCount = codes.filter((c) => c.code_type === "redeem").length;
  const totalUses = codes.reduce((sum, c) => sum + Number(c.uses_count || 0), 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Redeem &amp; discount codes</h1>
          <p>
            Manage checkout discount campaigns and 100% free school redeem vouchers with plan eligibility, date windows,
            per-email limits, CSV batch export, and full redemption audit trails.
          </p>
        </div>
        <div className="hq-btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportCodesCsv} disabled={filteredCodes.length === 0}>
            Export CSV ({filteredCodes.length})
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="hq-kpi-strip">
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Active codes</span>
          <span className="hq-kpi__val">{activeCount}</span>
          <span className="hq-kpi__sub">{codes.length} total created</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">100% Free vouchers</span>
          <span className="hq-kpi__val">{voucherCount}</span>
          <span className="hq-kpi__sub">{codes.length - voucherCount} discount codes</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Total redemptions</span>
          <span className="hq-kpi__val">{totalUses}</span>
          <span className="hq-kpi__sub">{redemptions.length} audited log entries</span>
        </div>
      </div>

      {/* Sub-tabs + Search/Filter */}
      <div className="hq-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="hq-chips">
          <button
            type="button"
            className={`hq-chip ${subTab === "codes" ? "is-active" : ""}`}
            onClick={() => setSubTab("codes")}
          >
            All codes ({codes.length})
          </button>
          <button
            type="button"
            className={`hq-chip ${subTab === "redemptions" ? "is-active" : ""}`}
            onClick={() => setSubTab("redemptions")}
          >
            Redemption audit log ({redemptions.length})
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {subTab === "codes" ? (
            <>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)", fontSize: 12.5 }}
              >
                <option value="all">All types</option>
                <option value="discount">Discount codes</option>
                <option value="redeem">100% Free vouchers</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)", fontSize: 12.5 }}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused / Scheduled</option>
                <option value="expired">Expired / Exhausted</option>
              </select>
            </>
          ) : null}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={subTab === "codes" ? "Search code or note…" : "Search school, email, ref, key…"}
            className="hq-search"
            style={{ width: 220 }}
          />
        </div>
      </div>

      {subTab === "codes" ? (
        <div className="hq-grid2" style={{ alignItems: "start" }}>
          <div className="hq-table-wrap">
            <table className="hq-table">
              <thead>
                <tr>
                  <th>Code &amp; Rules</th>
                  <th>Value</th>
                  <th>Usage</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCodes.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>
                      No matching codes found.
                    </td>
                  </tr>
                ) : (
                  filteredCodes.map((c) => {
                    const st = codeStatus(c);
                    const restrictedPlans = Array.isArray(c.applicable_plan_ids) ? c.applicable_plan_ids : [];
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <code className="mono" style={{ fontWeight: 700 }}>{c.code}</code>
                            <button
                              type="button"
                              className="btn btn--ghost btn--xs"
                              title="Copy code"
                              onClick={() => {
                                navigator.clipboard?.writeText(c.code);
                                onToast(`Copied ${c.code}`);
                              }}
                            >
                              <IconCopy size={12} />
                            </button>
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                            {c.code_type === "redeem" ? "100% Free voucher" : "Discount code"}
                            {restrictedPlans.length > 0 ? ` · ${restrictedPlans.length} plan(s)` : ""}
                            {c.expires_at ? ` · Exp ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                          </div>
                          {c.description || c.notes ? (
                            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2 }}>
                              {c.description || c.notes}
                            </div>
                          ) : null}
                        </td>
                        <td className="mono" style={{ fontSize: 12.5 }}>
                          {c.code_type === "redeem"
                            ? `${c.grant_plan_name || "Licence"}${c.grant_duration_days ? ` (${c.grant_duration_days}d)` : ""}`
                            : c.discount_kind === "percent"
                            ? `${c.discount_value}% off`
                            : `${c.discount_kind === "fixed_usd" ? "$" : "₦"}${Number(c.discount_value).toLocaleString()} off`}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          <div>{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : " / ∞"}</div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {c.per_email_limit || c.per_school_limit || 1}/email
                          </div>
                        </td>
                        <td>
                          <span className={`status-txt status-txt--${st.kind}`}>{st.label}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="btn btn--ghost btn--xs" onClick={() => void toggleCode(c.id)}>
                              {c.is_active ? "Pause" : "Resume"}
                            </button>
                            <button type="button" className="btn btn--danger btn--xs" onClick={() => void deleteCode(c.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <section className="card">
            <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Create discount or redeem code</h2>
            <form className="form-grid" onSubmit={createCode}>
              <div className="hq-chips">
                <button
                  type="button"
                  className={`hq-chip ${codeType === "discount" ? "is-active" : ""}`}
                  onClick={() => {
                    setCodeType("discount");
                    setPrefix("SAVE");
                    setMaxUses("25");
                  }}
                >
                  Discount code (% / ₦ / $)
                </button>
                <button
                  type="button"
                  className={`hq-chip ${codeType === "redeem" ? "is-active" : ""}`}
                  onClick={() => {
                    setCodeType("redeem");
                    setPrefix("CT-FREE");
                    setMaxUses("1");
                  }}
                >
                  100% Free voucher
                </button>
              </div>

              <div className="form-row3">
                <div className="field">
                  <label>Custom code (1 code)</label>
                  <input
                    className="mono"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="TERM2026"
                    disabled={Number(batchCount || 1) > 1}
                  />
                </div>
                <div className="field">
                  <label>Batch prefix</label>
                  <input
                    className="mono"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder={codeType === "redeem" ? "CT-FREE" : "SAVE"}
                  />
                </div>
                <div className="field">
                  <label>Batch count (1-50)</label>
                  <input type="number" min={1} max={50} value={batchCount} onChange={(e) => setBatchCount(e.target.value)} />
                </div>
              </div>

              {codeType === "discount" ? (
                <>
                  <div className="form-row">
                    <div className="field">
                      <label>Discount kind</label>
                      <select value={discountKind} onChange={(e) => setDiscountKind(e.target.value)}>
                        <option value="percent">Percent off (%)</option>
                        <option value="fixed_ngn">Fixed ₦ off</option>
                        <option value="fixed_usd">Fixed $ off</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Value</label>
                      <input type="number" min={1} required value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Eligible plans (leave all unchecked for ALL plans)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      {plans.map((p) => {
                        const checked = applicablePlanIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: `1px solid ${checked ? "var(--ink)" : "var(--border-2)"}`,
                              background: checked ? "var(--surface-2)" : "var(--field)",
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              lineHeight: 1.25,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePlanEligibility(p.id)}
                              style={{
                                width: 15,
                                height: 15,
                                minHeight: 0,
                                padding: 0,
                                margin: 0,
                                flexShrink: 0,
                                accentColor: "var(--ink)",
                              }}
                            />
                            <span>{p.display_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label>Min order (₦ NGN, optional)</label>
                      <input type="number" min={0} value={minAmountNgn} onChange={(e) => setMinAmountNgn(e.target.value)} placeholder="0" />
                    </div>
                    <div className="field">
                      <label>Min order ($ USD, optional)</label>
                      <input type="number" min={0} value={minAmountUsd} onChange={(e) => setMinAmountUsd(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="form-row">
                  <div className="field">
                    <label>Plan granted</label>
                    <select value={grantPlanId} onChange={(e) => setGrantPlanId(e.target.value)}>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Override days (optional)</label>
                    <input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(e.target.value)} placeholder="Plan default" />
                  </div>
                </div>
              )}

              <div className="form-row3">
                <div className="field">
                  <label>Max total uses</label>
                  <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
                </div>
                <div className="field">
                  <label>Per-school limit</label>
                  <input type="number" min={1} value={perSchoolLimit} onChange={(e) => setPerSchoolLimit(e.target.value)} />
                </div>
                <div className="field">
                  <label>Per-email limit</label>
                  <input type="number" min={1} value={perEmailLimit} onChange={(e) => setPerEmailLimit(e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label>Starts at (optional)</label>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="field">
                  <label>Expires at (optional)</label>
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label>Checkout description (shown to buyer)</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="20% back-to-school launch offer" />
                </div>
                <div className="field">
                  <label>Internal HQ note</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lagos school partner batch" />
                </div>
              </div>

              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy
                  ? "Generating…"
                  : Number(batchCount || 1) > 1
                  ? `Generate ${batchCount} unique codes`
                  : codeType === "redeem"
                  ? "Create 100% free voucher"
                  : "Create discount code"}
              </button>
            </form>
          </section>
        </div>
      ) : (
        /* REDEMPTION AUDIT LOG TABLE */
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>School &amp; Buyer Email</th>
                <th>Savings</th>
                <th>Reference &amp; Licence Key</th>
                <th>IP &amp; Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredRedemptions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 34, color: "var(--ink-3)" }}>
                    No code redemptions recorded yet.
                  </td>
                </tr>
              ) : (
                filteredRedemptions.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code className="mono" style={{ fontWeight: 700 }}>{r.code}</code>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {r.code_type === "redeem" ? "Free voucher" : "Discount"}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.school_name || "-"}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {r.email || r.buyer_email || "-"}
                      </div>
                    </td>
                    <td className="mono">
                      {r.currency === "USD"
                        ? `$${(Number(r.discount_applied_minor || 0) / 100).toLocaleString("en-US")}`
                        : fmtNgn(r.discount_applied_minor || 0)}
                    </td>
                    <td>
                      {r.reference ? <div className="mono" style={{ fontSize: 11.5 }}>{r.reference}</div> : null}
                      {r.license_key ? (
                        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 600 }}>
                          {r.license_key}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      <div className="tnum">
                        {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      {r.ip_address ? <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.ip_address}</div> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

