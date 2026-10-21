/**
 * Native electronic signature — SERVER-side signing pipeline.
 *
 * The recipient signs through the protected page-image viewer; this module is
 * the only place the original PDF is fetched and modified. The signed output is
 * stored in private S3 next to the original (`${teamId}/${docId}/signed-…pdf`)
 * and is owner-gated. The original object is NEVER modified.
 *
 * Coordinate convention (see lib/signing/signature-fields.ts): field boxes are
 * normalized 0–1 fractions of the DISPLAYED page box, measured from the
 * top-left. PDF user space is bottom-left origin on the UNROTATED page, so the
 * pipeline maps displayed coordinates through the page's /Rotate value.
 */

import { SignatureMethod } from "@prisma/client";
import crypto from "crypto";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

import { getFile } from "@/lib/files/get-file";
import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import {
  isImageFieldType,
  SignatureField,
  SignatureFieldConfiguration,
} from "@/lib/signing/signature-fields";

export { isImageFieldType };

/** A submitted value for one configured field. */
export type SignatureFieldValue = {
  fieldId: string;
  /** Text value (FULL_NAME, DATE, COMPANY). */
  value?: string;
  /** PNG/JPEG data URL (SIGNATURE, INITIALS — draw/type/upload all produce an image). */
  dataUrl?: string;
};

export type NativeSignatureInput = {
  linkId: string;
  documentId: string;
  documentVersionId: string;
  teamId: string;
  viewerEmail: string;
  method: SignatureMethod;
  configuration: SignatureFieldConfiguration;
  fieldValues: SignatureFieldValue[];
};

