/**
 * Logo-slot resolution shared by the viewer nav, the access form, the OTP
 * verification email and the branding preview iframes.
 *
 * The decision is intentionally tiny: a custom logo wins, an explicit hide
 * suppresses the slot entirely, and everything else falls back to the product
 * wordmark (rendered by the callers).
 */

/** The brand fields that participate in the logo decision. */
export type BrandLogoFields = {
  logo?: string | null;
  hideLogo?: boolean | null;
};

/**
 * Discriminated union consumed with an exhaustive switch:
 *  - `custom`   → render `src` (an uploaded logo URL)
 *  - `papermark`→ render the product wordmark (JANAVI)
 *  - `none`     → render nothing and collapse the slot
 */
export type ResolvedBrandLogo =
  | { kind: "custom"; src: string }
  | { kind: "papermark" }
  | { kind: "none" };

export function resolveBrandLogo(
  brand: BrandLogoFields | null | undefined,
): ResolvedBrandLogo {
  if (!brand) {
    return { kind: "papermark" };
  }

  if (brand.hideLogo === true) {
    return { kind: "none" };
  }

  const logo = typeof brand.logo === "string" ? brand.logo.trim() : "";

  if (logo) {
    return { kind: "custom", src: logo };
  }

  return { kind: "papermark" };
}
