/**
 * Delete a team brand and clean up everything that referenced it.
 *
 * Referential cleanup:
 *  - `Link.brandId` and `Dataroom.brandId` are set to NULL by the database
 *    (onDelete: SetNull), so those rows fall back to the team default brand.
 *  - When the deleted brand was the team default, the oldest remaining brand
 *    is promoted so links keep resolving without a migration step. Deleting
 *    the last brand leaves `defaultBrandId` null (the "no branding yet"
 *    state the settings page handles).
 *  - Uploaded blob assets (logo, banner, link-preview image/favicon) are
 *    deleted from storage unless another brand still references them.
 *  - The Redis logo cache is refreshed/cleared when the default changed.
 */

import { Brand } from "@prisma/client";
import { del } from "@vercel/blob";

import prisma from "@/lib/prisma";
import {
  clearCachedBrandLogo,
  writeCachedBrandLogo,
} from "@/lib/redis/brand-logo-cache";

import type { BrandLogoFields } from "@/lib/branding/brand-logo";

export type DeleteTeamBrandResult = {
  deletedBrandId: string;
  /** Brand promoted to team default, or null when none remain. */
  nextDefaultBrandId: string | null;
};

/** Vercel Blob `del` only accepts URLs we uploaded there; skip the rest. */
function deletableAssetUrls(urls: Array<string | null | undefined>): string[] {
  return urls.filter((url): url is string => {
    if (!url || url === "no-banner") return false;
    if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) {
      return false;
    }
    return true;
  });
}

export async function deleteTeamBrand({
  teamId,
  brand,
}: {
  teamId: string;
  brand: Brand;
}): Promise<DeleteTeamBrandResult> {
  if (brand.teamId !== teamId) {
    throw new Error("Brand does not belong to this team");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { defaultBrandId: true },
  });
  const isDefault = team?.defaultBrandId === brand.id;

  const remaining = await prisma.brand.findMany({
    where: { teamId, id: { not: brand.id } },
    orderBy: { createdAt: "asc" },
    select: { id: true, logo: true, hideLogo: true },
    take: 1,
  });
  const nextDefault = isDefault ? (remaining[0] ?? null) : null;

  await prisma.$transaction(async (tx) => {
    if (isDefault && nextDefault) {
      await tx.team.update({
        where: { id: teamId },
        data: { defaultBrandId: nextDefault.id },
      });
    }
    // Link.brandId / Dataroom.brandId clear themselves via onDelete: SetNull.
    await tx.brand.delete({ where: { id: brand.id } });
  });

  // Best-effort storage cleanup: only delete assets no other brand (team or
  // dataroom override) still references.
  try {
    const assetUrls = deletableAssetUrls([
      brand.logo,
      brand.banner,
      brand.linkPreviewImage,
      brand.linkPreviewFavicon,
    ]);

    if (assetUrls.length > 0) {
      const [otherBrandRefs, dataroomBrandRefs] = await Promise.all([
        prisma.brand.count({
          where: {
            OR: [
              { logo: { in: assetUrls } },
              { banner: { in: assetUrls } },
              { linkPreviewImage: { in: assetUrls } },
              { linkPreviewFavicon: { in: assetUrls } },
            ],
          },
        }),
        prisma.dataroomBrand.count({
          where: {
            OR: [
              { logo: { in: assetUrls } },
              { banner: { in: assetUrls } },
              { linkPreviewImage: { in: assetUrls } },
              { linkPreviewFavicon: { in: assetUrls } },
            ],
          },
        }),
      ]);

      if (otherBrandRefs === 0 && dataroomBrandRefs === 0) {
        await del(assetUrls).catch(() => {});
      }
    }
  } catch {
    // Storage cleanup is opportunistic — never fail the delete over it.
  }

  // Keep the OTP logo cache in sync with the new default.
  if (isDefault) {
    try {
      if (nextDefault) {
        await writeCachedBrandLogo(teamId, nextDefault as BrandLogoFields);
      } else {
        await clearCachedBrandLogo(teamId);
      }
    } catch {
      // Cache misses are self-healing (readers fall back to Postgres).
    }
  }

  return {
    deletedBrandId: brand.id,
    nextDefaultBrandId: nextDefault?.id ?? null,
  };
}
