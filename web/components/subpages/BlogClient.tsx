"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlogPost } from "@/lib/site-content";

export default function BlogClient({ posts }: { posts: BlogPost[] }) {
  const [activeCat, setActiveCat] = useState<string>("All");

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of posts) {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        list.push(p.category);
      }
    }
    return ["All", ...list];
  }, [posts]);

  const visible = useMemo(() => {
    if (activeCat === "All") return posts;
    return posts.filter((p) => p.category === activeCat);
  }, [activeCat, posts]);

  return (
    <>
      <div className="rs-seg-wrap rs-blur-in" style={{ ["--d" as string]: "220ms" }}>
        <div role="tablist" aria-label="Blog categories" className="rs-seg-tabs">
          {categories.map((cat) => {
            const cnt = cat === "All" ? posts.length : posts.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCat === cat}
                className="rs-seg-tab"
                onClick={() => setActiveCat(cat)}
              >
                <span>{cat === "All" ? "All posts" : cat}</span>
                <span className="rs-seg-count">{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rs-blog-list">
        {visible.map((post, idx) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="rs-blog-row rs-blur-in"
            style={{ ["--d" as string]: `${270 + idx * 55}ms` }}
          >
            <div className="rs-blog-meta">
              <span className="rs-blog-avatar" aria-hidden="true">
                {post.authorInitials}
              </span>
              <span style={{ color: "var(--rs-ink-85)", fontWeight: 500 }}>{post.author}</span>
              <time>{post.date}</time>
              <span>/{post.category}</span>
            </div>
            <h2 className="rs-blog-title">{post.title}</h2>
            <p className="rs-blog-excerpt">{post.excerpt}</p>
          </Link>
        ))}
      </div>

      <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "480ms" }}>
        Looking for release notes? See <Link href="/changelogs">Updates</Link>, or browse our{" "}
        <Link href="/guides">how-to guides</Link>.
      </p>
    </>
  );
}
