/**
 * Normalize and validate an incoming team-brand payload before it reaches
 * Prisma (POST/PUT /api/teams/:teamId/brands).
 *
 * Responsibilities:
 *  - schema-validate every field (unknown layout values are rejected here),
 *  - enforce plan gating for messaging + layout fields,
 *  - run CTA URLs through the shared redirect validator (HTTPS, SSRF guard,
 *    Edge Config blocklist),
 *  - return a payload that is safe to spread into both `brand.create` and
 *    `brand.update` (undefined fields leave stored values untouched).
 */

import { z } from "zod";

import { validateRedirectUrl } from "@/lib/api/domains/validate-redirect-url";
import {
  teamPlanAllowsCustomWelcomeAndCta,
  teamPlanAllowsLayoutCustomization,
} from "@/lib/billing/team-plan-custom-messaging";
import {
  DataroomCardLayoutSchema,
  DataroomViewerHeaderStyleSchema,
  DataroomViewerLayoutPresetSchema,
} from "@/lib/branding/dataroom-viewer-layout";

const brandWriteSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  logo: z.string().nullable().optional(),
  hideLogo: z.boolean().optional(),
  banner: z.string().nullable().optional(),
  brandColor: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  accentButtonColor: z.string().nullable().optional(),
  applyAccentColorToDataroomView: z.boolean().optional(),
  welcomeMessage: z.string().nullable().optional(),
  customLinkPreviewEnabled: z.boolean().optional(),
  linkPreviewTitle: z.string().nullable().optional(),
  linkPreviewDescription: z.string().nullable().optional(),
  linkPreviewImage: z.string().nullable().optional(),
  linkPreviewFavicon: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
  privacyPolicyUrl: z.string().nullable().optional(),
  cardLayout: DataroomCardLayoutSchema.optional(),
  showFolderTree: z.boolean().optional(),
  viewerLayoutPreset: DataroomViewerLayoutPresetSchema.optional(),
  viewerHeaderStyle: DataroomViewerHeaderStyleSchema.optional(),
  hideFolderIconsInMain: z.boolean().optional(),
});

export type BrandWriteData = z.infer<typeof brandWriteSchema>;

export type PreparedBrandWrite =
  | { ok: true; data: BrandWriteData }
  | {
      ok: false;
      status: number;
      message: string;
      errors?: Record<string, string[] | undefined>;
    };

export type PrepareBrandWriteArgs = {
  body: unknown;
  teamId: string;
  plan: string;
  /** POST (create) requires a name; PUT (update) may leave it untouched. */
  nameRequired?: boolean;
};

export async function prepareBrandWrite({
  body,
  teamId,
  plan,
  nameRequired = false,
}: PrepareBrandWriteArgs): Promise<PreparedBrandWrite> {
  const parsed = brandWriteSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const messagingAllowed = teamPlanAllowsCustomWelcomeAndCta(plan);
  const layoutAllowed = teamPlanAllowsLayoutCustomization(plan);

  if (nameRequired && !data.name) {
    return {
      ok: false,
      status: 400,
      message: "Brand name is required",
    };
  }

  let ctaUrl = data.ctaUrl;
  if (messagingAllowed && typeof ctaUrl === "string") {
    const validation = await validateRedirectUrl(ctaUrl, teamId);
    if (!validation.valid) {
      return { ok: false, status: 400, message: validation.message };
    }
    ctaUrl = validation.url;
  }

  // Plans without messaging access cannot mutate any messaging fields — drop
  // them so stored values survive (Prisma skips undefined on update).
  const prepared: BrandWriteData = {
    ...data,
    ctaUrl: messagingAllowed ? ctaUrl : undefined,
    welcomeMessage: messagingAllowed ? data.welcomeMessage : undefined,
    ctaLabel: messagingAllowed ? data.ctaLabel : undefined,
    customLinkPreviewEnabled: messagingAllowed
      ? data.customLinkPreviewEnabled
      : undefined,
    linkPreviewTitle: messagingAllowed ? data.linkPreviewTitle : undefined,
    linkPreviewDescription: messagingAllowed
      ? data.linkPreviewDescription
      : undefined,
    linkPreviewImage: messagingAllowed ? data.linkPreviewImage : undefined,
    linkPreviewFavicon: messagingAllowed ? data.linkPreviewFavicon : undefined,
    // Layout fields are gated to the Data Rooms tier (and trials).
    cardLayout: layoutAllowed ? data.cardLayout : undefined,
    showFolderTree: layoutAllowed ? data.showFolderTree : undefined,
    viewerLayoutPreset: layoutAllowed ? data.viewerLayoutPreset : undefined,
    viewerHeaderStyle: layoutAllowed ? data.viewerHeaderStyle : undefined,
    hideFolderIconsInMain: layoutAllowed
      ? data.hideFolderIconsInMain
      : undefined,
  };

  return { ok: true, data: prepared };
}
