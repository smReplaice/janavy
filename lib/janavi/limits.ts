/**
 * JANAVI limits (self-hosted).
 *
 * Replaces the commercial plan-limits engine (`ee/limits`). JANAVI has no
 * plan entitlements: users, links, documents, domains and datarooms are
 * unlimited. What remains are *technical* operational caps (file sizes,
 * multi-file counts, page counts) read from the environment with sane
 * defaults — kept as operational controls, not entitlements.
 *
 * Env overrides (all optional, numeric):
 *   JANAVI_MAX_FILE_VIDEO_MB     default 500
 *   JANAVI_MAX_FILE_DOCUMENT_MB  default 350
 *   JANAVI_MAX_FILE_IMAGE_MB     default 100
 *   JANAVI_MAX_FILE_EXCEL_MB     default 40
 *   JANAVI_MAX_FILES             default 150
 *   JANAVI_MAX_PAGES             default 500
 */

import prisma from "@/lib/prisma";

// INFO: for numeric values, `null` means unlimited

export type TFileSizeLimits = {
  video?: number | null;
  document?: number | null;
  image?: number | null;
  excel?: number | null;
  maxFiles?: number | null;
  maxPages?: number | null;
};

export type TPlanLimits = {
  users: number | null;
  links: number | null;
  documents: number | null;
  domains: number | null;
  datarooms: number | null;
  customDomainOnPro: boolean;
  customDomainInDataroom: boolean;
  advancedLinkControlsOnPro: boolean | null;
  watermarkOnBusiness?: boolean | null;
  agreementOnBusiness?: boolean | null;
  linkCustomFields?: number | null;
  conversationsInDataroom?: boolean;
  fileSizeLimits?: TFileSizeLimits;
};

/** JANAVI: single all-inclusive limits profile. */
export const JANAVI_LIMITS: TPlanLimits = {
  users: null,
  links: null,
  documents: null,
  domains: null,
  datarooms: null,
  customDomainOnPro: true,
  customDomainInDataroom: true,
  advancedLinkControlsOnPro: true,
  watermarkOnBusiness: true,
  agreementOnBusiness: true,
  linkCustomFields: 5,
  conversationsInDataroom: true,
  fileSizeLimits: {
    video: 500,
    document: 350,
    image: 100,
    excel: 40,
    maxFiles: 150,
    maxPages: 500,
  },
};

const numericEnv = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Technical file-size/throughput caps from env with self-hosted defaults. */
export function getJanaviFileSizeLimits(): Required<
  Pick<TFileSizeLimits, "video" | "document" | "image" | "excel" | "maxFiles" | "maxPages">
> {
  const defaults = JANAVI_LIMITS.fileSizeLimits!;
  return {
    video: numericEnv("JANAVI_MAX_FILE_VIDEO_MB") ?? defaults.video!,
    document: numericEnv("JANAVI_MAX_FILE_DOCUMENT_MB") ?? defaults.document!,
    image: numericEnv("JANAVI_MAX_FILE_IMAGE_MB") ?? defaults.image!,
    excel: numericEnv("JANAVI_MAX_FILE_EXCEL_MB") ?? defaults.excel!,
    maxFiles: numericEnv("JANAVI_MAX_FILES") ?? defaults.maxFiles!,
    maxPages: numericEnv("JANAVI_MAX_PAGES") ?? defaults.maxPages!,
  };
}

/**
 * JANAVI replacement for the commercial `getLimits`. Same call signature and
 * return shape the AGPL consumers expect (including current `usage` counts),
 * but every entitlement is unlimited and only technical caps apply.
 */
export async function getLimits({
  teamId,
  userId,
}: {
  teamId: string;
  userId: string;
}): Promise<
  TPlanLimits & {
    usage: { documents: number; links: number; users: number };
  }
> {
  const team = await prisma.team.findUnique({
    where: {
      id: teamId,
      users: {
        some: {
          userId: userId,
        },
      },
    },
    select: {
      _count: {
        select: {
          documents: true,
          links: true,
          users: true,
          invitations: true,
        },
      },
    },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  return {
    ...JANAVI_LIMITS,
    fileSizeLimits: getJanaviFileSizeLimits(),
    usage: {
      documents: team._count.documents,
      links: team._count.links,
      users: team._count.users + team._count.invitations,
    },
  };
}

/**
 * JANAVI: there is a single tier, so any signed-in user can always create
 * another team (kept as the import-compatible equivalents of the
 * commercial `canCreatePremiumTeam` / `canCreateUnlimitedTeam` helpers).
 */
export async function canCreatePremiumTeam(_userId: string): Promise<boolean> {
  return true;
}

export async function canCreateUnlimitedTeam(
  _userId: string,
): Promise<boolean> {
  return true;
}
