import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import BlogClient from "@/components/subpages/BlogClient";
import { getPublishedBlogPosts } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog | CogniTara",
  description:
    "Engineering notes, exam-hall reliability deep dives, migration guides, and release stories from CogniTara.",
};

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <LenisGsapScope>
      <LandingNav activePath="/blog" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M19.3669 2.81386C19.9317 3.41733 20.1808 4.30379 19.856 5.20547C19.242 6.91 18.0633 8.3033 17.0908 9.24445C16.8252 9.50148 16.5702 9.72939 16.339 9.92542C17.2326 10.6946 17.684 12.0253 16.9913 13.2263C15.7713 15.3417 12.687 18.9424 6.0627 18.9823C6.02049 19.6499 6 20.3237 6 21C6 21.5523 5.55228 22 5 22C4.44772 22 4 21.5523 4 21C4 16.6714 4.7935 12.2517 6.83137 8.74116C8.89392 5.18809 12.2173 2.6016 17.1192 2.01951C17.9856 1.91663 18.8169 2.22623 19.3669 2.81386Z"
              />
            </svg>
            <span>Blog</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            Notes from the build
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "150ms" }}>
            Building CogniTara, the reliability decisions behind it, and what we’re learning from real exam halls.
          </p>
        </header>

        <BlogClient posts={posts} />
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
