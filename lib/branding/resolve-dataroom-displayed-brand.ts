/**
 * Which brand does a dataroom viewer actually display?
 *
 * Three sources compete:
 *   1. a per-dataroom `DataroomBrand` override row (nullable fields inherit
 *      the team brand — see the schema comments),
 *   2. a team Brand the dataroom/link explicitly points at
 *      (`Dataroom.brandId` / `Link.brandId`),
 *   3. the team's default brand.
 *
 * `inheritsTeamBrand` decides between (1) and (2)/(3); when a team brand is
 * in effect the DataroomBrand row is ignored entirely. `CUSTOM_DATAROOM_BRAND`
 * is the sentinel the settings UI uses in selects for "this dataroom's own
 * brand" (Dataroom.brandId === null).
 */

import { Brand, DataroomBrand } from "@prisma/client";

/** Sentinel select value meaning "use the dataroom's own custom brand". */
export const CUSTOM_DATAROOM_BRAND = "__custom_dataroom_brand__";

/** Human label for the sentinel in selects. */
export const CUSTOM_DATAROOM_BRAND_LABEL = "Custom dataroom brand";

export type InheritsTeamBrandArgs = {
  /** Brand picked on the link itself (`Link.brandId`). */
  linkBrandId?: string | null;
  /** Team brand the dataroom inherits (`Dataroom.brandId`). */
  dataroomBrandId?: string | null;
  /** Whether a per-dataroom DataroomBrand override row exists. */
  hasDataroomBrand: boolean;
};

/**
 * True when the dataroom displays a team Brand (default or explicitly
 * referenced) rather than its own DataroomBrand override.
 */
export function inheritsTeamBrand({
  linkBrandId,
  dataroomBrandId,
  hasDataroomBrand,
}: InheritsTeamBrandArgs): boolean {
  // An explicit team brand reference on the link or dataroom wins over the
  // dataroom's own brand row.
  if (linkBrandId || dataroomBrandId) return true;

  // No override row → everything falls back to the team default brand.
  return !hasDataroomBrand;
}

export type ResolveDisplayedDataroomBrandArgs = {
  /** The dataroom's own override row, when present. */
  dataroomBrand: Partial<DataroomBrand> | null;
  /** The effective team brand (already resolved by `resolveBaseBrand`). */
  teamBrand: Partial<Brand> | null;
  /** Result of `inheritsTeamBrand` for the same link/dataroom. */
  inheritTeamBrand: boolean;
};

/**
 * Merge the dataroom brand over the team brand: every null/undefined
 * DataroomBrand field inherits the team brand's value (or a sensible
 * default), non-nullable fields are taken as stored.
 */
export function resolveDisplayedDataroomBrand({
  dataroomBrand,
  teamBrand,
  inheritTeamBrand,
}: ResolveDisplayedDataroomBrandArgs):
  | Partial<Brand>
  | Partial<DataroomBrand>
  | null {
  if (inheritTeamBrand || !dataroomBrand) {
    return teamBrand ?? null;
  }

  const nullable = (
    override: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null => (override != null && override !== "" ? override : (fallback ?? null));

  return {
    // Nullable DataroomBrand columns — null means "inherit the team brand".
    logo: nullable(dataroomBrand.logo, teamBrand?.logo),
    banner: nullable(dataroomBrand.banner, teamBrand?.banner),
    brandColor: nullable(dataroomBrand.brandColor, teamBrand?.brandColor),
    accentColor: nullable(dataroomBrand.accentColor, teamBrand?.accentColor),
    accentButtonColor: nullable(
      dataroomBrand.accentButtonColor,
      teamBrand?.accentButtonColor,
    ),
    welcomeMessage: nullable(
      dataroomBrand.welcomeMessage,
      teamBrand?.welcomeMessage,
    ),
    ctaLabel: nullable(dataroomBrand.ctaLabel, teamBrand?.ctaLabel),
    ctaUrl: nullable(dataroomBrand.ctaUrl, teamBrand?.ctaUrl),
    linkPreviewTitle: nullable(
      dataroomBrand.linkPreviewTitle,
      teamBrand?.linkPreviewTitle,
    ),
    linkPreviewDescription: nullable(
      dataroomBrand.linkPreviewDescription,
      teamBrand?.linkPreviewDescription,
    ),
    linkPreviewImage: nullable(
      dataroomBrand.linkPreviewImage,
      teamBrand?.linkPreviewImage,
    ),
    linkPreviewFavicon: nullable(
      dataroomBrand.linkPreviewFavicon,
      teamBrand?.linkPreviewFavicon,
    ),

    // hideLogo is Boolean? on DataroomBrand — null inherits the team value.
    hideLogo:
      dataroomBrand.hideLogo != null
        ? dataroomBrand.hideLogo
        : (teamBrand?.hideLogo ?? false),

    // Non-nullable columns are concrete on the override row.
    applyAccentColorToDataroomView:
      dataroomBrand.applyAccentColorToDataroomView === true,
    cardLayout: dataroomBrand.cardLayout ?? "LIST",
    showFolderTree: dataroomBrand.showFolderTree ?? true,
    viewerLayoutPreset: dataroomBrand.viewerLayoutPreset ?? "STANDARD",
    viewerHeaderStyle: dataroomBrand.viewerHeaderStyle ?? "DEFAULT",
    hideFolderIconsInMain: dataroomBrand.hideFolderIconsInMain === true,
    customLinkPreviewEnabled:
      dataroomBrand.customLinkPreviewEnabled === true,
    defaultLanguage: dataroomBrand.defaultLanguage ?? "en",

    // Not present on DataroomBrand — pass the team brand's value through.
    privacyPolicyUrl: teamBrand?.privacyPolicyUrl ?? null,
  };
}
