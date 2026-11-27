"use client";

import React, { useState } from "react";
import { PIconCloud, PIconCopy, PIconDownload, PIconGift, PIconKey, PIconTrash } from "./PortalIcons";

export interface CloudAccountPayload {
  user: { id: string; email: string; full_name: string; phone: string; role: string; status: string };
  school: {
    id: string;
    school_code?: string;
    school_name: string;
    country_code: string;
    status: string;
    last_cloud_backup_at?: string | null;
  } | null;
  referral_code: string | null;
  licenses: Array<{
    id: string;
    license_key: string;
    plan_tier: string;
    plan_name?: string;
    status: string;
    issued_at?: string;
    expires_at: string | null;
    signed_lease_json?: Record<string, unknown> | null;
  }>;
}

export interface CloudPaymentRecord {
  id: string;
  paystack_reference: string;
  currency: string;
  amount_minor: number;
  customer_paid_minor: number;
  fee_minor: number;
  discount_amount_minor: number;
  promo_code_text: string | null;
  payment_channel: string;
  paystack_sub_channel: string | null;
  is_test: boolean;
  status: string;
  paid_at: string | null;
  created_at: string;
  plan_name: string;
  license_key: string | null;
}

export interface CloudBackupPayload {
  backup_reminder_days: number;
  last_backup_at: string | null;
  days_since_last_backup: number | null;
  backup_due: boolean;
  backups: Array<{
    id: string;
    filename: string;
    label: string;
    app_version: string | null;
    raw_size_bytes: number;
    compressed_bytes: number;
    sha256: string;
    stats_json?: { exams?: number; students?: number; questions?: number; scores?: number };
    created_at: string;
  }>;
}

export interface CloudReferralPayload {
  referral: {
    referral_code: string;
    share_url: string;
    commission_pct: number;
    bonus_days: number;
    reward_mode: string;
  } | null;
  stats: {
    schools_signed_up: number;
    paid_conversions: number;
    wallet_balance_minor: number;
    total_earned_minor: number;
    total_bonus_days: number;
  };
  referred_schools: Array<{ id: string; school_name: string; created_at: string }>;
  conversions: Array<{
    id: string;
    referred_school_name: string;
    commission_amount_kobo: number;
    bonus_days_granted_referrer: number;
    status: string;
    created_at: string;
  }>;
  payout_requests: Array<{
    id: string;
    amount_minor: number;
    bank_code: string;
    account_number_masked: string;
    status: string;
    created_at: string;
  }>;
}