export type NativeSignatureResult = {
  signedFileKey: string;
  signedFileHash: string;
  originalFileHash: string;
  fieldValues: Record<string, string>;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per signature image

export function sha256Hex(buffer: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Validate submitted values against the configured fields.
 * Throws Error with a signer-friendly message on any violation.
 */
export function validateFieldValues(
  configuration: SignatureFieldConfiguration,
  fieldValues: SignatureFieldValue[],
): void {
  const byId = new Map(fieldValues.map((v) => [v.fieldId, v]));
  const seen = new Set<string>();

  for (const field of configuration.fields) {
    const submitted = byId.get(field.fieldId);
    seen.add(field.fieldId);
    const value = submitted?.value?.trim() ?? "";
    const dataUrl = submitted?.dataUrl ?? "";

    if (isImageFieldType(field.type)) {
      if (!dataUrl) {
        if (field.required) {
          throw new Error(`Signature field on page ${field.pageNumber} is required.`);
        }
        continue;
      }
      if (!/^data:image\/(png|jpeg);base64,/.test(dataUrl)) {
        throw new Error("Signature images must be PNG or JPEG data URLs.");
      }
      if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) {
        throw new Error("Signature image is too large (max 2 MB).");
      }
    } else {
      if (!value) {
        if (field.required) {
          throw new Error(
            `The "${field.type}" field on page ${field.pageNumber} is required.`,
          );
        }
        continue;
      }
      if (value.length > 200) {
        throw new Error("Text fields are limited to 200 characters.");
      }
    }
  }

  const unknown = fieldValues.filter((v) => !seen.has(v.fieldId));
  if (unknown.length > 0) {
    throw new Error("Submitted values contain unknown signature fields.");
  }
}

async function fetchOriginalPdfBytes(
  documentVersionId: string,
): Promise<{ bytes: Buffer; fileKey: string; storageType: string }> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: { file: true, originalFile: true, storageType: true, type: true },
  });
  if (!version) {
    throw new Error("Document version not found.");
  }
  // originalFile holds the true PDF for office conversions; the primary `file`
  // is the PDF for pdf-type documents. Both paths stay private: we fetch via a
  // short-lived presigned URL server-side and never expose it to the client.
  const key = version.originalFile ?? version.file;
  const url = await getFile({ data: key, type: version.storageType });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch the original document (${response.status}).`);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    fileKey: key,
    storageType: version.storageType,
  };
}

type DataUrlImage = { bytes: Buffer; mime: "image/png" | "image/jpeg" };

function parseDataUrl(dataUrl: string): DataUrlImage {
  const match = /^data:(image\/(?:png|jpeg));base64,(.*)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Unsupported signature image format (PNG or JPEG only).");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Signature image is too large (max 2 MB).");
  }
  return { bytes, mime: match[1] as "image/png" | "image/jpeg" };
}

/**
 * Map a field box from normalized displayed-page coordinates (top-left origin)
 * to unrotated PDF user space (bottom-left origin), honoring /Rotate.
 */
function fieldBoxToPdfSpace(
  page: PDFPage,
  field: SignatureField,
): { x: number; y: number; width: number; height: number } {
  const { width: W, height: H } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;

  const dx = field.x * (rotation === 90 || rotation === 270 ? H : W);
  const dyTop = field.y * (rotation === 90 || rotation === 270 ? W : H);
  const dw = field.width * (rotation === 90 || rotation === 270 ? H : W);
  const dh = field.height * (rotation === 90 || rotation === 270 ? W : H);

  switch (rotation) {
    case 90:
      // displayed (dx, dy) → unrotated (ux=dy, uy=H-dx)
      return { x: dyTop, y: H - dx - dw, width: dh, height: dw };
    case 180:
      // displayed (dx, dy) → unrotated (ux=W-dx, uy=dy)
      return { x: W - dx - dw, y: dyTop, width: dw, height: dh };
    case 270:
      // displayed (dx, dy) → unrotated (ux=W-dy, uy=dx)
      return { x: W - dyTop - dh, y: dx, width: dh, height: dw };
    default:
      return { x: dx, y: H - dyTop - dh, width: dw, height: dh };
  }
}

function embedImageFor(
  pdf: PDFDocument,
  image: DataUrlImage,
): Promise<PDFImage> {
  return image.mime === "image/png"
    ? pdf.embedPng(image.bytes)
    : pdf.embedJpg(image.bytes);
}

function drawFittedImage(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
) {
  // Fit inside the field box preserving aspect ratio, centered.
  const scale = Math.min(
    box.width / image.width,
    box.height / image.height,
  );
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - drawWidth) / 2,
    y: box.y + (box.height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function drawFittedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  box: { x: number; y: number; width: number; height: number },
) {
  // Start at ~62% of the box height, shrink until the text fits the width.
  let fontSize = Math.max(4, box.height * 0.62);
  const maxWidth = box.width * 0.96;
  while (fontSize > 4 && font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  const baseline =
    box.y + (box.height - font.heightAtSize(fontSize)) / 2 +
    font.heightAtSize(fontSize) * 0.18;
  page.drawText(text, {
    x: box.x + box.width * 0.02,
    y: baseline,
    size: fontSize,
    font,
    color: rgb(0.05, 0.05, 0.08),
  });
}

/**
 * Embed the submitted field values into the original PDF and return the signed
 * bytes. Pure function (no storage side effects) so it stays testable.
 */
export async function embedSignatureIntoPdf(
  originalBytes: Buffer,
  input: Pick<NativeSignatureInput, "configuration" | "fieldValues">,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const byId = new Map(input.fieldValues.map((v) => [v.fieldId, v]));
  const pageCount = pdf.getPageCount();

  for (const field of input.configuration.fields) {
    const submitted = byId.get(field.fieldId);
    const textValue = submitted?.value?.trim() ?? "";
    const dataUrl = submitted?.dataUrl ?? "";
    if (!textValue && !dataUrl) continue; // optional, left blank

    if (field.pageNumber > pageCount) {
      throw new Error(
        `Signature field targets page ${field.pageNumber}, but the document has ${pageCount} page(s). Reconfigure the signature fields.`,
      );
    }
    const page = pdf.getPage(field.pageNumber - 1);
    const box = fieldBoxToPdfSpace(page, field);

    if (isImageFieldType(field.type)) {
      const image = await embedImageFor(pdf, parseDataUrl(dataUrl));
      drawFittedImage(page, image, box);
    } else {
      drawFittedText(page, font, textValue, box);
    }
  }

  return pdf.save({ useObjectStreams: true });
}

/**
 * Full signing pipeline: fetch original → embed → hash → upload signed copy.
 * The original S3 object is only ever read.
 */
export async function signDocumentServerSide(
  input: NativeSignatureInput,
): Promise<NativeSignatureResult> {
  const original = await fetchOriginalPdfBytes(input.documentVersionId);
  const signedBytes = await embedSignatureIntoPdf(original.bytes, input);
  const signedBuffer = Buffer.from(signedBytes);

  const originalFileHash = sha256Hex(original.bytes);
  const signedFileHash = sha256Hex(signedBuffer);

  const primaryVersion = await prisma.documentVersion.findUnique({
    where: { id: input.documentVersionId },
    select: { versionNumber: true },
  });

  const { data: signedFileKey } = await putFileServer({
    file: {
      name: `signed-v${primaryVersion?.versionNumber ?? 1}-${input.linkId}.pdf`,
      type: "application/pdf",
      buffer: signedBuffer,
    },
    teamId: input.teamId,
    docId: input.documentId,
    restricted: true,
  });

  // Text evidence per fieldId (images intentionally excluded — they live only
  // inside the signed PDF).
  const fieldValues: Record<string, string> = {};
  for (const v of input.fieldValues) {
    if (v.value) fieldValues[v.fieldId] = v.value.trim();
  }

  return { signedFileKey, signedFileHash, originalFileHash, fieldValues };
}
