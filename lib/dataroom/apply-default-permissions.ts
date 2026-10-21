/**
 * Dataroom default-permission application.
 *
 * Reimplements the never-committed `lib/dataroom/apply-default-permissions`
 * module imported by four AGPL routes (apply-permissions, dataroom documents
 * create, add-to-dataroom, legacy webhooks service). Independent JANAVI
 * implementation composed from the AGPL primitives in
 * lib/dataroom/{permissions-sql,root-item-access}.ts and the Prisma models
 * in prisma/schema/dataroom.prisma.
 *
 * Semantics (per Dataroom.defaultPermissionStrategy fields):
 *  - INHERIT_FROM_PARENT: each document copies the nearest existing
 *    access-control row of an ancestor folder (nearest first, exact folder
 *    first); with no ancestor row it falls back to the room's root-item
 *    access (HIDDEN → no row at all, which is how "not visible" is
 *    represented for group-restricted links).
 *  - ASK_EVERY_TIME / HIDDEN_BY_DEFAULT: no rows are auto-created; access
 *    stays unset until an admin configures it explicitly.
 */
import cuid from "cuid";

import {
  DefaultPermissionStrategy,
  ItemType,
  Prisma,
  RootItemAccess,
} from "@prisma/client";

import prisma from "@/lib/prisma";
import {
  buildBulkUpsertPermissionsSql,
  type AccessControlTable,
  type PermissionUpsertRow,
} from "@/lib/dataroom/permissions-sql";
import { resolveRootItemAccessFlags } from "@/lib/dataroom/root-item-access";

type AttachedDocument = { id: string; folderId: string | null };

export type ApplyDataroomDocumentPermissionDefaultsArgs = {
  dataroomId: string;
  /** DataroomDocument rows ({id, folderId}) to seed defaults for. */
  dataroomDocuments: AttachedDocument[];
  groupStrategy: DefaultPermissionStrategy;
  groupRootItemAccess: RootItemAccess;
  linkStrategy: DefaultPermissionStrategy;
  linkRootItemAccess: RootItemAccess;
};

/**
 * For every viewer group and permission group in the dataroom, seed
 * access-control rows for the given documents according to the strategies.
 * Idempotent per (groupId, itemId) via upsert.
 */