function fmtMoney(minor: number, currency = "NGN") {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtBytes(bytes: number) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface AdminCloudViewsProps {
  section: "licence" | "backups" | "referrals";
  account: CloudAccountPayload | null;
  payments: CloudPaymentRecord[];
  backups: CloudBackupPayload | null;
  referrals: CloudReferralPayload | null;
  loadingCloud: boolean;
  onRefreshAll: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function AdminCloudViews({
  section,
  account,
  payments,
  backups,
  referrals,
  loadingCloud,
  onRefreshAll,
  onNotify,
}: AdminCloudViewsProps) {
  const [copiedId, setCopiedId] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [backupBusyId, setBackupBusyId] = useState("");

  const [payoutAmt, setPayoutAmt] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutAcct, setPayoutAcct] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);

  function copyVal(text: string, id: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? "" : cur)), 1800);
  }

  function downloadLeaseFile(lic: CloudAccountPayload["licenses"][number]) {
    if (!lic.signed_lease_json) return;
    const blob = new Blob([JSON.stringify(lic.signed_lease_json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognitara-licence-${lic.license_key}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    const code = redeemCode.trim().toUpperCase();
    if (!code || !account?.school) return;
    setRedeemBusy(true);
    try {
      const res = await fetch("/api/v1/promo/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          school_name: account.school.school_name,
          email: account.user.email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        onNotify(data.message || "Could not redeem voucher code");
      } else {
        setRedeemCode("");
        onNotify(data.message || "Voucher redeemed and licence activated");
        await onRefreshAll();
      }
    } finally {
      setRedeemBusy(false);
    }
  }

  async function syncBackupToPortal(backupId: string) {
    setBackupBusyId(`sync:${backupId}`);
    try {
      const res = await fetch("/api/v1/portal/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onNotify(data.message || "Backup synced to Online Portal");
        await onRefreshAll();
      } else {
        onNotify(data.message || "Could not sync backup");
      }
    } finally {
      setBackupBusyId("");
    }
  }

  async function deleteBackup(backupId: string) {
    if (!window.confirm("Delete this cloud backup snapshot permanently?")) return;
    setBackupBusyId(`del:${backupId}`);
    try {
      const res = await fetch(`/api/v1/backups?id=${encodeURIComponent(backupId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onNotify("Cloud backup deleted");
        await onRefreshAll();
      } else {
        onNotify(data.message || "Could not delete backup");
      }
    } finally {
      setBackupBusyId("");
    }
  }

  async function submitPayout(e: React.FormEvent) {
    e.preventDefault();
    setPayoutBusy(true);
    try {
      const res = await fetch("/api/v1/referrals/me", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_ngn: Number(payoutAmt),
          bank_code: payoutBank.trim(),
          account_number: payoutAcct.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPayoutAmt("");
        setPayoutBank("");
        setPayoutAcct("");
        onNotify(data.message || "Payout request submitted");
        await onRefreshAll();
      } else {
        onNotify(data.message || "Could not submit payout request");
      }
    } finally {
      setPayoutBusy(false);
    }
  }

  if (loadingCloud) {
    return (
      <div className="pt-card pt-card--pad" style={{ textAlign: "center", color: "var(--pt-ink-2)" }}>
        Loading school account records...
      </div>
    );
  }

  const activeLicense = account?.licenses?.find((l) => l.status === "active") || account?.licenses?.[0] || null;

  if (section === "licence") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="pt-grid-2">
          {/* Active School Licence Card */}
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>School Licence</h2>
                <p>Paste this licence key inside CogniTara Studio Desktop to renew</p>
              </div>
              <span className={`pt-status ${activeLicense?.status === "active" ? "is-live" : ""}`}>
                <span className="pt-dot" />
                {activeLicense ? activeLicense.status : "No licence"}
              </span>
            </div>

            <div className="pt-card__body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {activeLicense ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: "var(--pt-well)",
                    border: "1px solid var(--pt-line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                      {activeLicense.plan_name || activeLicense.plan_tier}
                    </div>
                    <div className="pt-mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                      {activeLicense.license_key}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pt-ink-2)", marginTop: 4 }}>
                      {activeLicense.expires_at
                        ? `Valid until ${fmtDate(activeLicense.expires_at)}`
                        : "Lifetime school licence"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="pt-btn pt-btn--sm"
                      onClick={() => copyVal(activeLicense.license_key, "lic")}
                    >
                      <PIconCopy size={13} />
                      <span>{copiedId === "lic" ? "Copied" : "Copy key"}</span>
                    </button>
                    {activeLicense.signed_lease_json ? (
                      <button
                        type="button"
                        className="pt-btn pt-btn--sm"
                        onClick={() => downloadLeaseFile(activeLicense)}
                      >
                        <PIconDownload size={13} />
                        <span>Offline file</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="pt-alert">
                  No active desktop licence found yet. Purchase a school plan on cognitara.net/license or redeem a voucher below.
                </div>
              )}

              <form onSubmit={handleRedeem} style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  className="pt-input pt-mono"
                  style={{ height: 38, textTransform: "uppercase" }}
                  placeholder="CT-RDM-XXXX-XXXX"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                />
                <button type="submit" className="pt-btn" disabled={redeemBusy || !redeemCode.trim()}>
                  {redeemBusy ? "Redeeming..." : "Redeem"}
                </button>
              </form>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href="https://cognitara.net/license"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-btn pt-btn--primary pt-btn--sm"
                >
                  <PIconKey size={14} />
                  <span>Buy or renew licence</span>
                </a>
                <a
                  href="https://cognitara.net/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-btn pt-btn--sm"
                >
                  <PIconDownload size={14} />
                  <span>Download Studio Desktop</span>
                </a>
              </div>
            </div>
          </section>

          {/* School Account Profile Card */}
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>School Account Profile</h2>
                <p>Super admin credentials linked to your cloud backups and School ID</p>
              </div>
            </div>
            <div className="pt-card__body">
              <div className="pt-kv-list">
                <div className="pt-kv-row">
                  <span>School name</span>
                  <strong>{account?.school?.school_name || "-"}</strong>
                </div>
                <div className="pt-kv-row">
                  <span>School ID</span>
                  <strong className="pt-mono">{account?.school?.school_code || "-"}</strong>
                </div>
                <div className="pt-kv-row">
                  <span>Super admin email</span>
                  <strong className="pt-mono" style={{ fontSize: 13 }}>{account?.user?.email || "-"}</strong>
                </div>
                <div className="pt-kv-row">
                  <span>Account status</span>
                  <span className="pt-status is-live">
                    <span className="pt-dot" />
                    {account?.school?.status || "active"}
                  </span>
                </div>
                <div className="pt-kv-row">
                  <span>Last cloud backup</span>
                  <strong>
                    {account?.school?.last_cloud_backup_at || backups?.last_backup_at
                      ? fmtDate(account?.school?.last_cloud_backup_at || backups?.last_backup_at)
                      : "Not synced yet"}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Payment History & PDF Receipts */}
        <section className="pt-card">
          <div className="pt-card__head">
            <div className="pt-card__title">
              <h2>Payment History &amp; Receipts</h2>
              <p>Confirmed licence orders with downloadable PDF receipts</p>
            </div>
            <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
              {payments.length} record{payments.length === 1 ? "" : "s"}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="pt-empty">
              <span className="pt-empty__ico">
                <PIconKey size={18} />
              </span>
              <strong>No payment orders recorded yet</strong>
              <p>Completed licence purchases and redeemed vouchers will appear here with PDF receipts.</p>
            </div>
          ) : (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="pt-mono" style={{ fontSize: 12.5 }}>{p.paystack_reference}</td>
                      <td>
                        <strong>{p.plan_name}</strong>
                        {p.license_key ? (
                          <div className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            {p.license_key}
                          </div>
                        ) : null}
                      </td>
                      <td className="pt-mono">
                        {fmtMoney(
                          Number(p.customer_paid_minor) > 0 ? p.customer_paid_minor : p.amount_minor,
                          p.currency
                        )}
                      </td>
                      <td style={{ color: "var(--pt-ink-2)" }}>{fmtDate(p.paid_at || p.created_at)}</td>
                      <td>
                        <span className={`pt-status ${p.status === "success" ? "is-live" : ""}`}>
                          <span className="pt-dot" />
                          {p.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {p.status === "success" ? (
                          <a
                            href={`/api/v1/payments/receipt/${encodeURIComponent(p.paystack_reference)}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pt-btn pt-btn--sm"
                          >
                            <PIconDownload size={13} />
                            <span>PDF</span>
                          </a>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (section === "backups") {
    const list = backups?.backups || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="pt-kpi-rail">
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Saved snapshots</span>
            <strong className="pt-kpi-cell__val">{list.length}</strong>
            <span className="pt-kpi-cell__meta">Up to 10 retained</span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Last backup</span>
            <strong className="pt-kpi-cell__val" style={{ fontSize: 20 }}>
              {backups?.last_backup_at ? fmtDate(backups.last_backup_at) : "None"}
            </strong>
            <span className="pt-kpi-cell__meta">
              {backups?.backup_due ? "Backup recommended" : "Up to date"}
            </span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Reminder cadence</span>
            <strong className="pt-kpi-cell__val">{backups?.backup_reminder_days || 7}d</strong>
            <span className="pt-kpi-cell__meta">Desktop studio schedule</span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Desktop installer</span>
            <strong className="pt-kpi-cell__val" style={{ fontSize: 20 }}>Windows</strong>
            <span className="pt-kpi-cell__meta">
              <a href="https://cognitara.net/download" target="_blank" rel="noopener noreferrer" className="pt-kpi-link">
                Download app →
              </a>
            </span>
          </div>
        </div>

        <section className="pt-card">
          <div className="pt-card__head">
            <div className="pt-card__title">
              <h2>Encrypted Cloud Backups</h2>
              <p>Snapshots uploaded from CogniTara Studio Desktop. Sync any snapshot straight into the Online Portal</p>
            </div>
            <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
              {list.length} stored
            </span>
          </div>

          {list.length === 0 ? (
            <div className="pt-empty">
              <span className="pt-empty__ico">
                <PIconCloud size={18} />
              </span>
              <strong>No cloud backups uploaded yet</strong>
              <p>Open CogniTara Studio on your school lab PC and run a Cloud Backup to sync your database here.</p>
            </div>
          ) : (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Records</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ display: "block", fontWeight: 600 }}>{b.label || b.filename}</strong>
                        <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                          {b.filename}
                        </span>
                      </td>
                      <td className="pt-mono" style={{ fontSize: 12.5, color: "var(--pt-ink-2)" }}>
                        {b.stats_json?.exams ?? 0} exams · {b.stats_json?.students ?? 0} students
                      </td>
                      <td className="pt-mono" style={{ color: "var(--pt-ink-2)" }}>
                        {fmtBytes(b.compressed_bytes)}
                      </td>
                      <td style={{ color: "var(--pt-ink-2)" }}>{fmtDate(b.created_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="pt-row-actions">
                          <button
                            type="button"
                            className="pt-btn pt-btn--primary pt-btn--sm"
                            disabled={backupBusyId === `sync:${b.id}`}
                            onClick={() => void syncBackupToPortal(b.id)}
                          >
                            {backupBusyId === `sync:${b.id}` ? "Syncing..." : "Sync to Portal"}
                          </button>
                          <a
                            href={`/api/v1/backups/${encodeURIComponent(b.id)}/download`}
                            className="pt-btn pt-btn--sm"
                          >
                            <PIconDownload size={13} />
                            <span>Download</span>
                          </a>
                          <button
                            type="button"
                            className="pt-btn pt-btn--ghost pt-btn--icon"
                            disabled={backupBusyId === `del:${b.id}`}
                            onClick={() => void deleteBackup(b.id)}
                            aria-label={`Delete ${b.filename}`}
                            title="Delete backup"
                          >
                            <PIconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // Referrals & Rewards
  const stats = referrals?.stats;
  const ref = referrals?.referral;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="pt-kpi-rail">
        <div className="pt-kpi-cell">
          <span className="pt-kpi-cell__label">Schools referred</span>
          <strong className="pt-kpi-cell__val">{stats?.schools_signed_up ?? 0}</strong>
          <span className="pt-kpi-cell__meta">Total signups</span>
        </div>
        <div className="pt-kpi-cell">
          <span className="pt-kpi-cell__label">Paid conversions</span>
          <strong className="pt-kpi-cell__val">{stats?.paid_conversions ?? 0}</strong>
          <span className="pt-kpi-cell__meta">Verified orders</span>
        </div>
        <div className="pt-kpi-cell">
          <span className="pt-kpi-cell__label">Wallet balance</span>
          <strong className="pt-kpi-cell__val">{fmtMoney(stats?.wallet_balance_minor ?? 0, "NGN")}</strong>
          <span className="pt-kpi-cell__meta">Available for payout</span>
        </div>
        <div className="pt-kpi-cell">
          <span className="pt-kpi-cell__label">Bonus licence days</span>
          <strong className="pt-kpi-cell__val">{stats?.total_bonus_days ?? 0}d</strong>
          <span className="pt-kpi-cell__meta">Earned from referrals</span>
        </div>
      </div>

      <div className="pt-grid-2">
        <section className="pt-card">
          <div className="pt-card__head">
            <div className="pt-card__title">
              <h2>Your Referral Link</h2>
              <p>
                Earn {ref?.commission_pct ?? 15}% commission and {ref?.bonus_days ?? 14} bonus days per paid school
              </p>
            </div>
          </div>
          <div className="pt-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="pt-kv-list">
              <div className="pt-kv-row">
                <span>Referral code</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong className="pt-mono">{ref?.referral_code || account?.referral_code || "-"}</strong>
                  {ref?.referral_code ? (
                    <button
                      type="button"
                      className="pt-btn pt-btn--sm"
                      onClick={() => copyVal(ref.referral_code, "refcode")}
                    >
                      {copiedId === "refcode" ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="pt-kv-row">
                <span>Share URL</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-2)" }}>
                    {ref?.share_url || "https://cognitara.net/signup"}
                  </span>
                  {ref?.share_url ? (
                    <button
                      type="button"
                      className="pt-btn pt-btn--sm"
                      onClick={() => copyVal(ref.share_url, "refurl")}
                    >
                      {copiedId === "refurl" ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-card">
          <div className="pt-card__head">
            <div className="pt-card__title">
              <h2>Request Payout</h2>
              <p>Minimum withdrawal is ₦2,000 to any Nigerian bank account</p>
            </div>
          </div>
          <div className="pt-card__body">
            <form className="pt-form" onSubmit={submitPayout}>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="poAmt">Amount (NGN)</label>
                  <input
                    id="poAmt"
                    type="number"
                    min={2000}
                    className="pt-input"
                    placeholder="5000"
                    value={payoutAmt}
                    onChange={(e) => setPayoutAmt(e.target.value)}
                    required
                  />
                </div>
                <div className="pt-field">
                  <label htmlFor="poBank">Bank name</label>
                  <input
                    id="poBank"
                    type="text"
                    className="pt-input"
                    placeholder="GTBank, Zenith, Access"
                    value={payoutBank}
                    onChange={(e) => setPayoutBank(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="pt-field">
                <label htmlFor="poAcct">Account number</label>
                <input
                  id="poAcct"
                  type="text"
                  className="pt-input pt-mono"
                  placeholder="0123456789"
                  value={payoutAcct}
                  onChange={(e) => setPayoutAcct(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="pt-btn pt-btn--primary"
                disabled={payoutBusy || (stats?.wallet_balance_minor ?? 0) < 200000}
              >
                <PIconGift size={14} />
                <span>{payoutBusy ? "Submitting..." : "Request payout"}</span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
