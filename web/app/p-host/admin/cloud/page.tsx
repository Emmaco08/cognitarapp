"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../../portal.css";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";
import {
  AdminCloudViews,
  CloudAccountPayload,
  CloudBackupPayload,
  CloudPaymentRecord,
  CloudReferralPayload,
} from "@/components/portal/AdminCloudViews";

function AdminCloudHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = (searchParams.get("tab") || "licence").toLowerCase();
  const tab: "licence" | "backups" | "referrals" =
    rawTab === "backups" ? "backups" : rawTab === "referrals" ? "referrals" : "licence";

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [account, setAccount] = useState<CloudAccountPayload | null>(null);
  const [payments, setPayments] = useState<CloudPaymentRecord[]>([]);
  const [backups, setBackups] = useState<CloudBackupPayload | null>(null);
  const [referrals, setReferrals] = useState<CloudReferralPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ctrlRes, accRes, payRes, bkRes, refRes] = await Promise.all([
        fetch("/api/v1/portal/control", { credentials: "include" }),
        fetch("/api/v1/account/me", { credentials: "include" }),
        fetch("/api/v1/account/payments", { credentials: "include" }),
        fetch("/api/v1/backups", { credentials: "include" }),
        fetch("/api/v1/referrals/me", { credentials: "include" }),
      ]);
      if (ctrlRes.status === 401 || ctrlRes.status === 403) {
        router.replace("/");
        return;
      }
      const ctrl = ctrlRes.ok ? await ctrlRes.json() : null;
      const acc = accRes.ok ? await accRes.json() : null;
      const pay = payRes.ok ? await payRes.json() : null;
      const bk = bkRes.ok ? await bkRes.json() : null;
      const rf = refRes.ok ? await refRes.json() : null;
      if (ctrl?.ok) setSchool(ctrl.school);
      if (acc?.ok) setAccount(acc);
      if (pay?.ok) setPayments(pay.payments || []);
      if (bk?.ok) setBackups(bk);
      if (rf?.ok) setReferrals(rf);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeNav =
    tab === "backups" ? "cloud_backups" : tab === "referrals" ? "cloud_referrals" : "cloud_licence";
  const crumbTitle =
    tab === "backups" ? "Cloud Backups" : tab === "referrals" ? "Referrals" : "Licence & Billing";

  return (
    <div className="ct-app ad-studio">
      <AdminShell active={activeNav} crumb={crumbTitle} school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">School Cloud Account</span>
            <h1>{crumbTitle}</h1>
            <p>Manage your school licence keys, encrypted exam database backups, and referral rewards.</p>
          </div>
          <div className="tc-head__actions">
            <div className="tcc-seg">
              <button
                type="button"
                className={`tcc-chip${tab === "licence" ? " is-active" : ""}`}
                onClick={() => router.push("/admin/cloud?tab=licence")}
              >
                Licence &amp; Billing
              </button>
              <button
                type="button"
                className={`tcc-chip${tab === "backups" ? " is-active" : ""}`}
                onClick={() => router.push("/admin/cloud?tab=backups")}
              >
                Cloud Backups
              </button>
              <button
                type="button"
                className={`tcc-chip${tab === "referrals" ? " is-active" : ""}`}
                onClick={() => router.push("/admin/cloud?tab=referrals")}
              >
                Referrals
              </button>
            </div>
          </div>
        </header>

        <AdminCloudViews
          section={tab}
          account={account}
          payments={payments}
          backups={backups}
          referrals={referrals}
          loadingCloud={loading}
          onRefreshAll={loadAll}
          onNotify={(msg) => showCtToast(msg, "ok")}
        />
      </AdminShell>
    </div>
  );
}

export default function AdminCloudPage() {
  return (
    <Suspense fallback={<div className="ct-app ad-studio" style={{ minHeight: "100vh" }} />}>
      <AdminCloudHubInner />
    </Suspense>
  );
}
