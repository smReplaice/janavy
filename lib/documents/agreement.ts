/**
 * JANAVY "Agreement" document categorization.
 *
 * An Agreement is an ordinary Document (same upload/link/view/analytics
 * architecture) that has been categorized with agreement metadata. The
 * `agreementStatus` field tracks *sharing* lifecycle only — it is NOT a
 * signature/contract-execution status (no e-signature features).
 */
import z from "zod";

/** Categorization values stored in `Document.agreementType`. */
export const AGREEMENT_TYPES = [
  "NDA",
  "MSA",
  "SOW",
  "SLA",
  "PARTNERSHIP",
  "VENDOR",
  "EMPLOYMENT",
  "OTHER",
] as const;

export type AgreementType = (typeof AGREEMENT_TYPES)[number];

/** Sharing-status values stored in `Document.agreementStatus`. */
export const AGREEMENT_STATUSES = [
  "DRAFT",
  "SHARED",
  "VIEWED",
  "EXPIRED",
  "REVOKED",
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Zod validators shared by the document + link APIs. */
export const agreementTypeSchema = z.enum(AGREEMENT_TYPES);
export const agreementStatusSchema = z.enum(AGREEMENT_STATUSES);
export const agreementMetaSchema = z.object({}).passthrough();

/** Onboarding / filter labels for each agreement type. */
export const AGREEMENT_TYPE_OPTIONS: {
  value: AgreementType;
  label: string;
}[] = [
  { value: "NDA", label: "Non-Disclosure Agreement (NDA)" },
  { value: "MSA", label: "Master Services Agreement (MSA)" },
  { value: "SOW", label: "Statement of Work (SOW)" },
  { value: "SLA", label: "Service Level Agreement (SLA)" },
  { value: "PARTNERSHIP", label: "Partnership Agreement" },
  { value: "VENDOR", label: "Vendor / Supplier Agreement" },
  { value: "EMPLOYMENT", label: "Employment Agreement" },
  { value: "OTHER", label: "Other Agreement" },
];

export function agreementTypeLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return (
    AGREEMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

/**
 * Confidential link defaults applied when a link is created for a document
 * categorized as an agreement and the request did not explicitly provide the
 * security toggles. Explicit request values always win (layered in
 * pages/api/links/index.ts before link creation).
 */
export const AGREEMENT_LINK_DEFAULTS = {
  emailProtected: true,
  emailAuthenticated: true,
  allowDownload: false,
  enableWatermark: true,
  watermarkConfig: {
    text: "{{email}} · {{date}} · CONFIDENTIAL",
    isTiled: true,
    position: "middle-center",
    rotation: 45,
    color: "#808080",
    fontSize: 14,
    opacity: 0.15,
  },
} as const;
