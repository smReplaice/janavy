/**
 * Logo tone analysis for the Notion-style cover logo chip.
 *
 * Computes whether a logo image reads as "light" or "dark" by averaging its
 * pixel luminance on a small canvas, so the chip behind it can pick a
 * contrasting background (dark logo → white box, light logo → black box).
 *
 * CORS-restricted hosts and images that fail to decode fall back to "dark"
 * (the safe white chip), matching how most logos are designed.
 */

import {
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
} from "react";

export type LogoTone = "light" | "dark";

export type UseLogoToneResult = {
  /** "dark" until analysis completes or when pixels cannot be read. */
  tone: LogoTone;
  /** Spread onto the display <img> to reuse its decode for the analysis. */
  imgProps: {
    onLoad: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
    onError: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
  };
};

/** Average luminance (0–255) at or above which a logo counts as "light". */
const LIGHT_LUMINANCE_THRESHOLD = 170;

function analyzeImageTone(img: HTMLImageElement): LogoTone | null {
  try {
    const canvas = document.createElement("canvas");
    const width = 32;
    const height = 32;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(img, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    let luminanceSum = 0;
    let opaquePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Fully transparent pixels say nothing about the tone — skip them.
      if (data[i + 3] < 16) continue;
      luminanceSum +=
        0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      opaquePixels += 1;
    }

    if (opaquePixels === 0) return null;
    return luminanceSum / opaquePixels >= LIGHT_LUMINANCE_THRESHOLD
      ? "light"
      : "dark";
  } catch {
    // Tainted canvas (CORS) or undecodable image — caller falls back to dark.
    return null;
  }
}

export function useLogoTone(src: string | null | undefined): UseLogoToneResult {
  const [tone, setTone] = useState<LogoTone>("dark");

  useEffect(() => {
    if (!src) {
      setTone("dark");
      return;
    }

    let cancelled = false;
    // Reset while the new image loads so a stale tone never flashes through.
    setTone("dark");

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      if (cancelled) return;
      setTone(analyzeImageTone(image) ?? "dark");
    };
    image.onerror = () => {
      if (!cancelled) setTone("dark");
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  // When the caller spreads `imgProps` onto the display <img>, reuse that
  // element's decode instead of the extra Image() fetch above (the browser
  // cache usually makes the second fetch free, but this keeps it exact).
  const imgProps = {
    onLoad: useCallback(
      (event: SyntheticEvent<HTMLImageElement, Event>) => {
        const img = event.currentTarget;
        setTone(analyzeImageTone(img) ?? "dark");
      },
      [],
    ),
    onError: useCallback(() => setTone("dark"), []),
  };

  return { tone, imgProps };
}
