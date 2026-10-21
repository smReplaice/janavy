import { AgreementStatus } from "@/lib/documents/agreement";
import prisma from "@/lib/prisma";

/**
 * Fire-and-forget agreement sharing-status transition.
 *
 * These are *sharing* lifecycle markers (VIEWED / EXPIRED / REVOKED), NOT
 * signature statuses. Best-effort by design: the function never throws, so a
 * status transition can never block or fail the enclosing view/download/link
 * request. Call it inside `waitUntil` where the caller already has it, or
 * await it in routes without response streaming.
 *
 * @param from when given, the transition only applies while the document's
 *             current status is one of these values (avoids regressing e.g.
 *             REVOKED back to VIEWED on late view events).
 */
export async function markAgreementStatus(
  documentId: string,
  status: AgreementStatus,
  opts: { from?: AgreementStatus[] } = {},
): Promise<void> {
  try {
    await prisma.document.updateMany({
      where: {
        id: documentId,
        agreementType: { not: null },
        ...(opts.from && opts.from.length > 0
          ? { agreementStatus: { in: opts.from } }
          : {}),
      },
      data: { agreementStatus: status },
    });
  } catch (error) {
    console.error(
      `[agreements] failed to set agreementStatus=${status} for document ${documentId}:`,
      error,
    );
  }
}
