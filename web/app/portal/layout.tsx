import type { Metadata } from "next";
import React from "react";
import "./portal.css";

export const metadata: Metadata = {
  title: "CogniTara Online Exam Portal",
  description:
    "Sign in with your School ID to take exams online, author exams from home, and manage school online access.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="pt-root">{children}</div>;
}
