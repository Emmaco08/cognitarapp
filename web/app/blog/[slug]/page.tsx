import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { BLOG_POSTS } from "@/lib/site-content";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return { title: "Blog — CogniTara" };
  return {
    title: `${post.title} — CogniTara Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/blog" />

      <main id="main-content" className="rs-subpage rs-subpage--narrow">
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/blog"
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: "var(--rs-ink-60)",
              textDecoration: "none",
            }}
          >
            ← All posts
          </Link>
        </div>

        <header className="rs-page-hero" style={{ marginBottom: 36 }}>
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
          <h1 className="rs-page-title">{post.title}</h1>
          <p className="rs-page-lead">{post.excerpt}</p>
        </header>

        <article className="rs-story-prose">
          {post.sections.map((sec, idx) => (
            <section key={idx} style={{ display: "grid", gap: 16 }}>
              {sec.heading ? <h2>{sec.heading}</h2> : null}
              {sec.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
        </article>

        <div className="rs-subpage-note" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <span>Ready to run offline exams at your school?</span>
            <Link href="/download" className="rs-btn rs-btn--primary">
              Download for Windows
            </Link>
          </div>

          {others.length > 0 ? (
            <div style={{ paddingTop: 18, borderTop: "1px solid var(--rs-hairline)", display: "grid", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--rs-ink-50)" }}>More from the blog</span>
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={`/blog/${o.slug}`}
                  style={{ fontSize: 15, fontWeight: 500, color: "var(--rs-ink)", textDecoration: "none" }}
                >
                  {o.title} →
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
