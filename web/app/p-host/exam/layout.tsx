import React from "react";

export default function PortalExamRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/static/css/cognitara-exam-base.css" />
      <link rel="stylesheet" href="/static/css/cognitara-exam-studio.css" />
      {children}
    </>
  );
}
