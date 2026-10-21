import { NextApiRequest, NextApiResponse } from "next";

import { waitUntil } from "@vercel/functions";

import { withTeamApi } from "@/lib/api/auth/with-session-team";
import { assertDocumentAccess } from "@/lib/api/rbac/entitlements";
import { isDataroomScopedRole } from "@/lib/api/rbac/permissions";
import { onDataroomDocumentsAttached } from "@/lib/dataroom/apply-default-permissions";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";

export const config = {
  // in order to enable `waitUntil` function
  supportsResponseStreaming: true,
};

// POST /api/teams/:teamId/documents/:id/add-to-dataroom
const postHandler = withTeamApi(
  async ({ req, res, teamId, userId, role, team, allowedDataroomIds }) => {
    const { id: docId } = req.query as { id: string };
    const { dataroomId } = req.body as { dataroomId: string };

    try {
      // The document must belong to the team.
      const ownedByTeam = await prisma.document.findFirst({
        where: { id: docId, teamId },
        select: { id: true, ownerId: true },
      });
      if (!ownedByTeam) {
        return res.status(401).end("Unauthorized");
      }

      // Scoped members may only attach a document they own or that already
      // lives in one of their assigned rooms.
      if (isDataroomScopedRole(role)) {
        const ownsDocument = ownedByTeam.ownerId === userId;
        const hasRoomAccess =
          ownsDocument ||
          (await assertDocumentAccess({
            role,
            userId,
            teamId,
            documentId: docId,
            allowedIds: allowedDataroomIds,
          }));
        if (!hasRoomAccess) {
          return res
            .status(403)
            .json({ message: "You cannot add this document to a data room." });
        }
      }

      if (
        (team.plan === "free" || team.plan === "pro") &&
        !team.plan.includes("drtrial")
      ) {
        return res.status(403).json({
          message: "Upgrade your plan to use datarooms.",
        });
      }

      // Fetch dataroom with AI settings, scoped to the current team.
      const dataroom = await prisma.dataroom.findUnique({
        where: { id: dataroomId, teamId },
        select: {
          id: true,
          teamId: true,
          name: true,
          isFrozen: true,
          agentsEnabled: true,
          vectorStoreId: true,
        },
      });

      if (!dataroom) {
        return res.status(404).json({
          message: "Dataroom not found!",
        });
      }

      if (dataroom.isFrozen) {
        return res.status(403).json({
          message:
            "This data room is frozen. You cannot add documents to a frozen data room.",
        });
      }

      // Fetch document with primary version
      const document = await prisma.document.findUnique({
        where: { id: docId },
        include: {
          versions: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      if (!document) {
        return res.status(404).json({
          message: "Document not found!",
        });
      }

      let dataroomDocument;
      try {
        dataroomDocument = await prisma.dataroomDocument.create({
          data: {
            documentId: docId,
            dataroomId: dataroom.id,
          },
        });
      } catch (error) {
        return res.status(500).json({
          message: "Document already exists in dataroom!",
        });
      }

      await onDataroomDocumentsAttached({
        dataroomId: dataroom.id,
        dataroomDocuments: [
          {
            id: dataroomDocument.id,
            folderId: dataroomDocument.folderId,
          },
        ],
        schedule: waitUntil,
      });

      return res.status(200).json({
        message: "Document added to dataroom!",
      });
    } catch (error) {
      errorhandler(error, res);
    }
  },
  {
    requiredPermissions: ["documents.write"],
    // dataroomId arrives in the request body for this route.
    resolveDataroomId: ({ req }) =>
      (req as NextApiRequest).body?.dataroomId as string | undefined,
  },
);

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST") {
    return postHandler(req, res);
  } else {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
