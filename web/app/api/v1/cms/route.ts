import { NextRequest, NextResponse } from "next/server";
import {
  getCmsAboutPage,
  getCmsSupportPage,
  getPublishedBlogPostBySlug,
  getPublishedBlogPosts,
  getPublishedChangelogs,
  getPublishedFaqs,
  getPublishedGuides,
  getPublishedRoadmap,
} from "@/lib/cms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const section = String(req.nextUrl.searchParams.get("section") || "").trim().toLowerCase();
    const slug = String(req.nextUrl.searchParams.get("slug") || "").trim();

    if (section === "blog") {
      if (slug) {
        const post = await getPublishedBlogPostBySlug(slug);
        if (!post) {
          return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true, post }, { headers: { "Cache-Control": "no-store" } });
      }
      const posts = await getPublishedBlogPosts();
      return NextResponse.json({ ok: true, posts }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "guide" || section === "guides") {
      const guides = await getPublishedGuides();
      return NextResponse.json({ ok: true, guides }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "faq") {
      const groups = await getPublishedFaqs();
      return NextResponse.json({ ok: true, groups }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "roadmap") {
      const items = await getPublishedRoadmap();
      return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "changelog" || section === "changelogs") {
      const releases = await getPublishedChangelogs();
      return NextResponse.json({ ok: true, releases }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "about") {
      const page = await getCmsAboutPage();
      return NextResponse.json({ ok: true, page }, { headers: { "Cache-Control": "no-store" } });
    }

    if (section === "support") {
      const page = await getCmsSupportPage();
      return NextResponse.json({ ok: true, page }, { headers: { "Cache-Control": "no-store" } });
    }

    const [posts, guides, faq, roadmap, changelogs, about, support] = await Promise.all([
      getPublishedBlogPosts(),
      getPublishedGuides(),
      getPublishedFaqs(),
      getPublishedRoadmap(),
      getPublishedChangelogs(),
      getCmsAboutPage(),
      getCmsSupportPage(),
    ]);

    return NextResponse.json(
      { ok: true, blog: posts, guides, faq, roadmap, changelogs, about, support },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Public CMS GET error:", err);
    return NextResponse.json({ ok: false, error: "cms_fetch_failed" }, { status: 500 });
  }
}
