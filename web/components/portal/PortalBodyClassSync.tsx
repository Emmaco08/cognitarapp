"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const PORTAL_BODY_CLASSES = [
  "ct-app",
  "ct-exam-studio",
  "ad-studio",
  "tc-studio",
  "st-body",
  "ed-body",
];

function resolveBodyClasses(pathname: string): string[] {
  const p = pathname.replace(/^\/p-host(?=\/|$)/, "") || "/";
  if (p.startsWith("/exam")) return ["ct-app", "ct-exam-studio"];
  if (p.startsWith("/admin")) return ["ct-app", "ad-studio"];
  if (p.startsWith("/teacher")) return ["ct-app", "tc-studio"];
  if (p.startsWith("/student") || p.startsWith("/result")) return ["st-body"];
  return ["ed-body"];
}

export function PortalBodyClassSync() {
  const pathname = usePathname() || "/";

  useLayoutEffect(() => {
    const body = document.body;
    if (!body) return;
    body.classList.remove(...PORTAL_BODY_CLASSES);
    const next = resolveBodyClasses(pathname);
    body.classList.add(...next);
    return () => {
      body.classList.remove(...PORTAL_BODY_CLASSES);
    };
  }, [pathname]);

  return null;
}
