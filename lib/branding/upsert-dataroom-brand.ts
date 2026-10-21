/**
 * Upsert a dataroom's own brand (POST/PUT /api/teams/:teamId/datarooms/:id/branding).
 *
 * Besides writing the `DataroomBrand` row, this clears the dataroom's
 * inherited-from-team pointer (`Dataroom.brandId`) so the override actually
 * takes effect. On first create, layout/language fields the payload omits
 * are seeded from the team brand the dataroom was inheriting, so flipping a
 * dataroom to a custom brand doesn't silently reset its layout to column
 * defaults.
 */

import { DataroomBrand, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import {
  type DataroomCardLayout,
  type DataroomViewerHeaderStyle,
  type DataroomViewerLayoutPreset,
} from "@/lib/branding/dataroom-viewer-layout";
import { resolveBaseBrand } from "@/lib/branding/resolve-base-brand";

export type DataroomBrandWriteData = {
  logo?: string | null;
  /** null clears the override so the team setting applies. */
  hideLogo?: boolean | null;
  banner?: string | null;
  brandColor?: string | null;
  accentColor?: string | null;
  accentButtonColor?: string | null;
  applyAccentColorToDataroomView?: boolean;
  welcomeMessage?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  customLinkPreviewEnabled?: boolean;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
  cardLayout?: DataroomCardLayout;
  showFolderTree?: boolean;
  viewerLayoutPreset?: DataroomViewerLayoutPreset;
  viewerHeaderStyle?: DataroomViewerHeaderStyle;
  hideFolderIconsInMain?: boolean;
  defaultLanguage?: string;
};

/** Non-nullable DataroomBrand columns seeded from the inherited team brand. */
const brandSeedSelect = {
  cardLayout: true,
  showFolderTree: true,
  viewerLayoutPreset: true,
  viewerHeaderStyle: true,
  hideFolderIconsInMain: true,
  defaultLanguage: true,
} satisfies Prisma.BrandSelect;

async function clearInheritedTeamBrand(
  dataroomId: string,
  teamId: string,
): Promise<void> {
  // Only clear when the dataroom currently inherits a team brand; a null
  // brandId already means "custom brand".
  await prisma.dataroom.updateMany({
    where: { id: dataroomId, teamId, brandId: { not: null } },
    data: { brandId: null },
  });
}

export async function upsertDataroomBrandAndClearInherited({
  dataroomId,
  teamId,
  data,
}: {
  dataroomId: string;
  teamId: string;
  data: DataroomBrandWriteData;
}): Promise<DataroomBrand> {
  const existing = await prisma.dataroomBrand.findUnique({
    where: { dataroomId },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.dataroomBrand.update({
      where: { dataroomId },
      data: data as Prisma.DataroomBrandUpdateInput,
    });
    await clearInheritedTeamBrand(dataroomId, teamId);
    return updated;
  }

  // Seed omitted layout/language fields from the brand being inherited so
  // the fresh override row doesn't snap the layout back to column defaults.
  const dataroom = await prisma.dataroom.findUnique({
    where: { id: dataroomId },
    select: { brandId: true },
  });
  const inheritedBrand = await resolveBaseBrand({
    teamId,
    dataroomBrandId: dataroom?.brandId ?? null,
    select: brandSeedSelect,
  });

  const created = await prisma.dataroomBrand.create({
    data: {
      dataroomId,
      ...data,
      cardLayout: data.cardLayout ?? inheritedBrand?.cardLayout ?? undefined,
      showFolderTree:
        data.showFolderTree ?? inheritedBrand?.showFolderTree ?? undefined,
      viewerLayoutPreset:
        data.viewerLayoutPreset ??
        inheritedBrand?.viewerLayoutPreset ??
        undefined,
      viewerHeaderStyle:
        data.viewerHeaderStyle ??
        inheritedBrand?.viewerHeaderStyle ??
        undefined,
      hideFolderIconsInMain:
        data.hideFolderIconsInMain ??
        inheritedBrand?.hideFolderIconsInMain ??
        undefined,
      defaultLanguage:
        data.defaultLanguage ?? inheritedBrand?.defaultLanguage ?? undefined,
    } as Prisma.DataroomBrandUncheckedCreateInput,
  });

  await clearInheritedTeamBrand(dataroomId, teamId);
  return created;
}
