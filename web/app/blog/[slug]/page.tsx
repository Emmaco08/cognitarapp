import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { getPublishedBlogPostBySlug, getPublishedBlogPosts } from "@/lib/cms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) return { title: "Blog | CogniTara" };
  return {
    title: `${post.title} | CogniTara Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, allPosts] = await Promise.all([
    getPublishedBlogPostBySlug(slug),
    getPublishedBlogPosts(),
  ]);
  if (!post) notFound();

  const others = allPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/blog" />

      <main id="main-content" className="rs-subpage rs-subpage--narrow">
        <div className="rs-blur-in" style={{ ["--d" as string]: "0ms", marginBottom: 24, textAlign: "center" }}>
          <Link href="/blog" className="rs-back-btn" style={{ textDecoration: "none" }}>
            ← All posts
          </Link>
        </div>

        <header className="rs-sub-hero" style={{ marginBottom: 36 }}>
          <div className="rs-blog-meta rs-blur-in" style={{ ["--d" as string]: "60ms", justifyContent: "center" }}>
            <span className="rs-blog-avatar" aria-hidden="true">
              {post.authorInitials}
            </span>
            <span style={{ color: "var(--rs-ink-85)", fontWeight: 500 }}>{post.author}</span>
            <time>{post.date}</time>
            <span>/{post.category}</span>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "130ms" }}>
            {post.title}
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "200ms" }}>
            {post.excerpt}
          </p>
        </header>

        <article className="rs-story-prose">
          {post.sections.map((sec, idx) => (
            <section
              key={idx}
              className="rs-blur-in"
              style={{ ["--d" as string]: `${260 + idx * 80}ms`, display: "grid", gap: 16 }}
            >
              {sec.heading ? <h2>{sec.heading}</h2> : null}
              {sec.paragraphs.map((p, pi) => (
                <p key={pi}>{p}</p>
              ))}
            </section>
          ))}
        </article>

        <div className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "480ms", display: "grid", gap: 16, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <span>Ready to run calm offline exams at your school?</span>
            <Link href="/download" className="rs-btn rs-btn--primary" style={{ textDecoration: "none" }}>
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
                  style={{ fontSize: 14.5, fontWeight: 500, color: "var(--rs-ink)", textDecoration: "none" }}
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
