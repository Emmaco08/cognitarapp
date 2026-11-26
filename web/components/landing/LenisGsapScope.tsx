"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export default function LenisGsapScope({ children }: { children: React.ReactNode }) {
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = scopeRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();
    let lenis: Lenis | null = null;
    let tickFn: ((time: number) => void) | null = null;

    mm.add(
      {
        motionOk: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { motionOk } = context.conditions || {};
        if (!motionOk) {
          gsap.set(root.querySelectorAll("[data-rs-reveal], [data-rs-stagger] > *"), {
            clearProps: "all",
            opacity: 1,
            y: 0,
            filter: "none",
          });
          return;
        }

        lenis = new Lenis({
          duration: 1.05,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: "vertical",
          smoothWheel: true,
          touchMultiplier: 1.4,
        });

        lenis.on("scroll", ScrollTrigger.update);
        tickFn = (time: number) => {
          lenis?.raf(time * 1000);
        };
        gsap.ticker.add(tickFn);
        gsap.ticker.lagSmoothing(0);

        // Smooth anchor navigation via Lenis
        const onAnchorClick = (e: MouseEvent) => {
          const a = (e.target as HTMLElement | null)?.closest('a[href^="#"]') as HTMLAnchorElement | null;
          if (!a) return;
          const id = a.getAttribute("href");
          if (!id || id === "#") return;
          const target = id === "#top" ? document.body : document.querySelector(id);
          if (!target || !lenis) return;
          e.preventDefault();
          lenis.scrollTo(target as HTMLElement, { offset: id === "#top" ? 0 : -72, duration: 1.0 });
        };
        root.addEventListener("click", onAnchorClick);

        // Subtle Resurf blur-fade-slide-in on scroll sections
        const reveals = gsap.utils.toArray<HTMLElement>("[data-rs-reveal]", root);
        reveals.forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 18 },
            {
              opacity: 1,
              y: 0,
              duration: 0.62,
              ease: "power3.out",
              clearProps: "transform",
              scrollTrigger: {
                trigger: el,
                start: "top 90%",
                once: true,
              },
            },
          );
        });

        // Subtle staggered card entrances inside Bento & Pricing grids
        const grids = gsap.utils.toArray<HTMLElement>("[data-rs-stagger]", root);
        grids.forEach((grid) => {
          const items = Array.from(grid.children) as HTMLElement[];
          if (!items.length) return;
          gsap.fromTo(
            items,
            { opacity: 0, y: 16 },
            {
              opacity: 1,
              y: 0,
              duration: 0.52,
              stagger: 0.045,
              ease: "power3.out",
              clearProps: "transform",
              scrollTrigger: {
                trigger: grid,
                start: "top 88%",
                once: true,
              },
            },
          );
        });

        ScrollTrigger.refresh();

        return () => {
          root.removeEventListener("click", onAnchorClick);
          if (tickFn) gsap.ticker.remove(tickFn);
          lenis?.destroy();
          lenis = null;
        };
      },
    );

    return () => {
      mm.revert();
    };
  }, []);

  return (
    <div ref={scopeRef} id="top" className="rs-root">
      {children}
    </div>
  );
}
