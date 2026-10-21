/**
 * JANAVY feature registry.
 *
 * Single source of truth for which JANAVY capabilities are enabled.
 * A flag may only be `true` when the feature is implemented, functional
 * and tested. Unimplemented features ship `false` and their UI mounts
 * and API routes must degrade cleanly (hidden or 404-with-explanation),
 * never presented as working.
 *
 * This registry replaces subscription/plan entitlements. It does NOT
 * replace security controls: authentication, RBAC, tenant isolation,
 * document access policies and rate limits always apply regardless of
 * these flags. See docs/architecture/enterprise-dependency-audit.md.
 */

export const JANAVI_FEATURES = {
  /** Core authenticated document sharing (upload, links, viewing). */
  secureDocumentSharing: true,

  /**
   * Protected Viewer: server-rendered protected pages, no full-file URL
   * to the browser, page-level authorization on every request.
   * Phase: P1 (Sprint 2). Until then the standard viewer applies.
   */
  protectedViewer: false,

  /** Link-level download blocking (server-enforced on every download endpoint). */
  disableDownloads: true,

  /**
   * Copy restrictions: text-selection off + clipboard interception +
   * no raw text in restricted viewer APIs. Phase: P1.
   * (Selection is already off by default; enforcement incomplete.)
   */
  disableCopy: false,

  /** Print restrictions: print controls hidden + shortcuts intercepted + no server export. Phase: P1. */
  disablePrint: false,

  /**
   * Dynamic watermarking. Today: client overlay while viewing +
   * server-side burn-in on PDF/image downloads. Phase P1 adds
   * server-side watermarking of protected pages themselves.
   */
  dynamicWatermark: true,

  /** Screen Shield (visibility window 20/35/50/100% + shortcut detection). Phase: P2. */
  screenShield: false,

  /** Email OTP verification for link access (emailAuthenticated). */
  emailOTP: true,

  /**
   * Native electronic signatures: single-signer e-signature on document
   * links (owner places fields on the page-image preview; the recipient
   * signs inside the protected viewer; the PDF is modified server-side
   * only — lib/signing/native.ts + /api/views/sign). This is an electronic
   * signature (consent + email-OTP-verified identity + audit trail), not a
   * certificate-based digital signature.
   */
  electronicSignatures: true,

  /** Link access expiration (expiresAt, server-enforced). */
  accessExpiration: true,

  /** Immediate access revocation (link archive, deny lists, viewer session revocation). */
  accessRevocation: true,

  /** Virtual data rooms (folders, documents, groups, bulk download). */
  dataRooms: true,

  /** Folder/document permission groups (ViewerGroup + PermissionGroup access controls). */
  folderPermissions: true,

  /** Document + data room analytics (views, visitors, durations, CSV export). */
  documentAnalytics: true,

  /** Structured security audit event stream + dashboard. Phase: P3. */
  auditLogs: false,

  /**
   * True (permanent) document redaction: content removal via mupdf
   * applyRedactions, verified non-recoverable. Phase: P2. The redaction
   * UI must stay hidden until this is true.
   */
  documentRedaction: false,

  /**
   * Office document conversion (DOCX/PPTX/TXT → PDF via headless
   * LibreOffice) feeding the page-image pipeline. Phase: P1. Until
   * enabled, PDF/image/sheet/video uploads work; office formats are
   * rejected with a clear status message.
   */
  documentConversions: false,

  /** JANAVY Q&A / conversations on data rooms. Phase: P2. */
  conversations: false,

  /** Document request lists / tasks. Phase: P2. Upload authorization pieces ship earlier. */
  requestLists: false,

  /** AI processing policy + acknowledgement + risk scoring. Phase: P2+. */
  aiProtectionPolicy: false,
} as const;

export type JanaviFeature = keyof typeof JANAVI_FEATURES;

/** Read a feature flag. Unknown flags are false (fail closed). */
export function isJanaviFeatureEnabled(feature: string): boolean {
  return (JANAVI_FEATURES as Record<string, boolean | undefined>)[feature] === true;
}
