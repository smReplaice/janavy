import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

import { JANAVI_FEATURES } from "@/config/features";
import { enforceDataroomMemberScope } from "@/lib/api/rbac/guard";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { log } from "@/lib/utils";

/**
 * Data room Q&A questions API (JANAVY).
 *
 * Minimal Q&A surface over the AGPL Prisma models `DataroomQuestion` and
 * `DataroomQuestionAssignment` (prisma/schema/conversation.prisma).
 *
 * - GET  /questions            → list questions for the room (team members)
 * - GET  /questions/{id}       → single question
 * - POST /questions            → create a question (write: feature-gated)
 * - PATCH /questions/{id}      → update status / assignment (write: gated)
 *
 * Writes are gated behind `JANAVI_FEATURES.conversations` (currently false):
 * until the Q&A feature ships, they return 501 with a clear message instead
 * of pretending to work. Auth/RBAC follow the sibling dataroom routes
 * (getServerSession + team membership + enforceDataroomMemberScope).
 */

/** Allowed question statuses (mirrors the schema default "unanswered"). */
const QUESTION_STATUSES = ["unanswered", "answered", "closed"] as const;
type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** One assignment target: exactly one of link / group / viewer / email. */
type AssignmentTarget = {
  linkId?: string;
  groupId?: string;
  viewerId?: string;
  email?: string;
};

const isAssignmentTarget = (
  value: unknown,
): value is AssignmentTarget =>
  typeof value === "object" &&
  value !== null &&
  ["linkId", "groupId", "viewerId", "email"].some(
    (key) => typeof (value as Record<string, unknown>)[key] === "string",
  );

const assignmentWhere = (target: AssignmentTarget) => ({
  OR: [
    ...(target.linkId ? [{ linkId: target.linkId }] : []),
    ...(target.groupId ? [{ groupId: target.groupId }] : []),
    ...(target.viewerId ? [{ viewerId: target.viewerId }] : []),
    ...(target.email ? [{ email: target.email.toLowerCase() }] : []),
  ],
});

/** Create payload for the single target a question is assigned to. */
const assignmentCreate = (target: AssignmentTarget) => ({
  ...(target.linkId ? { linkId: target.linkId } : {}),
  ...(target.groupId ? { groupId: target.groupId } : {}),
  ...(target.viewerId ? { viewerId: target.viewerId } : {}),
  ...(target.email ? { email: target.email.toLowerCase() } : {}),
});

