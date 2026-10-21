import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "node:path";
import { promisify } from "util";

import { ONE_HOUR } from "@/lib/constants";
import { getFile } from "@/lib/files/get-file";
import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import { convertPdfToImageRoute } from "@/lib/trigger/pdf-to-image-route";
import { log } from "@/lib/utils";

/**
 * Office document conversion to PDF (JANAVI).
 *
 * Independent implementation of the `convert-files-to-pdf` /
 * `convert-keynote-to-pdf` task ids dispatched by
 * `lib/api/documents/process-document.ts`,
 * `pages/api/teams/[teamId]/documents/[id]/versions/index.ts` and
 * `pages/api/teams/[teamId]/documents/agreement.ts`.
 *
 * Pipeline: fetch the version's original file via a signed URL, convert it
 * with headless LibreOffice (`soffice --headless --convert-to pdf`), upload
 * the PDF next to the original under `${teamId}/${docId}/converted.pdf`,
 * update `DocumentVersion.file` (keeping `originalFile`), then dispatch the
 * existing AGPL `convertPdfToImageRoute` for page images.
 *
 * Retries: transient failures throw and rely on trigger.dev's default
 * 3-attempt retry policy plus the dispatch sites' idempotency keys.
 * Permanent conditions (missing soffice binary, missing version) abort
 * without retry via AbortTaskRunError so the failure surfaces immediately
 * with a clear message.
 */

const execFileAsync = promisify(execFile);

/** macOS / Linux locations probed when `soffice` is not on PATH. */
const SOFFICE_COMMON_PATHS = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/local/bin/soffice",
  "/opt/libreoffice/program/soffice",
  "/snap/bin/libreoffice",
];

/**
 * Resolve the soffice binary: `JANAVI_CONVERSION_SOFFICE` override first,
 * then PATH lookup, then common install locations. Returns null when
 * LibreOffice is not available on this machine.
 */
async function resolveSofficeBinary(): Promise<string | null> {
  const override = process.env.JANAVI_CONVERSION_SOFFICE;
  if (override) {
    try {
      await fs.access(override, fs.constants.X_OK);
      return override;
    } catch {
      logger.error(
        "JANAVI_CONVERSION_SOFFICE is set but not executable",
        { override },
      );
      return null;
    }
  }

  try {
    const which = await execFileAsync("which", ["soffice"]);
    const resolved = which.stdout.trim();
    if (resolved) return resolved;
  } catch {
    // not on PATH — fall through to common locations
  }

  for (const candidate of SOFFICE_COMMON_PATHS) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep probing
    }
  }

  return null;
}

type ConvertFilesToPdfPayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
};

type ConvertFilesToPdfResult = {
  status: "converted" | "already-converted";
  documentId: string;
  documentVersionId: string;
  pdfKey: string | null;
};

