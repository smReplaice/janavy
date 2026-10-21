/**
 * Open Graph / social-card resolution for shared links.
 *
 * Precedence: per-link custom metatags → the dataroom's link-preview override
 * → the team brand's link-preview override → JANAVI defaults. Per-field,
 * empty values fall through to the next level ("empty fields fall back to
 * team branding when both are enabled").
 */

import { JANAVI_BRAND } from "@/lib/branding/janavy";

/** Meta fields stored directly on the Link record. */
export type PublicLinkMetaLinkSource = {
  enableCustomMetatag?: boolean | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaImage?: string | null;
  metaFavicon?: string | null;
};

/** Link-preview override fields shared by Brand and DataroomBrand. */
export type PublicLinkMetaBrandSource = {
  customLinkPreviewEnabled?: boolean | null;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
};

export type ResolvedPublicLinkMeta = {
  /** Whether pages should emit the custom metatags at all. */
  enableCustomMetatag: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImage: string | null;
  metaFavicon: string | null;
};

/** Favicon shipped with the app — always available. */
export const DEFAULT_LINK_FAVICON = "/favicon.ico";

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type ResolvePublicLinkMetaArgs = {
  link: PublicLinkMetaLinkSource | null | undefined;
  teamBrand?: PublicLinkMetaBrandSource | null;
  dataroomBrand?: PublicLinkMetaBrandSource | null;
  /** Fallback title computed from the link's document/dataroom name. */
  defaultTitle: string;
};

export function resolvePublicLinkMeta({
  link,
  teamBrand,
  dataroomBrand,
  defaultTitle,
}: ResolvePublicLinkMetaArgs): ResolvedPublicLinkMeta {
  const fallback = {
    title: clean(defaultTitle) ?? `${JANAVI_BRAND.name} — shared link`,
    description: JANAVI_BRAND.tagline,
    image: `${JANAVI_BRAND.defaultAppUrl}/_static/meta-image.png`,
    favicon: DEFAULT_LINK_FAVICON,
  };

  const fromBrand = (
    primary: PublicLinkMetaBrandSource | null | undefined,
    secondary: PublicLinkMetaBrandSource | null | undefined,
  ): ResolvedPublicLinkMeta => ({
    enableCustomMetatag: true,
    metaTitle:
      clean(primary?.linkPreviewTitle) ??
      (secondary?.customLinkPreviewEnabled
        ? clean(secondary.linkPreviewTitle)
        : null) ??
      fallback.title,
    metaDescription:
      clean(primary?.linkPreviewDescription) ??
      (secondary?.customLinkPreviewEnabled
        ? clean(secondary.linkPreviewDescription)
        : null) ??
      fallback.description,
    metaImage:
      clean(primary?.linkPreviewImage) ??
      (secondary?.customLinkPreviewEnabled
        ? clean(secondary.linkPreviewImage)
        : null) ??
      fallback.image,
    metaFavicon:
      clean(primary?.linkPreviewFavicon) ??
      (secondary?.customLinkPreviewEnabled
        ? clean(secondary.linkPreviewFavicon)
        : null) ??
      fallback.favicon,
  });

  // 1. Link-level custom metatags win outright.
  if (link?.enableCustomMetatag) {
    return {
      enableCustomMetatag: true,
      metaTitle: clean(link.metaTitle) ?? fallback.title,
      metaDescription: clean(link.metaDescription) ?? fallback.description,
      metaImage: clean(link.metaImage) ?? fallback.image,
      metaFavicon: clean(link.metaFavicon) ?? fallback.favicon,
    };
  }

  // 2. The dataroom's own override, falling back per-field to the team brand.
  if (dataroomBrand?.customLinkPreviewEnabled) {
    return fromBrand(dataroomBrand, teamBrand);
  }

  // 3. The team brand's override.
  if (teamBrand?.customLinkPreviewEnabled) {
    return fromBrand(teamBrand, null);
  }

  // 4. No overrides — pages render their own defaults.
  return {
    enableCustomMetatag: false,
    metaTitle: null,
    metaDescription: null,
    metaImage: null,
    metaFavicon: DEFAULT_LINK_FAVICON,
  };
}
