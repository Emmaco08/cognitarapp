import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sql.js"],
  async redirects() {
    return [
      {
        source: "/portal",
        has: [{ type: "host", value: "portal\\..*" }],
        destination: "/",
        permanent: true,
      },
      {
        source: "/portal/:path*",
        has: [{ type: "host", value: "portal\\..*" }],
        destination: "/:path*",
        permanent: true,
      },
      {
        source: "/dashboard",
        has: [{ type: "host", value: "portal\\..*" }],
        destination: "/admin",
        permanent: true,
      },
      {
        source: "/dashboard",
        missing: [{ type: "host", value: "portal\\..*" }],
        destination: "https://portal.cognitara.net/admin",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Host-isolated Online Exam Portal exclusively on portal.cognitara.net
        // Zero Edge Middleware invocations on Free Vercel Hobby!
        {
          source: "/s/:code",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host?school=:code",
        },
        {
          source: "/",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host",
        },
        {
          source: "/student",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host/student",
        },
        {
          source: "/teacher",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host/teacher",
        },
        {
          source: "/admin",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host/admin",
        },
        {
          source: "/exam/:examId",
          has: [{ type: "host", value: "portal\\..*" }],
          destination: "/p-host/exam/:examId",
        },
        // Block direct access to internal /p-host on non-portal hosts
        {
          source: "/p-host",
          missing: [{ type: "host", value: "portal\\..*" }],
          destination: "/__not_found__",
        },
        {
          source: "/p-host/:path*",
          missing: [{ type: "host", value: "portal\\..*" }],
          destination: "/__not_found__",
        },
      ],
    };
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://api.qrserver.com https://*.paystack.co",
      "connect-src 'self' https://api.paystack.co https://standard.paystack.co https://checkout.paystack.com https://api.github.com",
      "frame-src 'self' https://checkout.paystack.com https://standard.paystack.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.paystack.com",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/katex/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/hq/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
    ];
  },
};

export default nextConfig;
