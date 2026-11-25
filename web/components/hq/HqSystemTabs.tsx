"use client";

import React, { useEffect, useState } from "react";
import type { HqSettingsData } from "./HqPaymentSettingsTab";

function fmtNgn(kobo: number) {
  return `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function fmtBytes(bytes: number) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

/* ==========================================================================
   1. REFERRALS & PAYOUTS TAB
   ========================================================================== */
export function HqReferralsTab({ onToast }: { onToast: (msg: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"partners" | "conversions" | "payouts">("partners");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/v1/hq/referrals", { credentials: "include" }).then((r) => r.json()).catch(() => null);
    if (res?.ok) setData(res);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function settleOrReject(payoutId: string, action: "settle_payout" | "reject_payout") {
    const res = await fetch("/api/v1/hq/referrals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payout_id: payoutId }),
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    await load();
  }

  async function updatePartnerRate(id: string, pct: number, days: number, isActive: boolean) {
    const res = await fetch("/api/v1/hq/referrals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_referral",
        id,
        reward_mode: "dual",
        custom_commission_pct: pct,
        custom_bonus_days: days,
        is_active: isActive,
      }),
    }).then((r) => r.json());
    onToast(res?.message || "Saved.");
    await load();
  }

  return (
    <div>
      <div className="hq-head">
        <div>
          <h1>Referrals &amp; payouts</h1>
          <p>Track school referral links, automatic cash commissions, bonus licence days, and pending bank payout requests.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>Refresh</button>
      </div>

      {data?.summary ? (
        <div className="hq-kpi-strip">
          <div className="hq-kpi"><span className="hq-kpi__lbl">Active referral codes</span><span className="hq-kpi__val">{data.summary.total_codes}</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Paid conversions</span><span className="hq-kpi__val">{data.summary.total_conversions}</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Commissions credited</span><span className="hq-kpi__val" style={{ color: "var(--ok)" }}>{fmtNgn(data.summary.total_commissions_kobo)}</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Pending payouts</span><span className="hq-kpi__val">{data.summary.pending_payouts}</span></div>
        </div>
      ) : null}

      <div className="hq-toolbar">
        <div className="hq-chips">
          <button type="button" className={`hq-chip ${subTab === "partners" ? "is-active" : ""}`} onClick={() => setSubTab("partners")}>Referrers</button>
          <button type="button" className={`hq-chip ${subTab === "conversions" ? "is-active" : ""}`} onClick={() => setSubTab("conversions")}>Conversions</button>
          <button type="button" className={`hq-chip ${subTab === "payouts" ? "is-active" : ""}`} onClick={() => setSubTab("payouts")}>
            Payout requests{data?.summary?.pending_payouts ? ` (${data.summary.pending_payouts})` : ""}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 36, color: "var(--ink-3)" }}>Loading referrals…</div>
      ) : subTab === "partners" ? (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr><th>Code</th><th>School / Partner</th><th>Signups</th><th>Paid</th><th>Earned</th><th>Wallet</th><th>Terms</th></tr>
            </thead>
            <tbody>
              {(data?.referrers || []).map((r: any) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontWeight: 680 }}>{r.referral_code}</td>
                  <td>
                    <div>{r.school_name || r.full_name}</div>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.email}</div>
                  </td>
                  <td className="mono">{r.signups_count}</td>
                  <td className="mono">{r.paid_count}</td>
                  <td className="mono">{fmtNgn(r.earned_kobo)}</td>
                  <td className="mono" style={{ color: "var(--ok)" }}>{fmtNgn(r.wallet_balance_kobo)}</td>
                  <td>
                    <div className="hq-btn-row">
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                        {Number(r.custom_commission_pct ?? 15)}% · +{Number(r.custom_bonus_days ?? 14)}d
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        onClick={() => void updatePartnerRate(r.id, Number(r.custom_commission_pct ?? 15), Number(r.custom_bonus_days ?? 14), !r.is_active)}
                      >
                        {r.is_active ? "Pause" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : subTab === "conversions" ? (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr><th>Referrer</th><th>Referred school</th><th>Order</th><th>Commission</th><th>Bonus days</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(data?.conversions || []).length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--ink-3)" }}>No referral conversions yet.</td></tr>
              ) : (
                data.conversions.map((c: any) => (
                  <tr key={c.id}>
                    <td><div>{c.referrer_name}</div><div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{c.referral_code}</div></td>
                    <td>{c.referred_school_name}</td>
                    <td className="mono">{c.paystack_reference}</td>
                    <td className="mono">{fmtNgn(c.commission_amount_kobo)} ({c.commission_pct_applied}%)</td>
                    <td className="mono">+{c.bonus_days_granted_referrer}d / +{c.bonus_days_granted_referee}d</td>
                    <td><span className={`status-txt ${c.status === "credited" ? "status-txt--ok" : "status-txt--bad"}`}>{c.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr><th>Partner</th><th>Amount</th><th>Bank</th><th>Status</th><th>Requested</th><th></th></tr>
            </thead>
            <tbody>
              {(data?.payouts || []).length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--ink-3)" }}>No payout requests yet.</td></tr>
              ) : (
                data.payouts.map((p: any) => (
                  <tr key={p.id}>
                    <td><div>{p.full_name}</div><div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{p.email}</div></td>
                    <td className="mono" style={{ fontWeight: 680 }}>{fmtNgn(p.amount_minor)}</td>
                    <td>{p.bank_code} · <code className="mono">{p.account_number_masked}</code></td>
                    <td><span className={`status-txt ${p.status === "paid" ? "status-txt--ok" : p.status === "rejected" ? "status-txt--bad" : "status-txt--warn"}`}>{p.status}</span></td>
                    <td className="tnum" style={{ fontSize: 12.5 }}>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right" }}>
                      {p.status === "pending" ? (
                        <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="btn btn--ok btn--xs" onClick={() => void settleOrReject(p.id, "settle_payout")}>Mark paid</button>
                          <button type="button" className="btn btn--danger btn--xs" onClick={() => void settleOrReject(p.id, "reject_payout")}>Reject</button>
                        </div>
                      ) : null}
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

/* ==========================================================================
   2. CLOUD EXAM BACKUPS & 7-DAY REMINDER SCHEDULE TAB
   ========================================================================== */
export function HqBackupsTab({ onToast }: { onToast: (msg: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [daysInput, setDaysInput] = useState("7");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/v1/hq/backups", { credentials: "include" }).then((r) => r.json()).catch(() => null);
    if (res?.ok) {
      setData(res);
      setDaysInput(String(res.backup_reminder_days || 7));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveReminderDays(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/hq/backups", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup_reminder_days: Number(daysInput || 7) }),
      }).then((r) => r.json());
      onToast(res?.message || "Backup reminder updated.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Cloud exam backups</h1>
          <p>Configure how often schools are reminded to back up their exam database to CogniTara Cloud, and inspect fleet backup health.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>Refresh</button>
      </div>

      {data?.summary ? (
        <div className="hq-kpi-strip">
          <div className="hq-kpi"><span className="hq-kpi__lbl">Reminder schedule</span><span className="hq-kpi__val">Every {data.backup_reminder_days}d</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Cloud snapshots</span><span className="hq-kpi__val">{data.summary.total_backups}</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Total storage</span><span className="hq-kpi__val">{fmtBytes(data.summary.total_storage_bytes)}</span></div>
          <div className="hq-kpi"><span className="hq-kpi__lbl">Overdue schools</span><span className="hq-kpi__val" style={{ color: data.summary.overdue_schools > 0 ? "var(--warn)" : "var(--ok)" }}>{data.summary.overdue_schools}</span></div>
        </div>
      ) : null}

      <section className="card">
        <form onSubmit={saveReminderDays} style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="remDays">Backup reminder interval (days)</label>
            <input id="remDays" type="number" min={1} max={365} value={daysInput} onChange={(e) => setDaysInput(e.target.value)} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving…" : "Save reminder interval"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Schools automatically see a reminder in CogniTara Studio Desktop and on their dashboard when overdue.
          </span>
        </form>
      </section>

      <div className="hq-table-wrap">
        <table className="hq-table">
          <thead>
            <tr><th>School</th><th>Last cloud backup</th><th>Snapshots</th><th>Storage</th><th>Health</th></tr>
          </thead>
          <tbody>
            {(data?.school_health || []).map((s: any) => {
              const cutoff = Date.now() - (data.backup_reminder_days || 7) * 86400 * 1000;
              const overdue = !s.last_cloud_backup_at || new Date(s.last_cloud_backup_at).getTime() < cutoff;
              return (
                <tr key={s.school_id}>
                  <td><strong>{s.school_name}</strong><div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.owner_email}</div></td>
                  <td className="tnum">{s.last_cloud_backup_at ? new Date(s.last_cloud_backup_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never"}</td>
                  <td className="mono">{s.backup_count}</td>
                  <td className="mono">{fmtBytes(s.storage_bytes)}</td>
                  <td><span className={`status-txt ${overdue ? "status-txt--warn" : "status-txt--ok"}`}>{overdue ? "Reminder due" : "Up to date"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. BROADCASTS & FLAGS TAB
   ========================================================================== */
export function HqBroadcastsTab({
  settings,
  onSaveSettings,
}: {
  settings: HqSettingsData;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [announcement, setAnnouncement] = useState(settings.global_announcement || "");
  const [level, setLevel] = useState(settings.global_announcement_level || "info");
  const [minVer, setMinVer] = useState(settings.min_desktop_version || "2.2.0");
  const [maintMode, setMaintMode] = useState(Boolean(settings.maintenance_mode));
  const [maintMsg, setMaintMsg] = useState(settings.maintenance_message || "");
  const [allowSignup, setAllowSignup] = useState(Boolean(settings.allow_self_signup));
  const [allowCheckout, setAllowCheckout] = useState(Boolean(settings.allow_paystack_checkout));
  const [allowTrial, setAllowTrial] = useState(Boolean(settings.allow_trial_activation));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        global_announcement: announcement,
        global_announcement_level: level,
        min_desktop_version: minVer,
        maintenance_mode: maintMode,
        maintenance_message: maintMsg,
        allow_self_signup: allowSignup,
        allow_paystack_checkout: allowCheckout,
        allow_trial_activation: allowTrial,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Broadcasts &amp; flags</h1>
          <p>Push live announcements to every school desktop app and toggle platform-wide access switches without releasing an app update.</p>
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Save flags"}</button>
      </div>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Global broadcast banner</h2>
        <div className="form-row">
          <div className="field">
            <label>Banner message (leave blank to hide)</label>
            <input value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Scheduled maintenance on Sunday 10 PM…" />
          </div>
          <div className="field">
            <label>Tone &amp; minimum Studio version</label>
            <div className="form-row">
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <input className="mono" value={minVer} onChange={(e) => setMinVer(e.target.value)} placeholder="2.2.3" />
            </div>
          </div>
        </div>

        <hr className="divider" />

        <div className="hq-switch-row">
          <div><strong>Allow new school sign-ups</strong><span>Let new schools create accounts on the website and in CogniTara Studio.</span></div>
          <input type="checkbox" checked={allowSignup} onChange={(e) => setAllowSignup(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>
        <div className="hq-switch-row">
          <div><strong>Allow Paystack checkout</strong><span>Turn off to pause new payments temporarily across web and desktop.</span></div>
          <input type="checkbox" checked={allowCheckout} onChange={(e) => setAllowCheckout(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>
        <div className="hq-switch-row">
          <div><strong>Allow 7-day free trial activation</strong><span>Let newly installed desktop servers activate a local trial before paying.</span></div>
          <input type="checkbox" checked={allowTrial} onChange={(e) => setAllowTrial(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>
        <div className="hq-switch-row">
          <div><strong>Maintenance mode</strong><span>Display a maintenance banner across cloud and desktop check-ins.</span></div>
          <input type="checkbox" checked={maintMode} onChange={(e) => setMaintMode(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>
        {maintMode ? (
          <div className="field">
            <label>Maintenance message</label>
            <input value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} placeholder="Back online in 15 minutes." />
          </div>
        ) : null}
      </section>
    </form>
  );
}

/* ==========================================================================
   4. EMAILS & OTP TAB
   ========================================================================== */
export function HqEmailsTab({
  settings,
  onSaveSettings,
  onTestProvider,
}: {
  settings: HqSettingsData;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onTestProvider: (provider: "paystack" | "brevo", extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [brevoKey, setBrevoKey] = useState("");
  const [senderEmail, setSenderEmail] = useState(settings.brevo_sender_email || "hello@cognitara.net");
  const [senderName, setSenderName] = useState(settings.brevo_sender_name || "CogniTara");
  const [requireOtp, setRequireOtp] = useState(Boolean(settings.require_email_otp));
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        brevo_api_key: brevoKey.trim() || undefined,
        brevo_sender_email: senderEmail.trim(),
        brevo_sender_name: senderName.trim(),
        require_email_otp: requireOtp,
      });
      setBrevoKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Emails &amp; OTP</h1>
          <p>Transactional delivery for signup verification codes, HQ 2FA security codes, password resets, and payment receipts.</p>
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Save email settings"}</button>
      </div>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div className="field">
          <label>
            <span>Brevo API v3 key</span>
            <span className="mono" style={{ fontSize: 11.5, color: settings.brevo_configured ? "var(--ok)" : "var(--ink-3)" }}>
              {settings.brevo_api_key_masked || "Not configured"}
            </span>
          </label>
          <input type="password" className="mono" value={brevoKey} onChange={(e) => setBrevoKey(e.target.value)} placeholder="Replace: xkeysib-…" autoComplete="off" />
        </div>

        <div className="form-row">
          <div className="field">
            <label>Verified sender email</label>
            <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Sender display name</label>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
          </div>
        </div>

        <div className="hq-switch-row">
          <div>
            <strong>Require 6-digit Email OTP for school accounts</strong>
            <span>Schools verify their email on registration and sign-in across both web and CogniTara Studio desktop.</span>
          </div>
          <input type="checkbox" checked={requireOtp} onChange={(e) => setRequireOtp(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>

        <div className="hq-section-block">
          <h3>Test live delivery</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void onTestProvider("brevo")}>
              Verify Brevo API key
            </button>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Send test code to email…"
              className="hq-search"
              style={{ maxWidth: 260 }}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!testEmail.includes("@")}
              onClick={() => void onTestProvider("brevo", { test_email: testEmail.trim() })}
            >
              Send test email
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

/* ==========================================================================
   5. STAFF & 2FA SECURITY TAB (TOTP AUTHENTICATOR + RECOVERY CODES + STAFF)
   ========================================================================== */
export function HqStaffSecurityTab({
  settings,
  onSaveSettings,
  onToast,
}: {
  settings: HqSettingsData;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const [totpState, setTotpState] = useState<{ totp_enabled: boolean; recovery_codes_remaining: number; setup?: { secret: string; otpauth_uri: string } | null } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePw, setDisablePw] = useState("");
  const [staff, setStaff] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [requireHq2fa, setRequireHq2fa] = useState(Boolean(settings.require_hq_2fa));

  async function loadAll() {
    const [tRes, sRes] = await Promise.all([
      fetch("/api/v1/hq/auth/totp", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/staff", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    ]);
    if (tRes?.ok) setTotpState(tRes);
    if (sRes?.ok) setStaff(sRes.staff || []);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function startTotpSetup() {
    const res = await fetch("/api/v1/hq/auth/totp?init=1", { credentials: "include" }).then((r) => r.json());
    if (res?.ok) setTotpState(res);
  }

  async function enableTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!totpState?.setup?.secret) return;
    const res = await fetch("/api/v1/hq/auth/totp", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: totpState.setup.secret, code: verifyCode.trim() }),
    }).then((r) => r.json());
    onToast(res?.message || (res?.ok ? "Authenticator enabled!" : "Code did not match."));
    if (res?.ok) {
      setRecoveryCodes(res.recovery_codes || []);
      setVerifyCode("");
      await loadAll();
    }
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/v1/hq/auth/totp", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePw }),
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    if (res?.ok) {
      setDisablePw("");
      setRecoveryCodes([]);
      await loadAll();
    }
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/v1/hq/staff", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: newName, email: newEmail, password: newPass }),
    }).then((r) => r.json());
    onToast(res?.message || "Staff updated.");
    if (res?.ok) {
      setNewName("");
      setNewEmail("");
      setNewPass("");
      await loadAll();
    }
  }

  async function toggleStaff(userId: string) {
    const res = await fetch("/api/v1/hq/staff", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_status", user_id: userId }),
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    await loadAll();
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Staff &amp; 2FA security</h1>
          <p>Protect the HQ Admin Console with mandatory two-factor authentication, authenticator apps, recovery codes, and persistent brute-force lockouts.</p>
        </div>
      </div>

      <div className="hq-grid-equal">
        <section className="card" style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Authenticator app (TOTP 2FA)</h2>
            <span className={`status-txt ${totpState?.totp_enabled ? "status-txt--ok" : "status-txt--warn"}`}>
              {totpState?.totp_enabled ? "Enabled" : "Not set up"}
            </span>
          </div>

          <div className="hq-switch-row">
            <div>
              <strong>Enforce mandatory 2FA for all HQ logins</strong>
              <span>Requires Authenticator App or Email Security Code on every HQ sign-in.</span>
            </div>
            <input
              type="checkbox"
              checked={requireHq2fa}
              onChange={(e) => {
                const next = e.target.checked;
                setRequireHq2fa(next);
                void onSaveSettings({ require_hq_2fa: next });
              }}
              style={{ width: 18, height: 18 }}
            />
          </div>

          {recoveryCodes.length > 0 ? (
            <div className="alert alert--ok" style={{ display: "grid", gap: 8 }}>
              <strong>Save your 8 single-use recovery codes now (shown once):</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {recoveryCodes.map((c) => (
                  <code key={c} className="mono" style={{ fontSize: 13 }}>{c}</code>
                ))}
              </div>
            </div>
          ) : null}

          {!totpState?.totp_enabled ? (
            totpState?.setup ? (
              <form className="form-grid" onSubmit={enableTotp}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
                  Scan this QR code with Google Authenticator, Authy, or 1Password — or enter the setup key manually:
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpState.setup.otpauth_uri)}`}
                    alt="Authenticator QR code"
                    width={160}
                    height={160}
                    style={{ borderRadius: 10, background: "#fff", padding: 6 }}
                  />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>Manual setup key</div>
                    <code className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{totpState.setup.secret}</code>
                  </div>
                </div>
                <div className="field">
                  <label>Enter 6-digit code from your app to activate</label>
                  <input
                    className="mono"
                    maxLength={6}
                    required
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <button type="submit" className="btn btn--primary" disabled={verifyCode.length < 6}>
                  Verify &amp; enable Authenticator 2FA
                </button>
              </form>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => void startTotpSetup()}>
                Set up Authenticator app (QR)
              </button>
            )
          ) : (
            <form className="form-grid" onSubmit={disableTotp}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
                Authenticator app 2FA is active ({totpState.recovery_codes_remaining} unused recovery codes remaining).
              </p>
              <div className="field">
                <label>Confirm password to disable authenticator 2FA</label>
                <input type="password" required value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder="Current HQ password" />
              </div>
              <button type="submit" className="btn btn--danger btn--sm">Disable Authenticator 2FA</button>
            </form>
          )}
        </section>

        <section className="card" style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Admin staff accounts</h2>
          <div className="hq-table-wrap">
            <table className="hq-table">
              <thead>
                <tr><th>Admin</th><th>2FA</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {staff.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{st.full_name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{st.email}</div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{st.totp_enabled ? "TOTP + Email" : "Email OTP"}</td>
                    <td><span className={`status-txt ${st.status === "active" ? "status-txt--ok" : "status-txt--bad"}`}>{st.status}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {st.role !== "hq_super_admin" ? (
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => void toggleStaff(st.id)}>
                          {st.status === "active" ? "Suspend" : "Restore"}
                        </button>
                      ) : (
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>Owner</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <hr className="divider" />

          <form className="form-grid" onSubmit={addStaff}>
            <strong style={{ fontSize: 13.5 }}>Add HQ Admin staff</strong>
            <div className="form-row">
              <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)" }} />
              <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="staff@cognitara.net" style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" minLength={10} required value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Strong password (10+ characters)" style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--field)", color: "var(--ink)" }} />
              <button type="submit" className="btn btn--primary btn--sm">Add admin</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
