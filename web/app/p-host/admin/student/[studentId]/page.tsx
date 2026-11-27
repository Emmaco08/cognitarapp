"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";
import { StudentProfileView } from "@/components/portal/StudentProfileView";

export default function AdminStudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studentId = Number(params?.studentId || 0);
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
      <AdminShell active="students" crumb="Student Profile" school={school}>
        <StudentProfileView studentId={studentId} backHref="/admin#sec-students" backLabel="Students Directory" />
      </AdminShell>
    </div>
  );
}
