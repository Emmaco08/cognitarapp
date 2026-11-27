"use client";

import React, { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

const THEME_INIT = `(function(){try{var t=localStorage.getItem('ct-portal-theme')||localStorage.getItem('ct-cloud-theme')||'light';document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CogniTara global error:", error);
  }, [error]);

  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>500 Server Error | CogniTara</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body style={{ margin: 0 }}>
        <ErrorScreen code={500} digest={error?.digest} onReset={reset} />
      </body>
    </html>
  );
}
