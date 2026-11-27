import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight subdomain routing for `portal.cognitara.net`.
 * Matcher strictly excludes static assets, images, fonts, KaTeX, and /api so
 * Free Vercel Edge requests are never wasted on static asset loads.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const isPortalSubdomain = host.startsWith("portal.");
  if (!isPortalSubdomain) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;

  // Already routed to /portal or /api -> pass straight through
  if (pathname.startsWith("/portal") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Shareable school link: portal.cognitara.net/s/CT-XXXXX -> /portal?school=CT-XXXXX
  const schoolShortMatch = pathname.match(/^\/s\/([A-Za-z0-9-]+)\/?$/);
  if (schoolShortMatch) {
    const url = req.nextUrl.clone();
    url.pathname = "/portal";
    url.searchParams.set("school", schoolShortMatch[1].toUpperCase());
    return NextResponse.rewrite(url);
  }

  // Map portal.cognitara.net/* cleanly onto /portal/*
  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? "/portal" : `/portal${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match only page routes (exclude _next, api, static assets, brand PNGs, tour media, katex).
     */
    "/((?!api|_next/static|_next/image|brand|tour|katex|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js|mp4|woff|woff2|ttf|map|json|xml|txt)$).*)",
  ],
};
