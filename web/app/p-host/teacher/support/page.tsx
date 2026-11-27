"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OfflineSchoolMeta, TeacherShell } from "@/components/portal/OfflineShell";
import { LiveSupportConsole } from "@/components/portal/LiveSupportConsole";

export default function TeacherTechnicalSupportPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");

  useEffect(() => {
    fetch("/api/v1/portal/exams", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.ok) {
          setSchool(json.school);
          setTeacherName(json.teacher?.full_name || json.teacher?.username || "Teacher");
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="support" crumb="Live Support" school={school} username={teacherName}>
        <LiveSupportConsole role="teacher" />
      </TeacherShell>
    </div>
  );
}