const QUESTIONS_SELECT = {
  id: true,
  content: true,
  category: true,
  priority: true,
  status: true,
  orderIndex: true,
  dataroomDocumentId: true,
  dataroomDocument: { select: { id: true, name: true } },
  createdByUserId: true,
  createdByUser: { select: { id: true, name: true, email: true } },
  assignments: {
    select: {
      id: true,
      linkId: true,
      groupId: true,
      viewerId: true,
      email: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { teamId, id: dataroomId, questions } = req.query as {
    teamId: string;
    id: string;
    questions?: string[];
  };

  const userId = (session.user as CustomUser).id;
  // questionId when the catch-all captured one: /questions/{questionId}
  const questionId = questions?.[0];

  // Scoped members may only read Q&A for their assigned rooms.
  if (await enforceDataroomMemberScope({ userId, teamId, dataroomId, res })) {
    return;
  }

  try {
    // Check the user is part of the team (sibling pattern).
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        users: { some: { userId } },
      },
      select: { id: true },
    });
    if (!team) {
      return res.status(403).end("Unauthorized to access this team");
    }

    const dataroom = await prisma.dataroom.findUnique({
      where: { id: dataroomId, teamId },
      select: { id: true },
    });
    if (!dataroom) {
      return res.status(404).end("Dataroom not found");
    }

    if (req.method === "GET") {
      // GET /api/teams/:teamId/datarooms/:id/questions
      // GET /api/teams/:teamId/datarooms/:id/questions/:questionId
      if (questionId) {
        const question = await prisma.dataroomQuestion.findFirst({
          where: { id: questionId, dataroomId, teamId },
          select: QUESTIONS_SELECT,
        });
        if (!question) {
          return res.status(404).end("Question not found");
        }
        return res.status(200).json(question);
      }

      const questionsList = await prisma.dataroomQuestion.findMany({
        where: { dataroomId, teamId },
        select: QUESTIONS_SELECT,
        orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
      });
      return res.status(200).json(questionsList);
    }

    if (req.method === "POST") {
      // POST /api/teams/:teamId/datarooms/:id/questions
      if (!JANAVI_FEATURES.conversations) {
        return res.status(501).json({
          message: "Q&A is not enabled on this JANAVY deployment",
        });
      }

      const { content, documentId, assignedTo } = req.body as {
        content?: string;
        documentId?: string;
        assignedTo?: AssignmentTarget;
      };

      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Question content is required" });
      }
      if (content.length > 5000) {
        return res
          .status(400)
          .json({ message: "Question content is too long" });
      }
      if (assignedTo && !isAssignmentTarget(assignedTo)) {
        return res.status(400).json({
          message: "assignedTo must specify linkId, groupId, viewerId or email",
        });
      }

      // Optional document context must belong to the same room.
      if (documentId) {
        const document = await prisma.dataroomDocument.findFirst({
          where: { id: documentId, dataroomId },
          select: { id: true },
        });
        if (!document) {
          return res
            .status(404)
            .json({ message: "Document not found in this dataroom" });
        }
      }

      const question = await prisma.dataroomQuestion.create({
        data: {
          content: content.trim(),
          dataroomId,
          teamId,
          createdByUserId: userId,
          ...(documentId ? { dataroomDocumentId: documentId } : {}),
          ...(assignedTo
            ? { assignments: { create: assignmentCreate(assignedTo) } }
            : {}),
        },
        select: QUESTIONS_SELECT,
      });

      return res.status(201).json(question);
    }

    if (req.method === "PATCH") {
      // PATCH /api/teams/:teamId/datarooms/:id/questions/:questionId
      if (!JANAVI_FEATURES.conversations) {
        return res.status(501).json({
          message: "Q&A is not enabled on this JANAVY deployment",
        });
      }

      if (!questionId) {
        return res
          .status(400)
          .json({ message: "Question id is required for updates" });
      }

      const { status, assignedTo, category, priority } = req.body as {
        status?: string;
        assignedTo?: AssignmentTarget;
        category?: string;
        priority?: string;
      };

      const existing = await prisma.dataroomQuestion.findFirst({
        where: { id: questionId, dataroomId, teamId },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).end("Question not found");
      }

      if (
        status !== undefined &&
        !QUESTION_STATUSES.includes(status as QuestionStatus)
      ) {
        return res.status(400).json({
          message: `status must be one of ${QUESTION_STATUSES.join(", ")}`,
        });
      }
      if (assignedTo && !isAssignmentTarget(assignedTo)) {
        return res.status(400).json({
          message: "assignedTo must specify linkId, groupId, viewerId or email",
        });
      }

      // Assignment update: replace existing targets with the new one
      // (a question is assigned to exactly one target per type).
      if (assignedTo) {
        await prisma.dataroomQuestionAssignment.deleteMany({
          where: { questionId, ...assignmentWhere(assignedTo) },
        });
      }

      const question = await prisma.dataroomQuestion.update({
        where: { id: questionId },
        data: {
          ...(status ? { status } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(assignedTo
            ? { assignments: { create: assignmentCreate(assignedTo) } }
            : {}),
        },
        select: QUESTIONS_SELECT,
      });

      return res.status(200).json(question);
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    log({
      message: `Failed to handle dataroom questions for dataroom _${dataroomId}_. \n\n ${error} \n\n*Metadata*: \`{teamId: ${teamId}, userId: ${userId}}\``,
      type: "error",
    });
    return errorhandler(error, res);
  }
}
