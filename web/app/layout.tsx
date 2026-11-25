import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CogniTara — Offline School CBT & Cloud Licensing",
  description:
    "Manage your school account, CogniTara Studio licences, cloud exam backups, and referral rewards.",
  icons: { icon: "/favicon.ico" },
};

const THEME_INIT_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=(p==='light'||p==='dark')?p:(localStorage.getItem('ct-cloud-theme')||'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
