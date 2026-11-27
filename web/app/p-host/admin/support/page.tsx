"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";
import { LiveSupportConsole } from "@/components/portal/LiveSupportConsole";

export default function AdminLiveSupportPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/control", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.ok) setSchool(json.school);
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="support" crumb="Live Support & Pause" school={school}>
        <LiveSupportConsole role="admin" />
      </AdminShell>
    </div>
  );
}