export async function applyDataroomDocumentPermissionDefaults(
  args: ApplyDataroomDocumentPermissionDefaultsArgs,
): Promise<{ rowsWritten: number }> {
  const {
    dataroomId,
    dataroomDocuments,
    groupStrategy,
    groupRootItemAccess,
    linkStrategy,
    linkRootItemAccess,
  } = args;

  if (dataroomDocuments.length === 0) return { rowsWritten: 0 };

  // Folder rows for every referenced folderId + their in-room ancestors,
  // resolved through the materialized path (prefix match, nearest first).
  const folderIds = [
    ...new Set(
      dataroomDocuments
        .map((doc) => doc.folderId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const ancestorChains = new Map<string, string[]>(); // folderId -> [nearest, ..., root-most]
  if (folderIds.length > 0) {
    const folders = await prisma.dataroomFolder.findMany({
      where: { dataroomId, id: { in: folderIds } },
      select: { id: true, path: true },
    });
    const paths = folders.map((f) => f.path);
    if (paths.length > 0) {
      const allAncestors = await prisma.dataroomFolder.findMany({
        where: {
          dataroomId,
          path: { in: paths.flatMap((p) => ancestorPathsOf(p)) },
        },
        select: { id: true, path: true },
      });
      const byPath = new Map(allAncestors.map((f) => [f.path, f.id]));
      for (const folder of folders) {
        ancestorChains.set(
          folder.id,
          ancestorPathsOf(folder.path)
            .sort((a, b) => b.length - a.length) // nearest ancestor first
            .map((p) => byPath.get(p))
            .filter((id): id is string => Boolean(id)),
        );
      }
    }
  }

  const targets: Array<{
    table: AccessControlTable;
    strategy: DefaultPermissionStrategy;
    rootItemAccess: RootItemAccess;
  }> = [
    {
      table: "ViewerGroupAccessControls",
      strategy: groupStrategy,
      rootItemAccess: groupRootItemAccess,
    },
    {
      table: "PermissionGroupAccessControls",
      strategy: linkStrategy,
      rootItemAccess: linkRootItemAccess,
    },
  ];

  let rowsWritten = 0;

  for (const target of targets) {
    if (target.strategy !== DefaultPermissionStrategy.INHERIT_FROM_PARENT) {
      continue; // ASK_EVERY_TIME / HIDDEN_BY_DEFAULT: no automatic rows
    }

    const groupTableRef = Prisma.raw(
      target.table === "ViewerGroupAccessControls"
        ? '"ViewerGroup"'
        : '"PermissionGroup"',
    );
    const groupIds = await prisma.$queryRaw<string[]>(
      Prisma.sql`SELECT "id" FROM ${groupTableRef} WHERE "dataroomId" = ${dataroomId}`,
    );
    if (groupIds.length === 0) continue;

    const rootFlags = resolveRootItemAccessFlags(target.rootItemAccess);

    // Existing folder-level controls for inheritance lookup.
    const chainFolderIds = [...new Set([...ancestorChains.values()].flat())];
    const existing = chainFolderIds.length
      ? await prisma.$queryRaw<
          Array<{
            groupId: string;
            itemId: string;
            canView: boolean;
            canDownload: boolean;
          }>
        >(
          Prisma.sql`SELECT "groupId", "itemId", "canView", "canDownload"
            FROM ${Prisma.raw(`"${target.table}"`)}
            WHERE "groupId" IN (${Prisma.join(groupIds)})
              AND "itemType" = 'DATAROOM_FOLDER'`,
        )
      : [];
    const existingByKey = new Map(
      existing.map((row) => [`${row.groupId}:${row.itemId}`, row]),
    );

    for (const groupId of groupIds) {
      const rows: PermissionUpsertRow[] = [];
      for (const doc of dataroomDocuments) {
        const flags =
          (doc.folderId
            ? nearestFlags(ancestorChains.get(doc.folderId) ?? [], groupId, existingByKey)
            : null) ?? rootFlags;
        if (!flags) continue; // HIDDEN → no row
        rows.push({
          id: cuid(),
          itemId: doc.id,
          itemType: ItemType.DATAROOM_DOCUMENT,
          canView: flags.canView,
          canDownload: flags.canDownload,
        });
      }
      const sql = buildBulkUpsertPermissionsSql(target.table, groupId, rows);
      if (sql) {
        await prisma.$executeRaw(sql);
        rowsWritten += rows.length;
      }
    }
  }

  return { rowsWritten };
}

/**
 * Hook fired when documents are attached to a dataroom (upload, bulk add,
 * add-to-dataroom): reads the room's configured default strategies and
 * seeds defaults off the request path via the provided scheduler
 * (`waitUntil`), or awaits directly when no scheduler is given.
 */
export async function onDataroomDocumentsAttached({
  dataroomId,
  dataroomDocuments,
  schedule,
}: {
  dataroomId: string;
  dataroomDocuments: AttachedDocument[];
  schedule?: (promise: Promise<unknown>) => void;
}): Promise<void> {
  if (dataroomDocuments.length === 0) return;

  const run = (async () => {
    const dataroom = await prisma.dataroom.findUnique({
      where: { id: dataroomId },
      select: {
        defaultPermissionStrategy: true,
        defaultRootItemAccess: true,
        defaultGroupPermissionStrategy: true,
        defaultGroupRootItemAccess: true,
      },
    });
    if (!dataroom) return;

    await applyDataroomDocumentPermissionDefaults({
      dataroomId,
      dataroomDocuments,
      groupStrategy: dataroom.defaultGroupPermissionStrategy,
      groupRootItemAccess: dataroom.defaultGroupRootItemAccess,
      linkStrategy: dataroom.defaultPermissionStrategy,
      linkRootItemAccess: dataroom.defaultRootItemAccess,
    });
  })();

  if (schedule) {
    schedule(run.catch((error) => logAttachFailure(dataroomId, error)));
    return;
  }
  await run.catch((error) => logAttachFailure(dataroomId, error));
}

function logAttachFailure(dataroomId: string, error: unknown): void {
  console.error(
    `[apply-default-permissions] failed to seed defaults for dataroom ${dataroomId}`,
    error,
  );
}

/** Proper ancestor paths of a materialized folder path, excluding itself. */
function ancestorPathsOf(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const result: string[] = [];
  for (let i = segments.length - 1; i > 0; i--) {
    result.push("/" + segments.slice(0, i).join("/"));
  }
  return result;
}

function nearestFlags(
  chain: string[],
  groupId: string,
  existingByKey: Map<string, { canView: boolean; canDownload: boolean }>,
): { canView: boolean; canDownload: boolean } | null {
  for (const folderId of chain) {
    const row = existingByKey.get(`${groupId}:${folderId}`);
    if (row) return { canView: row.canView, canDownload: row.canDownload };
  }
  return null;
}
