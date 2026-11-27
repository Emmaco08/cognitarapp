"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OfflineSchoolMeta, TeacherShell } from "@/components/portal/OfflineShell";
import { StudentProfileView } from "@/components/portal/StudentProfileView";

export default function TeacherStudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studentId = Number(params?.studentId || 0);
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
      <TeacherShell active="dashboard" crumb="Student Profile" school={school} username={teacherName}>
        <StudentProfileView studentId={studentId} backHref="/teacher" backLabel="Back to Dashboard" />
      </TeacherShell>
    </div>
  );
}
