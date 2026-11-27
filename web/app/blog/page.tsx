"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { BLOG_POSTS, type BlogPost } from "@/lib/site-content";

const CATEGORIES: Array<"All" | BlogPost["category"]> = [
  "All",
  "Exam Reliability",
  "Engineering",
  "Releases",
  "Guides",
];

export default function BlogPage() {
  const [cat, setCat] = useState<"All" | BlogPost["category"]>("All");

  const visible = useMemo(() => {
    if (cat === "All") return BLOG_POSTS;
    return BLOG_POSTS.filter((p) => p.category === cat);
  }, [cat]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/blog" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">Blog</p>
          <h1 className="rs-page-title">Notes from the build</h1>
          <p className="rs-page-lead">
            Engineering CogniTara, the reliability decisions behind our offline exam server, and lessons from real school exam halls.
          </p>
        </header>

        <div className="rs-filter-row" role="group" aria-label="Filter blog posts">
          {CATEGORIES.map((c) => {
            const cnt = c === "All" ? BLOG_POSTS.length : BLOG_POSTS.filter((p) => p.category === c).length;
            return (
              <button
                key={c}
                type="button"
                className="rs-filter-pill"
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
              >
                <span>{c === "All" ? "All posts" : c}</span>
                <span className="rs-filter-count">{cnt}</span>
              </button>
            );
          })}
        </div>

        <div className="rs-blog-list">
          {visible.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="rs-blog-row">
              <div className="rs-blog-meta">
                <span className="rs-blog-avatar" aria-hidden="true">
                  {post.authorInitials}
                </span>
                <span>{post.author}</span>
                <span>·</span>
                <time>{post.date}</time>
                <span>/</span>
                <strong style={{ color: "var(--rs-ink)", fontWeight: 500 }}>{post.category}</strong>
                <span>·</span>
                <span>{post.readTime}</span>
              </div>
              <h2 className="rs-blog-title">{post.title}</h2>
              <p className="rs-blog-excerpt">{post.excerpt}</p>
            </Link>
          ))}
        </div>

        <p className="rs-subpage-note">
          Looking for release notes? See <Link href="/changelogs">Updates</Link>. Want practical setup steps? Browse{" "}
          <Link href="/guides">How-to Guides</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
