"use client";

import React, { useEffect, useState } from "react";
import { IconCheck } from "@/components/Icons";

export interface HqPaymentRow {
  id: string;
  paystack_reference: string;
  paystack_transaction_id?: number | null;
  currency: string;
  amount_minor: number;
  original_amount_minor: number;
  discount_amount_minor: number;
  fee_minor: number;
  customer_paid_minor: number;
  is_test: boolean;
  promo_code_text: string | null;
  payment_channel: string;
  paystack_sub_channel: string | null;
  verification_checks_json?: Array<{ step: string; ok: boolean; detail: string; at: string }>;
  status: string;
  paid_at: string | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
  created_at: string;
  notes?: string | null;
  school_id: string;
  school_name: string;
  full_name: string;
  email: string;
  plan_name: string;
  license_key: string | null;
  license_status: string | null;
}

export interface HqPaymentsKpis {
  paid_today_ngn_minor: number;
  paid_month_ngn_minor: number;
  waiting_24h_count: number;
  refunded_month_ngn_minor: number;
  test_payments_count: number;
}

interface HqPaymentsTabProps {
  purchases: HqPaymentRow[];
  kpis: HqPaymentsKpis;
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}

function fmtMoney(minor: number, currency = "NGN") {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function statusLabel(status: string) {
  if (status === "success") return { text: "Paid", cls: "status-txt--ok" };
  if (status === "initialized") return { text: "Not finished", cls: "status-txt--warn" };
  if (status === "failed") return { text: "Failed", cls: "status-txt--bad" };
  if (status === "refunded") return { text: "Refunded", cls: "status-txt--bad" };
  return { text: status, cls: "" };
}

export function HqPaymentsTab({ purchases, kpis, onRefresh, onToast }: HqPaymentsTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HqPaymentRow | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    action: "force_fulfill" | "mark_refunded";
    title: string;
    detail: string;
    reason?: string;
  } | null>(null);
  const [refundReason, setRefundReason] = useState("Customer refund requested");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmAction) setConfirmAction(null);
        else if (selected) setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, confirmAction]);

  const filtered = purchases.filter((r) => {
    if (filter === "paystack" && r.payment_channel !== "paystack") return false;
    if (filter === "redeem_code" && r.payment_channel !== "redeem_code") return false;
    if (filter === "pending" && r.status !== "initialized") return false;
    if (filter === "failed" && r.status !== "failed") return false;
    if (filter === "refunded" && r.status !== "refunded") return false;
    if (filter === "test" && !r.is_test) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(r.paystack_reference || "").toLowerCase().includes(q) ||
      String(r.school_name || "").toLowerCase().includes(q) ||
      String(r.email || "").toLowerCase().includes(q) ||
      String(r.license_key || "").toLowerCase().includes(q) ||
      String(r.promo_code_text || "").toLowerCase().includes(q)
    );
  });

  async function runPaymentAction(paymentId: string, action: string, reason?: string) {
    setBusyAction(action);
    try {
      const res = await fetch("/api/v1/hq/purchases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, action, reason }),
      }).then((r) => r.json());
      onToast(res?.message || (res?.ok ? "Done." : "Action failed."));
      setConfirmAction(null);
      await onRefresh();
      setSelected(null);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div>
      <div className="hq-head">
        <div>
          <h1>Payments</h1>
          <p>
            Every Paystack and voucher payment. Licences are issued only after our server verifies the
            payment with Paystack. Open a payment to inspect each check.
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      <div className="hq-kpi-strip">
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Paid today</span>
          <span className="hq-kpi__val">{fmtMoney(kpis.paid_today_ngn_minor, "NGN")}</span>
          <span className="hq-kpi__sub">Live payments only</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Paid this month</span>
          <span className="hq-kpi__val" style={{ color: "var(--ok)" }}>{fmtMoney(kpis.paid_month_ngn_minor, "NGN")}</span>
          <span className="hq-kpi__sub">{kpis.test_payments_count} test payment(s) excluded</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Waiting (last 24 h)</span>
          <span className="hq-kpi__val">{kpis.waiting_24h_count}</span>
          <span className="hq-kpi__sub">Started checkout, not finished</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Refunded this month</span>
          <span className="hq-kpi__val">{fmtMoney(kpis.refunded_month_ngn_minor, "NGN")}</span>
          <span className="hq-kpi__sub">Linked licences revoked</span>
        </div>
      </div>

      <div className="hq-toolbar">
        <div className="hq-chips">
          {[
            ["all", "All"],
            ["paystack", "Paystack"],
            ["redeem_code", "100% code"],
            ["pending", "Pending"],
            ["failed", "Failed"],
            ["refunded", "Refunded"],
            ["test", "Test"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`hq-chip ${filter === key ? "is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, school, or email"
          className="hq-search"
        />
      </div>

      <div className="hq-table-wrap">
        <table className="hq-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>School / Email</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Paid with</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>
                  No payments match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const st = statusLabel(p.status);
                const paidWith =
                  p.payment_channel === "redeem_code"
                    ? "100% code"
                    : p.payment_channel === "manual_hq"
                    ? "HQ grant"
                    : p.paystack_sub_channel
                    ? `Paystack · ${p.paystack_sub_channel}`
                    : "Paystack";

                return (
                  <tr key={p.id} className="is-clickable" onClick={() => setSelected(p)}>
                    <td className="mono" style={{ fontSize: 12 }}>{p.paystack_reference}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.email}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.school_name}</div>
                    </td>
                    <td>
                      <div>{p.plan_name}</div>
                      {p.promo_code_text ? (
                        <div className="mono" style={{ fontSize: 11, color: "var(--ok)" }}>{p.promo_code_text}</div>
                      ) : null}
                    </td>
                    <td className="mono" style={{ fontWeight: 620 }}>
                      {fmtMoney(p.customer_paid_minor || p.amount_minor, p.currency)}
                    </td>
                    <td>
                      <span>{paidWith}</span>
                      {p.is_test ? <span className="tag-test">Test</span> : null}
                    </td>
                    <td>
                      <span className={`status-txt ${st.cls}`}>{st.text}</span>
                    </td>
                    <td className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                      {new Date(p.paid_at || p.created_at).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Verification Checks Drawer */}
      {selected ? (
        <div className="hq-drawer-bg" onClick={() => setSelected(null)}>
          <aside className="hq-drawer" onClick={(e) => e.stopPropagation()} aria-label="Payment details">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 19 }}>{selected.school_name}</h2>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  {selected.paystack_reference}
                  {selected.is_test ? <span className="tag-test">Test</span> : null}
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <dl className="dl">
              <div><dt>Customer</dt><dd>{selected.full_name} ({selected.email})</dd></div>
              <div><dt>Plan</dt><dd>{selected.plan_name}</dd></div>
              <div><dt>Plan price</dt><dd className="mono">{fmtMoney(selected.original_amount_minor || selected.amount_minor, selected.currency)}</dd></div>
              {selected.discount_amount_minor > 0 ? (
                <div><dt>Discount ({selected.promo_code_text})</dt><dd className="mono" style={{ color: "var(--ok)" }}>-{fmtMoney(selected.discount_amount_minor, selected.currency)}</dd></div>
              ) : null}
              <div><dt>Paystack fee</dt><dd className="mono">{fmtMoney(selected.fee_minor || 0, selected.currency)}</dd></div>
              <div><dt>Customer paid</dt><dd className="mono" style={{ fontSize: 15 }}>{fmtMoney(selected.customer_paid_minor || selected.amount_minor, selected.currency)}</dd></div>
              <div><dt>Channel</dt><dd>{selected.paystack_sub_channel ? `Paystack · ${selected.paystack_sub_channel}` : selected.payment_channel}</dd></div>
              <div><dt>Status</dt><dd><span className={`status-txt ${statusLabel(selected.status).cls}`}>{statusLabel(selected.status).text}</span></dd></div>
              <div><dt>Issued licence</dt><dd className="mono">{selected.license_key || "None yet"}</dd></div>
            </dl>

            <div className="hq-section-block">
              <h3>Server verification checks</h3>
              {Array.isArray(selected.verification_checks_json) && selected.verification_checks_json.length > 0 ? (
                <div className="checks-list">
                  {selected.verification_checks_json.map((chk, idx) => (
                    <div key={idx} className="check-row">
                      <div>
                        <strong style={{ fontSize: 13 }}>{chk.step}</strong>
                        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{chk.detail}</div>
                      </div>
                      <span className={`status-txt ${chk.ok ? "status-txt--ok" : "status-txt--bad"}`}>
                        {chk.ok ? <IconCheck size={14} /> : "✕"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)" }}>
                  No server checks recorded yet. Click Re-verify with Paystack below to check live status.
                </p>
              )}
            </div>

            <div className="hq-section-block">
              <h3>Actions</h3>
              <div className="hq-btn-row">
                {selected.status !== "success" && selected.payment_channel === "paystack" ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busyAction !== null}
                    onClick={() => void runPaymentAction(selected.id, "verify_paystack")}
                  >
                    {busyAction === "verify_paystack" ? "Checking Paystack…" : "Re-verify with Paystack"}
                  </button>
                ) : null}

                {selected.status !== "success" ? (
                  <button
                    type="button"
                    className="btn btn--ok btn--sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      setConfirmAction({
                        action: "force_fulfill",
                        title: "Manually confirm payment?",
                        detail: `This will mark ${selected.paystack_reference} as Paid and issue an active ${selected.plan_name} licence to ${selected.school_name}.`,
                      })
                    }
                  >
                    Force fulfill
                  </button>
                ) : null}

                {selected.status !== "refunded" ? (
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      setConfirmAction({
                        action: "mark_refunded",
                        title: "Mark payment as refunded?",
                        detail: `This marks ${selected.paystack_reference} refunded, immediately revokes its linked licence, and reverses any referral commission.`,
                      })
                    }
                  >
                    Mark refunded &amp; revoke
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Safe In-App Confirmation Modal */}
      {confirmAction && selected ? (
        <div className="modal-bg" onClick={() => setConfirmAction(null)}>
          <div className="modal-panel" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>{confirmAction.title}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--ink-2)" }}>{confirmAction.detail}</p>
            {confirmAction.action === "mark_refunded" ? (
              <div className="field" style={{ marginBottom: 16 }}>
                <label htmlFor="refReason">Refund reason (logged in audit)</label>
                <input id="refReason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
              </div>
            ) : null}
            <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn--sm ${confirmAction.action === "mark_refunded" ? "btn--danger" : "btn--primary"}`}
                disabled={busyAction !== null}
                onClick={() => void runPaymentAction(selected.id, confirmAction.action, refundReason)}
              >
                {busyAction ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
