"use client";

/**
 * Janavy auth carousel — right column of login/register/verification pages.
 *
 * Five capability slides, auto-transitioning every 5 s with a subtle
 * cross-fade + slide. Autoplay pauses on hover/focus and is disabled
 * entirely when the user prefers reduced motion. Compact by design so the
 * auth pages fit the desktop viewport without vertical scrolling.
 *
 * Palette: official janavy.com (#0A1234 navy, #123DFF brand blue, #FFD236
 * highlight, #EFF4FF tint). All copy is product capability messaging — no
 * customer testimonials, no third-party logos, no unverified claims.
 */
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FileLock,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

const SLIDES = [
  {
    icon: Share2,
    title: "Secure Document Sharing",
    text: "Share sensitive documents through protected links — never as loose attachments.",
  },
  {
    icon: LockKeyhole,
    title: "Prevent Data Leaks",
    text: "Restrict downloads, copying and printing to keep confidential information protected.",
  },
  {
    icon: Activity,
    title: "Track Every View",
    text: "Know who accessed your documents, when they opened them and how they engaged.",
  },
  {
    icon: ShieldCheck,
    title: "Control Access & Revoke Anytime",
    text: "Revoke access anytime — even after sharing.",
  },
  {
    icon: FileLock,
    title: "AI Data Protection",
    text: "Dynamic watermarking, granular permissions and AI usage protection policies.",
  },
] as const;

const AUTOPLAY_MS = 5000;

export function AuthCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    reducedMotion.current = mq.matches;
    return () => mq.removeEventListener("change", update);
  }, []);

  const next = useCallback(
    () => setActive((i) => (i + 1) % SLIDES.length),
    [],
  );
  const prev = useCallback(
    () => setActive((i) => (i - 1 + SLIDES.length) % SLIDES.length),
    [],
  );

  useEffect(() => {
    if (paused || prefersReduced) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, prefersReduced, next]);

  return (
    <div
      className="relative hidden w-full justify-center overflow-hidden md:flex md:w-[45%] lg:w-[45%]"
      style={{ backgroundColor: "#050A22" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Janavy product capabilities"
    >
      {/* brand-blue radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 70% 15%, rgba(18,61,255,0.32) 0%, rgba(18,61,255,0) 60%), radial-gradient(60% 50% at 20% 90%, rgba(18,61,255,0.16) 0%, rgba(18,61,255,0) 65%)",
        }}
      />

      <div className="relative flex h-full w-full max-w-md flex-col justify-center px-10 py-10 lg:px-12">
        {/* Wordmark anchor */}
        <img
          src="/images/branding/janavy-wordmark-transparent.png"
          alt="Janavy"
          className="mb-8 h-6 w-auto self-start brightness-0 invert"
        />

        {/* Slides */}
        <div className="relative min-h-[260px]">
          {SLIDES.map(({ icon: Icon, title, text }, i) => {
            const isActive = i === active;
            return (
              <div
                key={title}
                className="absolute inset-0 flex flex-col justify-center gap-5 transition-all duration-700 ease-in-out"
                style={{
                  opacity: isActive ? 1 : 0,
                  transform: isActive
                    ? "translateX(0)"
                    : `translateX(${prefersReduced ? 0 : i > active ? 24 : -24}px)`,
                  pointerEvents: isActive ? "auto" : "none",
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}`}
                aria-hidden={!isActive}
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "rgba(18,61,255,0.18)" }}
                >
                  <Icon className="h-7 w-7 text-[#6C8DFF]" />
                </div>
                <h2 className="text-2xl font-semibold leading-snug tracking-tight text-white lg:text-[1.7rem]">
                  {title}
                </h2>
                <p className="text-sm leading-relaxed text-[#8FA3D8]">{text}</p>
              </div>
            );
          })}
        </div>

        {/* Controls: dots + arrows */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-2" role="tablist">
            {SLIDES.map(({ title }, i) => (
              <button
                key={title}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Go to slide ${i + 1}: ${title}`}
                onClick={() => setActive(i)}
                className="h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C8DFF]"
                style={{
                  width: i === active ? 24 : 8,
                  backgroundColor: i === active ? "#123DFF" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous slide"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-[#8FA3D8] transition-colors hover:border-[#3866FF] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C8DFF]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next slide"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-[#8FA3D8] transition-colors hover:border-[#3866FF] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C8DFF]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tagline footer */}
        <div className="mt-8 flex items-center gap-2 border-t border-white/10 pt-5">
          <Sparkles className="h-3.5 w-3.5 text-[#FFD236]" />
          <p className="text-xs tracking-wide text-[#5B6C99]">
            Share with Confidence. Stay in Control.
          </p>
        </div>
      </div>
    </div>
  );
}
