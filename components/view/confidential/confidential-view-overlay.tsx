"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Rotation } from "@/lib/hooks/use-fullscreen";
import { useDisablePullToRefresh } from "@/lib/hooks/use-disable-pull-to-refresh";
import { cn } from "@/lib/utils";

import { EyeOffIcon } from "lucide-react";

/**
 * Confidential view overlay (JANAVY).
 *
 * Honest working subset of the future Protected Viewer: page content is
 * obscured with a frosted layer until the recipient's pointer is over the
 * document ("blur until hover"), which deters casual viewing / shoulder
 * surfing. It is NOT copy protection and must never be described as such.
 *
 * - Pointer (hover-capable) devices: the blur fades while the pointer is
 *   inside the viewer area and returns as soon as it leaves.
 * - Touch devices: tap the overlay to reveal; it re-blurs automatically
 *   after a few seconds without interaction.
 *
 * Rendered as a sibling inside the viewer's relative content container
 * (same mount pattern as `ScreenProtector`). Takes no per-viewer data.
 */
export function ConfidentialViewOverlay({
  navbarAbove = false,
  rotation = 0,
}: {
  /**
   * True when the fixed viewer navbar overlays the top of the viewport
   * (not pseudo-fullscreen, not rotated): the frosted pane then starts
   * below the 64px navbar instead of covering it.
   */
  navbarAbove?: boolean;
  /** Quarter-turn rotation of the presentation; the badge rotates with it. */
  rotation?: Rotation;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reblurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isTouch, setIsTouch] = useState<boolean>(false);
  const [revealed, setRevealed] = useState<boolean>(false);

  // Touch devices have no hover to track; they use tap-to-reveal instead.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  // Share the reference-counted body scroll lock with the host viewer so
  // iOS pull-to-refresh cannot interfere with tap-to-reveal.
  useDisablePullToRefresh(isTouch);

  const scheduleReblur = useCallback(() => {
    if (reblurTimeoutRef.current) clearTimeout(reblurTimeoutRef.current);
    reblurTimeoutRef.current = setTimeout(() => setRevealed(false), 3000);
  }, []);

  useEffect(
    () => () => {
      if (reblurTimeoutRef.current) clearTimeout(reblurTimeoutRef.current);
    },
    [],
  );

  // Desktop: track the pointer at the document level so the overlay itself
  // can stay `pointer-events-none` while revealed (clicks pass through to
  // links/page controls) and still re-blur when the pointer leaves.
  useEffect(() => {
    if (isTouch || typeof window === "undefined") return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      setRevealed(inside);
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () =>
      window.removeEventListener("pointermove", handlePointerMove);
  }, [isTouch]);

  // Touch: any interaction with the page refreshes the reveal window; taps
  // outside the document (e.g. on the navbar) re-blur immediately.
  useEffect(() => {
    if (!isTouch || typeof window === "undefined") return;

    const handlePointerDown = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        scheduleReblur();
      } else {
        setRevealed(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown);
  }, [isTouch, scheduleReblur]);

  return (
    <div
      ref={containerRef}
      aria-label="Confidential content"
      className={cn(
        "absolute inset-x-0 bottom-0 z-40 select-none transition-opacity duration-200",
        navbarAbove ? "top-16" : "top-0",
      )}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* Frosted pane: blurs the page beneath until revealed. Always
          pointer-events-none so page interactions keep working; reveal state
          is driven by the document-level pointer tracking above. On touch it
          must catch taps while blurred, hence the conditional. */}
      <div
        className={cn(
          "absolute inset-0 bg-background/40 backdrop-blur-md transition-opacity duration-300",
          revealed ? "pointer-events-none opacity-0" : "opacity-100",
          isTouch && "pointer-events-auto",
        )}
        onClick={
          isTouch
            ? () => {
                setRevealed(true);
                scheduleReblur();
              }
            : undefined
        }
      />
      {/* Small badge explaining why content is obscured. Fades out with the
          pane so it never sits on top of readable content. */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gray-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-md transition-opacity duration-300 dark:bg-gray-100/90 dark:text-gray-900",
          revealed && "opacity-0",
        )}
      >
        <EyeOffIcon className="h-3.5 w-3.5" />
        <span>
          {isTouch
            ? "Confidential — tap to view"
            : "Confidential — move your cursor over the document to view"}
        </span>
      </div>
    </div>
  );
}
