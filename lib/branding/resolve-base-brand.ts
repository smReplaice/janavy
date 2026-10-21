/**
 * Team base-brand resolution.
 *
 * A team owns one or more `Brand` rows and points at one of them via
 * `Team.defaultBrandId`. Links and datarooms may reference a specific team
 * brand (`Link.brandId` / `Dataroom.brandId`) and, when they don't, inherit
 * the team default. These helpers implement that resolution once so the link
 * data fetcher, OTP emails and API routes share one precedence order:
 *
 *   link brand override → dataroom brand override → team default brand
 *   → oldest brand (fallback) → lazily created "Default" brand
 */

import { Brand, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared selects
// ---------------------------------------------------------------------------

/** Fields the public viewer needs to render a branded link. */
export const teamBrandViewerSelect = {
  logo: true,
  hideLogo: true,
  banner: true,
  brandColor: true,
  accentColor: true,
  accentButtonColor: true,
  applyAccentColorToDataroomView: true,
  welcomeMessage: true,
  privacyPolicyUrl: true,
  cardLayout: true,
  showFolderTree: true,
  viewerLayoutPreset: true,
  viewerHeaderStyle: true,
  hideFolderIconsInMain: true,
  ctaLabel: true,
  ctaUrl: true,
  defaultLanguage: true,
} satisfies Prisma.BrandSelect;

/** Fields used to compute the Open Graph / social card of a shared link. */
export const teamBrandOgSelect = {
  customLinkPreviewEnabled: true,
  linkPreviewTitle: true,
  linkPreviewDescription: true,
  linkPreviewImage: true,
  linkPreviewFavicon: true,
} satisfies Prisma.BrandSelect;

/** Fields the workflow viewer surfaces (messaging look, no dataroom layout). */
export const teamBrandWorkflowSelect = {
  logo: true,
  hideLogo: true,
  brandColor: true,
  accentColor: true,
  accentButtonColor: true,
  welcomeMessage: true,
  ctaLabel: true,
  ctaUrl: true,
  privacyPolicyUrl: true,
} satisfies Prisma.BrandSelect;

// ---------------------------------------------------------------------------
// Default brand lookup / creation
// ---------------------------------------------------------------------------

/**
 * The team's default brand: `Team.defaultBrandId` when it points at a live
 * row, else the oldest brand, else null (team has never configured branding).
 */
export async function findDefaultBrand(teamId: string): Promise<Brand | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { defaultBrandId: true },
  });

  if (team?.defaultBrandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: team.defaultBrandId, teamId },
    });
    if (brand) return brand;
  }

  return prisma.brand.findFirst({
    where: { teamId },
    orderBy: { createdAt: "asc" },
  });
}

async function findDefaultBrandWithSelect(
  teamId: string,
  select: Prisma.BrandSelect | undefined,
): Promise<Partial<Brand> | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { defaultBrandId: true },
  });

  if (team?.defaultBrandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: team.defaultBrandId, teamId },
      select,
    });
    if (brand) return brand;
  }

  return prisma.brand.findFirst({
    where: { teamId },
    orderBy: { createdAt: "asc" },
    select,
  });
}

/**
 * The team's default brand id, creating a "Default" brand when the team has
 * none yet. Used wherever a Brand row must exist (new datarooms, webhooks…).
 */
export async function resolveDefaultBrandId(teamId: string): Promise<string> {
  const existing = await findDefaultBrand(teamId);
  if (existing) return existing.id;

  try {
    const created = await prisma.brand.create({
      data: {
        name: "Default",
        teamId,
      },
      select: { id: true },
    });
    await prisma.team.update({
      where: { id: teamId },
      data: { defaultBrandId: created.id },
    });
    return created.id;
  } catch (error) {
    // Concurrent request created the brand first — reuse it.
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await findDefaultBrand(teamId);
      if (raced) return raced.id;
    }
    throw error;
  }
}

/**
 * Validate a caller-supplied brand id against the team's brands. Returns the
 * id when the team owns it, else null (unknown brands never leak across
 * teams; null means "inherit the team default").
 */
export async function resolveOwnedBrandId(
  teamId: string,
  brandId: string | null | undefined,
): Promise<string | null> {
  if (!brandId) return null;

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, teamId },
    select: { id: true },
  });

  return brand?.id ?? null;
}

// ---------------------------------------------------------------------------
// Effective brand resolution
// ---------------------------------------------------------------------------

export type ResolveBaseBrandArgs = {
  teamId: string;
  /** Brand picked on the link itself (`Link.brandId`). */
  linkBrandId?: string | null;
  /** Brand the dataroom inherits (`Dataroom.brandId`). */
  dataroomBrandId?: string | null;
  /** Optional column subset; omit to fetch the full row. */
  select?: Prisma.BrandSelect;
};

/**
 * Resolve the effective team Brand record for a link/dataroom, honoring the
 * override precedence described at the top of the file. Returns null when the
 * team has no brands at all (viewers then fall back to product defaults).
 */
export async function resolveBaseBrand({
  teamId,
  linkBrandId,
  dataroomBrandId,
  select,
}: ResolveBaseBrandArgs): Promise<Partial<Brand> | null> {
  const overrideIds = [linkBrandId, dataroomBrandId].filter(
    (id): id is string => Boolean(id),
  );

  for (const overrideId of overrideIds) {
    const brand = await prisma.brand.findFirst({
      where: { id: overrideId, teamId },
      select,
    });
    if (brand) return brand;
  }

  return findDefaultBrandWithSelect(teamId, select);
}

// ---------------------------------------------------------------------------
// Default brand persistence (upsert for POST/PUT /api/teams/:teamId/branding)
// ---------------------------------------------------------------------------

export type PersistDefaultBrandArgs = {
  teamId: string;
  /** Create payload used when the team has no brand yet (includes teamId). */
  create: Prisma.BrandUncheckedCreateInput;
  /** Update payload applied to the existing default brand. */
  update: Prisma.BrandUpdateInput;
};

/**
 * Upsert the team's default brand: update it when one exists, create it (and
 * point `Team.defaultBrandId` at it) otherwise.
 */
export async function persistDefaultBrand({
  teamId,
  create,
  update,
}: PersistDefaultBrandArgs): Promise<Brand> {
  const existing = await findDefaultBrand(teamId);

  if (existing) {
    const updated = await prisma.brand.update({
      where: { id: existing.id },
      data: update,
    });
    // Repair a dangling pointer: findDefaultBrand may have fallen back to the
    // oldest brand while defaultBrandId referenced a deleted row.
    await prisma.team.update({
      where: { id: teamId },
      data: { defaultBrandId: updated.id },
    });
    return updated;
  }

  const created = await prisma.brand.create({ data: create });
  await prisma.team.update({
    where: { id: teamId },
    data: { defaultBrandId: created.id },
  });
  return created;
}
