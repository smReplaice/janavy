import { NextApiRequest, NextApiResponse } from "next";

import { DocumentStorageType } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { enforceDocumentMemberScope } from "@/lib/api/rbac/guard";
import { getFile } from "@/lib/files/get-file";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { buildAttachmentDispositionForName, log } from "@/lib/utils";

import { authOptions } from "../../../../../../auth/[...nextauth]";

/**
 * GET /api/teams/:teamId/documents/:id/signatures/:recordId/download
 * Owner-gated presigned download of the SIGNED PDF for one signature record.
 * The recipient never receives this file — only the owner side may fetch it.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { id: documentId, teamId, recordId } = req.query as {
    id: string;
    teamId: string;
    recordId: string;
  };
  const userId = (session.user as CustomUser).id;

  if (await enforceDocumentMemberScope({ userId, teamId, documentId, res })) {
    return;
  }

  try {
    const [record, document] = await Promise.all([
      prisma.signatureRecord.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          signedFileKey: true,
          status: true,
          viewerEmail: true,
          link: { select: { documentId: true } },
          documentVersion: { select: { documentId: true, versionNumber: true } },
        },
      }),
      prisma.document.findUnique({
        where: { id: documentId, teamId },
        select: {
          name: true,
          team: {
            select: { users: { where: { userId }, select: { userId: true } } },
          },
        },
      }),
    ]);

    if (!document || document.team.users.length === 0) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (
      !record ||
      record.link.documentId !== documentId ||
      record.documentVersion.documentId !== documentId
    ) {
      return res.status(404).json({ message: "Signature record not found" });
    }

    if (record.status !== "COMPLETED" || !record.signedFileKey) {
      return res
        .status(404)
        .json({ message: "No signed PDF is available for this record." });
    }

    const fileName = `${document.name.replace(/[^\w\-. ]+/g, "_").trim() || "document"} (signed by ${record.viewerEmail}).pdf`;
    const downloadUrl = await getFile({
      type: DocumentStorageType.S3_PATH,
      data: record.signedFileKey,
      isDownload: true,
      responseContentDisposition:
        buildAttachmentDispositionForName(fileName),
    });

    return res.status(200).json({ downloadUrl, fileName });
  } catch (error) {
    log({
      message: `Error preparing signed PDF download ${recordId}: ${error}`,
      type: "error",
    });
    return res.status(500).json({ message: "Internal server error" });
  }
}
