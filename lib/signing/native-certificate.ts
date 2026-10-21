/**
 * Native electronic signature — audit certificate PDF (pdf-lib).
 *
 * Owner-facing evidence document for one completed SignatureRecord. It states
 * honestly what it is: an ELECTRONIC signature record verified via Email OTP —
 * not a certificate-based digital signature.
 */

import { SignatureRecord } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { BRANDING } from "@/config/branding";
import { SIGNATURE_CONSENT_COPY } from "@/lib/signing/signature-fields";

export type CertificateRecord = SignatureRecord & {
  linkName: string | null;
  documentName: string;
  versionNumber: number | null;
  verifiedAt: Date | null;
  auditEvents: { type: string; createdAt: Date }[];
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

type Row = [string, string];

function sanitize(text: string): string {
  // Helvetica (WinAnsi) cannot encode arbitrary unicode — replace what breaks.
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "?");
}

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildSignatureCertificate(
  record: CertificateRecord,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.04, 0.07, 0.2);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.07, 0.24, 1);

  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(BRANDING.wordmark, {
    x: MARGIN,
    y,
    size: 20,
    font: bold,
    color: ink,
  });
  y -= 16;
  page.drawText(BRANDING.tagline, {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: muted,
  });
  y -= 30;
  page.drawText("Electronic Signature Certificate", {
    x: MARGIN,
    y,
    size: 16,
    font: bold,
    color: ink,
  });
  y -= 16;
  page.drawText(`Certificate ID: ${record.id}`, {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: muted,
  });
  y -= 22;

  const fmt = (date: Date | null) =>
    date
      ? `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`
      : "—";

  const rows: Row[] = [
    ["Document", record.documentName],
    [
      "Document version",
      record.versionNumber != null ? `v${record.versionNumber}` : "—",
    ],
    ["Link", record.linkName ?? record.linkId],
    ["Signer email", record.viewerEmail],
    ["Verification method", "Email OTP (one-time code to signer email)"],
    ["Identity verified at", fmt(record.verifiedAt)],
    ["Consent accepted at", fmt(record.consentAcceptedAt)],
    ["Signed at", fmt(record.signedAt)],
    ["Signing method", record.method],
    ["Signer IP address", record.ipAddress ?? "—"],
    ["Signer user agent", sanitize((record.userAgent ?? "—").slice(0, 90))],
    ["Signed document SHA-256", record.signedFileHash ?? "—"],
    ["Original document SHA-256", record.originalFileHash ?? "—"],
    ["Status", record.status],
  ];

  const labelWidth = 160;
  const valueX = MARGIN + labelWidth + 12;
  const valueWidth = PAGE_WIDTH - MARGIN * 2 - labelWidth - 12;

  for (const [label, value] of rows) {
    const lines = wrap(String(value ?? "—"), regular, 9, valueWidth);
    page.drawText(sanitize(label), {
      x: MARGIN,
      y,
      size: 9,
      font: bold,
      color: muted,
    });
    for (const line of lines) {
      page.drawText(line, { x: valueX, y, size: 9, font: regular, color: ink });
      y -= 12;
    }
    y -= 2;
  }

  y -= 8;
  page.drawText("Consent statement accepted by the signer", {
    x: MARGIN,
    y,
    size: 9,
    font: bold,
    color: ink,
  });
  y -= 13;
  for (const line of wrap(`"${SIGNATURE_CONSENT_COPY}"`, regular, 9, PAGE_WIDTH - MARGIN * 2)) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    y -= 12;
  }

  y -= 14;
  page.drawText("Audit trail", {
    x: MARGIN,
    y,
    size: 9,
    font: bold,
    color: ink,
  });
  y -= 13;
  for (const event of record.auditEvents) {
    const line = `${event.type}  ·  ${fmt(event.createdAt)}`;
    page.drawText(sanitize(line), {
      x: MARGIN,
      y,
      size: 8,
      font: regular,
      color: muted,
    });
    y -= 11;
  }

  y -= 12;
  for (const line of wrap(
    "This certificate documents an electronic signature captured by Janavy. " +
      "The signer verified possession of the stated email address via a one-time " +
      "code before signing. An electronic signature records the signer's intent " +
      "and identity evidence; it is not a certificate-based digital signature " +
      "and does not cryptographically validate the document's contents.",
    regular,
    8,
    PAGE_WIDTH - MARGIN * 2,
  )) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 8,
      font: regular,
      color: muted,
    });
    y -= 11;
  }

  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 18 },
    end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 18 },
    thickness: 0.5,
    color: muted,
  });
  page.drawText(`${BRANDING.productName} · ${BRANDING.website}`, {
    x: MARGIN,
    y: MARGIN + 6,
    size: 7,
    font: regular,
    color: accent,
  });

  return pdf.save();
}
