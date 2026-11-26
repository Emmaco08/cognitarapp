import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "CogniTara | Offline School Exams from One Windows PC",
  description:
    "Install CogniTara Studio on one lab PC to run offline LAN school exams for up to 300 student devices, with Ed25519 licensing and encrypted cloud backups.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "CogniTara | Offline School Exams from One Windows PC",
    description:
      "Serve up to 300 student devices over school Wi-Fi with zero exam-day internet required.",
    type: "website",
  },
};

const THEME_INIT_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=(p==='light'||p==='dark')?p:(localStorage.getItem('ct-cloud-theme')||'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
