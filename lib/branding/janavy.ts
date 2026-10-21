/**
 * Janavy brand constants.
 *
 * Single source of truth for the product name, tagline, palette and legal
 * URLs. Branding modules use these values for every fallback (default OG
 * preview, default logo wordmark target URL, …) so the rebrand only has to
 * touch this file.
 *
 * Naming note: this module's path/symbol names (janavi, JANAVI_BRAND) are
 * internal identifiers kept for backward compatibility; only the VALUES are
 * the public brand.
 *
 * Brand reference (2026-10-19): https://janavy.com/ — "The Secure Agreement
 * Cloud". Palette extracted from the official site stylesheet.
 */

export const JANAVI_BRAND = {
  /** Wordmark rendering (all-caps per official brand). Prose form: "Janavy". */
  name: "JANAVY",
  tagline: "Share with Confidence. Stay in Control.",
  positioning: "The Secure Agreement Cloud",
  description: "Protect, share and sign your most important documents.",
  colors: {
    // Official janavy.com palette
    primary: "#0A1234", // deep navy — headings, dark surfaces
    secondary: "#123DFF", // brand blue — CTAs, links, accents
    secondaryHover: "#3866FF",
    secondaryLight: "#6C8DFF",
    accent: "#FFD236", // highlight yellow — used sparingly
    background: "#F8FAFC",
    tint: "#EFF4FF", // light blue tint for chips/cards
  },
  /** Official website / marketing origin. */
  website: "https://janavy.com",
  legal: {
    terms: "https://janavy.com/terms",
    privacy: "https://janavy.com/privacy",
  },
  /** Absolute app URL used for link previews and fallback asset URLs. */
  defaultAppUrl: (
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, ""),
} as const;

export type JanaviBrandColors = typeof JANAVI_BRAND.colors;
