import prisma from "@/lib/prisma";

/**
 * Request List assignment resolution (JANAVI).
 *
 * Minimal P0 surface over the AGPL Task/TaskAssignment models
 * (prisma/schema/dataroom.prisma). It powers visitor-upload authorization:
 * an upload targeted at a request-list task is allowed when the task is an
 * UPLOAD task assigned to this viewer directly, via email, via one of the
 * viewer's groups, or via the link the viewer came through.
 *
 * Consumed by `pages/api/file/tus-viewer/[[...file]].ts` (and, later, the
 * viewer-facing request-list UI in Phase 2).
 */

/** Assignment target fields as selected from `TaskAssignment`. */
export type RequestListAssignmentRow = {
  viewerId?: string | null;
  email?: string | null;
  groupId?: string | null;
  linkId?: string | null;
};

/** Identity of the viewer an assignment is checked against. */
export type ViewerAssignmentTarget = {
  viewerId: string;
  email: string | null;
  linkId: string;
  /** Group ids the viewer belongs to (viewer.groups -> groupId). */
  groupIds: Set<string>;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Whether any of the task's assignments targets this viewer: a direct
 * viewer-id match, an email match (case-insensitive), a group the viewer
 * belongs to, or the link the viewer is using. Assignments with null target
 * fields never match.
 */
export function isViewerAssigned(
  assignments: readonly RequestListAssignmentRow[],
  target: ViewerAssignmentTarget,
): boolean {
  const viewerEmail = target.email ? normalizeEmail(target.email) : null;

  return assignments.some((assignment) => {
    if (assignment.viewerId && assignment.viewerId === target.viewerId) {
      return true;
    }
    if (
      assignment.email &&
      viewerEmail &&
      normalizeEmail(assignment.email) === viewerEmail
    ) {
      return true;
    }
    if (assignment.groupId && target.groupIds.has(assignment.groupId)) {
      return true;
    }
    if (assignment.linkId && assignment.linkId === target.linkId) {
      return true;
    }
    return false;
  });
}

/** An UPLOAD task assigned to the viewer, with its upload target folder. */
export type AssignedUploadTask = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  /** Folder visitor uploads for this task are forced into (null = root). */
  uploadFolderId: string | null;
  assignments: RequestListAssignmentRow[];
};

/**
 * Resolve which UPLOAD tasks of a data room are assigned to the viewer
 * identified by (linkId, viewerId/email/groups) and where their uploads
 * should land. Only tasks that can still accept an upload are returned.
 */
export async function getAssignedUploadTasks({
  dataroomId,
  linkId,
  viewerId,
  email,
  groupIds,
}: {
  dataroomId: string;
  linkId: string;
  viewerId: string;
  email?: string | null;
  groupIds?: Iterable<string>;
}): Promise<AssignedUploadTask[]> {
  const groupIdsSet = new Set(groupIds ?? []);
  const normalizedEmail = email ? normalizeEmail(email) : null;

  const tasks = await prisma.task.findMany({
    where: {
      dataroomId,
      type: "UPLOAD",
      status: { in: ["OPEN", "IN_PROGRESS"] },
      assignments: {
        some: {
          OR: [
            { viewerId },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            { linkId },
            ...(groupIdsSet.size > 0
              ? [{ groupId: { in: Array.from(groupIdsSet) } }]
              : []),
          ],
        },
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      uploadFolderId: true,
      assignments: {
        select: {
          viewerId: true,
          email: true,
          groupId: true,
          linkId: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  // Re-check with the same matcher the tus-viewer route uses so email
  // normalization cannot drift between query and authorization.
  return tasks.filter((task) =>
    isViewerAssigned(task.assignments, {
      viewerId,
      email: email ?? null,
      linkId,
      groupIds: groupIdsSet,
    }),
  );
}
