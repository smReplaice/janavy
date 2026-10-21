/**
 * JANAVI self-hosted PDF → page-image conversion dispatcher.
 *
 * Upstream, PDF uploads are processed by the trigger.dev task
 * `convert-pdf-to-image-route` (lib/trigger/pdf-to-image-route.ts), which
 * loops over the internal mupdf routes (`/api/mupdf/get-pages` and
 * `/api/mupdf/convert-page`, authenticated with INTERNAL_API_KEY) and then
 * flips `DocumentVersion.hasPages`. That task requires a trigger.dev cloud
 * deployment (TRIGGER_SECRET_KEY).
 *
 * For self-hosted JANAVI installs without trigger.dev, this module runs the
 * exact same pipeline in-process: it replicates the trigger task's loop —
 * same internal routes, same keyword-block behavior, same Document /
 * DocumentVersion updates — and is dispatched via `waitUntil` so the
 * uploading API still returns fast. The heavy lifting (PDF rasterization)
 * stays in the mupdf API routes, exactly as in the trigger path.
 */
import { waitUntil } from "@vercel/functions";
import type { TriggerOptions } from "@trigger.dev/sdk";

import { ONE_HOUR } from "@/lib/constants";
import { isTrustedTeam } from "@/lib/edge-config/trusted-teams";
import { getFile } from "@/lib/files/get-file";
import prisma from "@/lib/prisma";
import { convertPdfToImageRoute } from "@/lib/trigger/pdf-to-image-route";

export type ConvertPdfToImagePayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
  versionNumber?: number;
};

/** True when a trigger.dev deployment is configured for background jobs. */
export function isTriggerDevConfigured(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY?.trim());
}

async function callMupdfRoute<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}${path}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
      },
    },
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      `${path} failed (status ${response.status})${
        errorData?.error ? `: ${errorData.error}` : ""
      }`,
    );
  }

  return (await response.json()) as T;
}

/**
 * In-process replica of the `convert-pdf-to-image-route` trigger task.
 * Same steps, same updates — see the trigger task for the canonical path.
 */
export async function runInlinePdfToImageConversion(
  payload: ConvertPdfToImagePayload,
): Promise<{
  success: boolean;
  message: string;
  totalPages: number;
}> {
  const { documentVersionId, teamId, documentId, versionNumber } = payload;

  const documentVersion = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: { file: true, storageType: true, numPages: true },
  });

  if (!documentVersion) {
    throw new Error(
      `[janavi/inline-conversion] Document version not found: ${documentVersionId}`,
    );
  }

  const signedUrl = await getFile({
    type: documentVersion.storageType,
    data: documentVersion.file,
    expiresIn: ONE_HOUR,
  });

  if (!signedUrl) {
    throw new Error(
      `[janavi/inline-conversion] Failed to get signed URL for document version ${documentVersionId}`,
    );
  }

  let numPages = documentVersion.numPages;

  // Mirror the trigger task: only trust a stored page count above 1.
  if (!numPages || numPages === 1) {
    const { numPages: numPagesResult } = await callMupdfRoute<{
      numPages: number;
    }>("/api/mupdf/get-pages", { url: signedUrl });

    if (numPagesResult < 1) {
      throw new Error(
        `[janavi/inline-conversion] Invalid page count for document version ${documentVersionId}`,
      );
    }
    numPages = numPagesResult;
  }

  const trustedTeam = await isTrustedTeam(teamId);

  let currentPage = 0;
  for (let i = 0; i < numPages; ++i) {
    currentPage = i + 1;
    await callMupdfRoute<{ documentPageId: string }>(
      "/api/mupdf/convert-page",
      {
        documentVersionId,
        pageNumber: currentPage,
        url: signedUrl,
        teamId,
        trustedTeam,
      },
    );
  }

  await prisma.documentVersion.update({
    where: { id: documentVersionId },
    data: {
      numPages,
      hasPages: true,
      isPrimary: true,
    },
    select: { id: true, hasPages: true, isPrimary: true },
  });

  if (versionNumber) {
    await prisma.documentVersion.updateMany({
      where: {
        documentId,
        versionNumber: { not: versionNumber },
      },
      data: { isPrimary: false },
    });
  }

  // Revalidate the document's links (best-effort, same as the trigger task).
  try {
    await fetch(
      `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${documentId}`,
    );
  } catch (error) {
    console.error("[janavi/inline-conversion] Failed to revalidate:", error);
  }

  console.log(
    `[janavi/inline-conversion] Processing complete for document ${documentId} ` +
      `(${numPages} pages, version ${versionNumber ?? 1})`,
  );

  return {
    success: true,
    message: "Successfully converted PDF to images",
    totalPages: numPages,
  };
}

/**
 * Dispatch the PDF → page-image conversion.
 *
 * Prefers the trigger.dev task when configured; otherwise (self-hosted
 * without trigger.dev, e.g. TRIGGER_SECRET_KEY absent) runs the pipeline
 * in-process via `waitUntil` so the caller's response is not delayed.
 */
export async function dispatchPdfToImageConversion(
  payload: ConvertPdfToImagePayload,
  options?: TriggerOptions,
): Promise<void> {
  if (isTriggerDevConfigured()) {
    try {
      await convertPdfToImageRoute.trigger(payload, options);
      return;
    } catch (error) {
      // A trigger.dev outage must not leave the document unprocessed.
      console.error(
        "[janavi/inline-conversion] trigger.dev dispatch failed, falling back to in-process conversion:",
        error,
      );
    }
  }

  waitUntil(
    runInlinePdfToImageConversion(payload).catch((error) => {
      console.error(
        "[janavi/inline-conversion] In-process PDF conversion failed:",
        error,
      );
    }),
  );
}
