import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CogniTara Cloud — School Licensing & Studio Sync",
  description:
    "Create your school account, manage CogniTara Studio licences, and sync offline-first LAN CBT exam servers.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