async function convertVersionToPdf(
  payload: ConvertFilesToPdfPayload,
  options: {
    /** Extra context for error messages (e.g. "Keynote"). */
    label: string;
  },
): Promise<ConvertFilesToPdfResult> {
  const { documentId, documentVersionId, teamId } = payload;

  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: {
      id: true,
      file: true,
      originalFile: true,
      type: true,
      contentType: true,
      storageType: true,
      document: { select: { id: true, teamId: true } },
    },
  });

  if (!version || version.document.teamId !== teamId) {
    throw new AbortTaskRunError(
      `Document version ${documentVersionId} not found for team ${teamId}`,
    );
  }

  // Idempotency: if a previous attempt already swapped the version to a
  // converted PDF, just (re-)dispatch page images.
  if (version.type === "pdf" && version.originalFile) {
    logger.info("Version already converted to PDF", {
      documentVersionId,
    });
    await dispatchPageImages(payload);
    return {
      status: "already-converted",
      documentId,
      documentVersionId,
      pdfKey: version.file,
    };
  }

  const soffice = await resolveSofficeBinary();
  if (!soffice) {
    throw new AbortTaskRunError(
      `${options.label} conversion failed: LibreOffice (soffice) is not installed on this server. Install LibreOffice or set JANAVI_CONVERSION_SOFFICE to the soffice binary path.`,
    );
  }

  const signedUrl = await getFile({
    data: version.originalFile ?? version.file,
    type: version.storageType,
    expiresIn: ONE_HOUR,
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "janavi-convert-"));

  try {
    const sourceExt =
      path.extname(version.originalFile ?? version.file) || ".bin";
    const inputPath = path.join(workDir, `input${sourceExt}`);

    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download source file for ${options.label} conversion (status ${response.status})`,
      );
    }
    await fs.writeFile(inputPath, Buffer.from(await response.arrayBuffer()));

    // `--convert-to pdf` writes `<basename>.pdf` into --outdir.
    try {
      await execFileAsync(
        soffice,
        [
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch (error) {
      // Transient conversion failure: throw so trigger.dev retries.
      logger.error(`${options.label} conversion via soffice failed`, {
        documentVersionId,
        error,
      });
      throw new Error(
        `${options.label} conversion failed: LibreOffice could not convert this document. The file may be corrupted or use an unsupported format.`,
      );
    }

    const pdfPath = path.join(
      workDir,
      `${path.basename(inputPath, sourceExt)}.pdf`,
    );

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fs.readFile(pdfPath);
    } catch {
      // soffice exited 0 but produced nothing (common for .key): no false
      // success — fail the run with a clear status.
      throw new Error(
        `${options.label} conversion failed: LibreOffice produced no PDF output for this document.`,
      );
    }

    if (pdfBuffer.length === 0) {
      throw new Error(
        `${options.label} conversion failed: LibreOffice produced an empty PDF for this document.`,
      );
    }

    // Upload next to the original: `${teamId}/${docId}/converted.pdf`.
    const { type: storageType, data: pdfKey } = await putFileServer({
      file: {
        name: "converted.pdf",
        type: "application/pdf",
        buffer: pdfBuffer,
      },
      teamId,
      docId: documentId,
      restricted: true,
    });

    // Point the version at the PDF, keep the original for downloads.
    await prisma.documentVersion.update({
      where: { id: documentVersionId },
      data: {
        file: pdfKey,
        originalFile: version.originalFile ?? version.file,
        type: "pdf",
        contentType: "application/pdf",
        storageType,
        fileSize: BigInt(pdfBuffer.length),
      },
    });

    await dispatchPageImages(payload);

    logger.info(`${options.label} converted to PDF`, {
      documentId,
      documentVersionId,
      pdfKey,
    });

    return {
      status: "converted",
      documentId,
      documentVersionId,
      pdfKey,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Hand the converted PDF to the existing AGPL page-image pipeline. */
async function dispatchPageImages(payload: ConvertFilesToPdfPayload) {
  const { documentId, documentVersionId, teamId } = payload;
  await convertPdfToImageRoute.trigger(
    {
      documentId,
      documentVersionId,
      teamId,
    },
    {
      idempotencyKey: `${teamId}-${documentVersionId}`,
      tags: [
        `team_${teamId}`,
        `document_${documentId}`,
        `version:${documentVersionId}`,
      ],
      concurrencyKey: teamId,
    },
  );
}

export const convertFilesToPdfTask = task({
  id: "convert-files-to-pdf",
  machine: { preset: "medium-1x" },
  run: (payload: ConvertFilesToPdfPayload) =>
    convertVersionToPdf(payload, { label: "Office document" }),
});

export const convertKeynoteToPdfTask = task({
  id: "convert-keynote-to-pdf",
  machine: { preset: "medium-1x" },
  run: async (payload: ConvertFilesToPdfPayload) => {
    try {
      return await convertVersionToPdf(payload, { label: "Keynote" });
    } catch (error) {
      // Keynote support via LibreOffice is best-effort: report a clear
      // failed status, never a false success.
      await log({
        message: `Keynote conversion failed for document version _${payload.documentVersionId}_: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      }).catch(() => {});
      throw error;
    }
  },
});
