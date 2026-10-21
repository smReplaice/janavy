import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { enforceDocumentMemberScope } from "@/lib/api/rbac/guard";
import prisma from "@/lib/prisma";
import { buildSignatureCertificate } from "@/lib/signing/native-certificate";
import { CustomUser } from "@/lib/types";
import { buildAttachmentDispositionForName, log } from "@/lib/utils";

import { authOptions } from "../../../../../../auth/[...nextauth]";

/**
 * GET /api/teams/:teamId/documents/:id/signatures/:recordId/certificate
 * Owner-gated audit certificate PDF for one signature record.
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
        include: {
          link: { select: { name: true, documentId: true } },
          documentVersion: { select: { versionNumber: true, documentId: true } },
          view: { select: { viewedAt: true, verified: true } },
          auditEvents: {
            orderBy: { createdAt: "asc" },
            select: { type: true, createdAt: true },
          },
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

    const { link, documentVersion, view, auditEvents, ...recordBase } = record;

    const certificate = await buildSignatureCertificate({
      ...recordBase,
      linkName: link.name,
      documentName: document.name,
      versionNumber: documentVersion.versionNumber,
      verifiedAt: view?.viewedAt ?? recordBase.createdAt,
      auditEvents,
    });

    const fileName = `janavy-signature-certificate-${recordId.slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      buildAttachmentDispositionForName(fileName),
    );
    res.setHeader("Content-Length", Buffer.from(certificate).length);
    return res.send(Buffer.from(certificate));
  } catch (error) {
    log({
      message: `Error building signature certificate ${recordId}: ${error}`,
      type: "error",
    });
    return res.status(500).json({ message: "Internal server error" });
  }
}
