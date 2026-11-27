"use client";

import React, { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CogniTara portal error:", error);
  }, [error]);

  return <ErrorScreen code={500} digest={error?.digest} onReset={reset} />;
}
