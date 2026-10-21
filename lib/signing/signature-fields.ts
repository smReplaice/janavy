/**
 * Native electronic signature — shared (client-safe) configuration types.
 *
 * Used by:
 *  - the link sheet (owner configures methods + places fields),
 *  - the public viewer (signer fills the fields),
 *  - the link create/update APIs and the signing pipeline (zod validation).
 *
 * Coordinate convention: every field stores its box in NORMALIZED units
 * (0–1 fractions of the page box as displayed in the page-image viewer),
 * with `x`/`y` measured from the TOP-LEFT of the displayed page and
 * `width`/`height` extending right/down. The server-side pipeline
 * (lib/signing/native.ts) converts these into PDF user-space coordinates
 * (bottom-left origin, honoring page rotation).
 */

import { z } from "zod";

export const SIGNATURE_FIELD_TYPES = [
  "SIGNATURE",
  "FULL_NAME",
  "DATE",
  "INITIALS",
  "COMPANY",
] as const;

export type SignatureFieldTypeValue = (typeof SIGNATURE_FIELD_TYPES)[number];

export const SIGNATURE_METHODS = ["DRAW", "TYPE", "UPLOAD"] as const;

export type SignatureMethodValue = (typeof SIGNATURE_METHODS)[number];

export const SIGNATURE_FIELD_LABELS: Record<SignatureFieldTypeValue, string> = {
  SIGNATURE: "Signature",
  FULL_NAME: "Full Name",
  DATE: "Date",
  INITIALS: "Initials",
  COMPANY: "Company Name",
};

/** Owner-facing labels for the signing-method checkboxes. */
export const SIGNATURE_METHOD_LABELS: Record<SignatureMethodValue, string> = {
  DRAW: "Draw signature",
  TYPE: "Type signature",
  UPLOAD: "Upload signature",
};

/** Image field types are captured as canvas/upload images (data URLs). */
export function isImageFieldType(
  type: SignatureFieldTypeValue,
): boolean {
  return type === "SIGNATURE" || type === "INITIALS";
}

const unit = z.number().min(0).max(1);

export const SignatureFieldSchema = z.object({
  fieldId: z.string().min(1).max(64),
  type: z.enum(SIGNATURE_FIELD_TYPES),
  pageNumber: z.number().int().min(1).max(10_000),
  /** 0–1 fraction from the left edge of the displayed page. */
  x: unit,
  /** 0–1 fraction from the TOP edge of the displayed page. */
  y: unit,
  /** 0–1 fraction of the page width. */
  width: unit,
  /** 0–1 fraction of the page height. */
  height: unit,
  required: z.boolean().default(true),
});

export type SignatureField = z.infer<typeof SignatureFieldSchema>;

export const SignatureFieldConfigurationSchema = z.object({
  methods: z.array(z.enum(SIGNATURE_METHODS)).min(1, "Select at least one signing method."),
  fields: z.array(SignatureFieldSchema).max(100),
});

export type SignatureFieldConfiguration = z.infer<
  typeof SignatureFieldConfigurationSchema
>;

export const DEFAULT_SIGNATURE_METHODS: SignatureMethodValue[] = [
  "DRAW",
  "TYPE",
  "UPLOAD",
];

export const DEFAULT_SIGNATURE_CONFIGURATION: SignatureFieldConfiguration = {
  methods: [...DEFAULT_SIGNATURE_METHODS],
  fields: [],
};

/** Exact consent copy shown to the signer (do not reword). */
export const SIGNATURE_CONSENT_COPY =
  "I agree to use an electronic signature and intend to sign this document electronically.";

/**
 * Safely parse a stored `signatureFieldConfiguration` JSON value. Returns null
 * for null/invalid payloads (fail closed — no signature layer renders).
 */
export function parseSignatureFieldConfiguration(
  value: unknown,
): SignatureFieldConfiguration | null {
  if (value == null) return null;
  let raw: unknown = value;
  // Prisma returns JsonValue; tolerate a JSON string as well.
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = SignatureFieldConfigurationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The signing-relevant subset sent from /api/views to the viewer client. */
export type ViewerSignatureConfig = {
  required: boolean;
  signed: boolean;
  consentRequired: boolean;
  methods: SignatureMethodValue[];
  fields: SignatureField[];
};

/**
 * Normalize + validate the signature-related link payload shared by the link
 * create and update APIs. Returns a discriminated result: either the values to
 * persist or a 400 message. Enforces:
 *  - emailProtected + emailAuthenticated are forced on when requireSignature
 *    (signing requires a verified identity);
 *  - signatureVerificationRequired is forced true when requireSignature;
 *  - a non-empty field list must contain at least one SIGNATURE field.
 */
export function resolveSignatureLinkData(linkData: {
  requireSignature?: unknown;
  signatureFieldConfiguration?: unknown;
  signatureVerificationRequired?: unknown;
  signatureConsentRequired?: unknown;
  emailProtected?: boolean;
  emailAuthenticated?: boolean;
}):
  | {
      ok: true;
      values: {
        requireSignature: boolean;
        signatureFieldConfiguration: SignatureFieldConfiguration | null;
        signatureVerificationRequired: boolean;
        signatureConsentRequired: boolean;
        emailProtected?: boolean;
        emailAuthenticated?: boolean;
      };
    }
  | { ok: false; error: string } {
  const requireSignature = linkData.requireSignature === true;
  const consentRequired =
    linkData.signatureConsentRequired !== false; // default true

  if (!requireSignature) {
    // Signing is off — keep a valid field configuration (if provided) so
    // toggling the feature back on doesn't lose the placed fields.
    const validation = SignatureFieldConfigurationSchema.safeParse(
      linkData.signatureFieldConfiguration ?? null,
    );
    return {
      ok: true,
      values: {
        requireSignature: false,
        signatureFieldConfiguration: validation.success
          ? validation.data
          : null,
        signatureVerificationRequired: true,
        signatureConsentRequired: consentRequired,
      },
    };
  }

  const configurationInput =
    linkData.signatureFieldConfiguration ?? DEFAULT_SIGNATURE_CONFIGURATION;
  const validation = SignatureFieldConfigurationSchema.safeParse(
    configurationInput,
  );
  if (!validation.success) {
    return {
      ok: false,
      error:
        validation.error.issues[0]?.message ??
        "Invalid signature configuration.",
    };
  }
  const configuration = validation.data;
  if (
    configuration.fields.length > 0 &&
    !configuration.fields.some((f) => f.type === "SIGNATURE")
  ) {
    return {
      ok: false,
      error: "At least one Signature field is required to enable signing.",
    };
  }

  return {
    ok: true,
    values: {
      requireSignature: true,
      signatureFieldConfiguration: configuration,
      // Signing requires verified identity — always enforced server-side.
      signatureVerificationRequired: true,
      signatureConsentRequired: consentRequired,
      emailProtected: true,
      emailAuthenticated: true,
    },
  };
}
