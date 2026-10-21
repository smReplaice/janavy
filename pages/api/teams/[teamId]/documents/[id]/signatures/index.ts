import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { enforceDocumentMemberScope } from "@/lib/api/rbac/guard";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { log } from "@/lib/utils";

import { authOptions } from "../../../../../auth/[...nextauth]";

/**
 * GET /api/teams/:teamId/documents/:id/signatures
 * Owner/team-member list of native electronic signature records for a document.
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

  const { id: documentId, teamId } = req.query as {
    id: string;
    teamId: string;
  };
  const userId = (session.user as CustomUser).id;

  // Dataroom-scoped members may only access documents in their assigned rooms.
  if (await enforceDocumentMemberScope({ userId, teamId, documentId, res })) {
    return;
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId, teamId },
      select: {
        id: true,
        name: true,
        team: {
          select: { users: { where: { userId }, select: { userId: true } } },
        },
      },
    });

    if (!document || document.team.users.length === 0) {
      return res.status(403).json({ message: "Access denied" });
    }

    const records = await prisma.signatureRecord.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        linkId: true,
        viewerEmail: true,
        method: true,
        status: true,
        consentAcceptedAt: true,
        signedAt: true,
        signedFileHash: true,
        originalFileHash: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        documentVersionId: true,
        fieldValues: true,
        link: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({
      documentId,
      documentName: document.name,
      signatures: records,
    });
  } catch (error) {
    log({
      message: `Error listing signatures for document ${documentId}: ${error}`,
      type: "error",
    });
    return res.status(500).json({ message: "Internal server error" });
  }
}
