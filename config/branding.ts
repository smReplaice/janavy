/**
 * Centralized Janavy branding constants.
 *
 * Single source of truth for user-facing product naming, positioning copy
 * and legal URLs. Import from here instead of hardcoding the product name.
 * (Runtime values also live in lib/branding/janavy.ts → JANAVI_BRAND; this
 * file is the stable, client-safe alias with the copywriting constants.)
 */
export const BRANDING = {
  productName: "Janavy",
  /** Wordmark rendering (all-caps per official brand). */
  wordmark: "JANAVY",
  tagline: "Share with Confidence. Stay in Control.",
  website: "https://janavy.com",
  privacyUrl: "https://janavy.com/privacy",
  termsUrl: "https://janavy.com/terms",
  positioning: {
    welcome:
      "Share sensitive documents securely, control who can access them, and stay in control of your information — even after sharing.",
    dashboard: "Your documents, securely managed.",
    emptyDocuments:
      "Your secure workspace starts here. Upload a document to share it with confidence.",
    sharing: "Share securely. Stay in control.",
    datarooms: "One secure space for your most important documents.",
  },
} as const;

export type Branding = typeof BRANDING;
