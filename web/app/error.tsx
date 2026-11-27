"use client";

import React, { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CogniTara route error:", error);
  }, [error]);

  return <ErrorScreen code={500} digest={error?.digest} onReset={reset} />;
}
