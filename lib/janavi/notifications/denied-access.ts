import type { Link } from "@prisma/client";

import { sendBlockedAccessAttemptEmail } from "@/lib/emails/send-blocked-access-attempt";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import prisma from "@/lib/prisma";

/**
 * JANAVI denied-access reporting.
 *
 * Import-compatible replacement for the commercial
 * `ee/features/access-notifications` helper. When a viewer is denied access
 * to a document or data room link (blocked email domain, allow/deny list),
 * this resolves the affected resource, dispatches a BLOCKED_ACCESS
 * notification through the AGPL preference-aware notification pipeline, and
 * emails the interested recipients.
 */
export async function reportDeniedAccessAttempt(
  link: Partial<Link>,
  email: string,
  accessType: "global" | "allow" | "deny" = "global",
): Promise<void> {
  if (!link || !link.teamId) return;

  let resourceType: "dataroom" | "document" = "dataroom";
  let resourceName = "Dataroom";
  let documentOwnerId: string | null = null;

  if (link.documentId) {
    resourceType = "document";
    const document = await prisma.document.findUnique({
      where: { id: link.documentId },
      select: { name: true, ownerId: true },
    });
    resourceName = document?.name || "Document";
    documentOwnerId = document?.ownerId || null;
  } else if (link.dataroomId) {
    const dataroom = await prisma.dataroom.findUnique({
      where: { id: link.dataroomId },
      select: { name: true },
    });
    resourceName = dataroom?.name || "Dataroom";
  }

  const linkName = link.name || `Link #${link.id?.slice(-5)}`;
  const timestamp = new Date().toLocaleString();

  const recipients = await dispatchNotification({
    teamId: link.teamId,
    notificationType: "BLOCKED_ACCESS",
    linkOwnerId: link.ownerId,
    documentOwnerId,
  });

  if (recipients.length > 0) {
    const [to, ...cc] = recipients.map((r) => r.email);
    await sendBlockedAccessAttemptEmail({
      to,
      cc: cc.length > 0 ? cc : undefined,
      blockedEmail: email,
      linkName,
      resourceName,
      resourceType,
      timestamp,
      accessType,
    });
  }
}
