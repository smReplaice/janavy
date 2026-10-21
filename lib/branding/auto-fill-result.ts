/**
 * Result shape of POST /api/branding/auto-fill — the "Auto-fill from website"
 * lookup that scrapes a site for its logo, banner and brand colors.
 *
 * The scraper itself lives in the API route; this module only models the
 * result so the branding pages can consume it uniformly.
 */

export type BrandAutoFillResult = {
  /** The domain the assets were scraped from (fallback for the toast). */
  domain?: string | null;
  /** Human-friendly site name when it could be determined. */
  name?: string | null;
  logo?: string | null;
  banner?: string | null;
  brandColor?: string | null;
  accentColor?: string | null;
  accentButtonColor?: string | null;
};

export const AUTO_FILL_NOT_FOUND_MESSAGE =
  "No brand assets found for that website. Add your logo and colors manually.";

/**
 * Whether the lookup produced anything the branding form can apply. A banner
 * only counts on plans that can use it (data room banner support).
 */
export function autoFillHasBrandAssets(
  result: BrandAutoFillResult | null | undefined,
  options: { allowBanner: boolean },
): boolean {
  if (!result) return false;

  if (result.logo) return true;
  if (options.allowBanner && result.banner) return true;
  if (result.brandColor) return true;
  if (result.accentColor) return true;
  if (result.accentButtonColor) return true;

  return false;
}
