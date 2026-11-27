import type { Metadata } from "next";
import React from "react";
import { PortalBodyClassSync } from "@/components/portal/PortalBodyClassSync";

export const metadata: Metadata = {
  title: "CogniTara Online Exam Portal",
  description:
    "Sign in with your School ID to take exams online, author exams from home, and manage school online access.",
};

const OFFLINE_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var q=new URLSearchParams(location.search).get('theme');var saved=localStorage.getItem('ct-theme')||localStorage.getItem('ct-cloud-theme');var theme=(q==='light'||q==='dark')?q:(saved==='dark'?'dark':'light');d.setAttribute('data-theme',theme);if(localStorage.getItem('ct-sidebar')==='collapsed')d.setAttribute('data-ct-sidebar','collapsed');var p=location.pathname.replace(/^\\/p-host(?=\\/|$)/,'')||'/';var cls=['ed-body'];if(p.indexOf('/exam')===0)cls=['ct-app','ct-exam-studio'];else if(p.indexOf('/admin')===0)cls=['ct-app','ad-studio'];else if(p.indexOf('/teacher')===0)cls=['ct-app','tc-studio'];else if(p.indexOf('/student')===0||p.indexOf('/result')===0)cls=['st-body'];if(document.body){for(var i=0;i<cls.length;i++)document.body.classList.add(cls[i]);}}catch(e){}})();`;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-offline-root">
      <link rel="preload" href="/static/fonts/ui/PlusJakartaSans-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/static/css/cognitara-web.css" />
      <link rel="stylesheet" href="/static/css/cognitara-editorial-auth.css" />
      <link rel="stylesheet" href="/static/css/cognitara-student-studio.css" />
      <link rel="stylesheet" href="/static/css/cognitara-teacher-studio.css" />
      <link rel="stylesheet" href="/static/css/cognitara-admin-studio.css" />
      <link rel="stylesheet" href="/static/css/cognitara-offline-pages.css" />
      <link rel="stylesheet" href="/katex/katex.min.css" />
      <script dangerouslySetInnerHTML={{ __html: OFFLINE_BOOT_SCRIPT }} />
      <PortalBodyClassSync />
      {children}
    </div>
  );
}
