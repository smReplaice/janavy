/**
 * JANAVI plan semantics (self-hosted, single tier, everything enabled).
 *
 * This module replaces the commercial plan catalogue (`ee/stripe/constants`)
 * with an import-compatible surface so AGPL call sites keep compiling.
 * JANAVI has no subscriptions and no paid tiers: every plan check resolves
 * to full access. The only exported names kept are the ones AGPL code
 * imports for typing (`PlanEnum`, `PLAN_NAME_MAP`, ...); their JANAVI
 * semantics collapse to a single all-inclusive tier.
 */

export enum PlanEnum {
  Pro = "Pro",
  Business = "Business",
  DataRooms = "Data Rooms",
  DataRoomsPlus = "Data Rooms Plus",
  DataRoomsPremium = "Data Rooms Premium",
  DataRoomsUnlimited = "Data Rooms Unlimited",
}

/**
 * Display name for every historical plan slug. JANAVI shows a single tier
 * name regardless of what plan string a team row carries.
 */
export const PLAN_NAME_MAP: Record<string, string> = {
  free: "JANAVI",
  starter: "JANAVI",
  pro: "JANAVI",
  business: "JANAVI",
  datarooms: "JANAVI",
  "datarooms-plus": "JANAVI",
  "datarooms-premium": "JANAVI",
  "datarooms-unlimited": "JANAVI",
};

/**
 * Plan string JANAVI writes on newly created teams. JANAVI has a single
 * all-inclusive tier; this slug is chosen so the server-side plan-string
 * checks in AGPL code (`team.plan.includes("free")`, `=== "datarooms"`, ...)
 * all resolve to the most permissive branch without editing call sites.
 */
export const JANAVI_PLAN = "datarooms-unlimited";

export type PeriodType = "monthly" | "yearly";

export interface Feature {
  id: string;
  text: string;
  highlight?: boolean;
  tooltip?: string;
  isCustomDomain?: boolean;
  isUsers?: boolean;
  usersIncluded?: number;
  isHighlighted?: boolean;
  isNotIncluded?: boolean;
}

export interface PlanFeatures {
  featureIntro: string;
  features: Feature[];
}

/** Compat only: JANAVI has no per-seat pricing. */
export const PLAN_PRICING = {
  Pro: {
    extraUserPrice: { monthly: "", yearly: "" },
  },
  Business: {
    extraUserPrice: { monthly: "", yearly: "" },
  },
  "Data Rooms": {
    extraUserPrice: { monthly: "", yearly: "" },
  },
  "Data Rooms Plus": {
    extraUserPrice: { monthly: "", yearly: "" },
  },
  "Data Rooms Premium": {
    extraUserPrice: { monthly: "", yearly: "" },
  },
  "Data Rooms Unlimited": {
    extraUserPrice: { monthly: "", yearly: "" },
  },
} as const;

const JANAVI_ALL_FEATURES: Feature[] = [
  { id: "users", text: "Unlimited team members", isUsers: true },
  { id: "links", text: "Unlimited links" },
  { id: "documents", text: "Unlimited documents" },
  { id: "datarooms", text: "Unlimited data rooms" },
  { id: "folder-levels", text: "Unlimited folder levels" },
  { id: "folder-sharing", text: "Folder sharing" },
  { id: "uploads", text: "Large file uploads" },
  { id: "video", text: "Video sharing and analytics" },
  { id: "visitors", text: "Visitors analytics" },
  { id: "branding", text: "Custom branding" },
  { id: "dataroom-branding", text: "Data room branding" },
  { id: "custom-domain", text: "Custom domains", isCustomDomain: true },
  { id: "custom-social-cards", text: "Custom social media cards" },
  { id: "screenshot", text: "Screenshot protection" },
  { id: "email-verify", text: "Require email verification" },
  { id: "allow-block", text: "Allow/Block list" },
  { id: "nda", text: "NDA agreements" },
  { id: "watermark", text: "Dynamic watermark" },
  { id: "permissions", text: "Granular file level permissions" },
  { id: "groups", text: "Data room groups" },
  { id: "analytics", text: "Data room analytics" },
  { id: "webhooks", text: "Webhooks" },
  { id: "api", text: "Full API access" },
];

const JANAVI_PLAN_FEATURES: PlanFeatures = {
  featureIntro: "Everything included:",
  features: JANAVI_ALL_FEATURES,
};

export const BASE_FEATURES: Record<PlanEnum, PlanFeatures> = {
  [PlanEnum.Pro]: JANAVI_PLAN_FEATURES,
  [PlanEnum.Business]: JANAVI_PLAN_FEATURES,
  [PlanEnum.DataRooms]: JANAVI_PLAN_FEATURES,
  [PlanEnum.DataRoomsPlus]: JANAVI_PLAN_FEATURES,
  [PlanEnum.DataRoomsPremium]: JANAVI_PLAN_FEATURES,
  [PlanEnum.DataRoomsUnlimited]: JANAVI_PLAN_FEATURES,
};

interface FeatureOptions {
  period?: PeriodType;
  showHighlighted?: boolean;
  maxFeatures?: number;
  excludeFeatures?: string[];
  includeFeatures?: string[];
  highlightFeatures?: string[];
  showDataRoomsPlus?: boolean;
}

/**
 * JANAVI: every plan resolves to the same all-inclusive feature list; the
 * filtering options are honoured so marketing surfaces keep working if they
 * are ever reused.
 */
export function getPlanFeatures(
  _plan: PlanEnum,
  options: FeatureOptions = {},
): PlanFeatures {
  const {
    maxFeatures,
    excludeFeatures = [],
    includeFeatures = [],
    highlightFeatures = [],
  } = options;

  let features = [...JANAVI_ALL_FEATURES];

  if (includeFeatures.length > 0) {
    features = features.filter((feature) =>
      includeFeatures.includes(feature.id),
    );
  }

  if (excludeFeatures.length > 0) {
    features = features.filter(
      (feature) => !excludeFeatures.includes(feature.id),
    );
  }

  if (highlightFeatures.length > 0) {
    features = features.map((feature) =>
      highlightFeatures.includes(feature.id)
        ? { ...feature, isHighlighted: true }
        : feature,
    );
  }

  if (maxFeatures) {
    features = features.slice(0, maxFeatures);
  }

  return {
    featureIntro: JANAVI_PLAN_FEATURES.featureIntro,
    features,
  };
}
