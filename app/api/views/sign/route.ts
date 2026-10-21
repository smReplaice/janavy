import { NextRequest, NextResponse } from "next/server";

import { SignatureMethod } from "@prisma/client";
import { ipAddress, waitUntil } from "@vercel/functions";
import { z } from "zod";

import { verifyLinkSession } from "@/lib/auth/link-session";
import {
  sendSignatureCompletedEmail,
  sendSignatureConfirmationEmail,
} from "@/lib/emails/send-signature-emails";
import prisma from "@/lib/prisma";
import { ratelimit } from "@/lib/redis";
import {
  signDocumentServerSide,
  validateFieldValues,
  NativeSignatureResult,
} from "@/lib/signing/native";
import {
  parseSignatureFieldConfiguration,
  SIGNATURE_CONSENT_COPY,
} from "@/lib/signing/signature-fields";
import { log } from "@/lib/utils";
import { LOCALHOST_IP } from "@/lib/utils/geo";

const bodySchema = z.object({
  linkId: z.string().min(1),
  viewId: z.string().cuid(),
  consent: z.literal(true),
  method: z.enum(["DRAW", "TYPE", "UPLOAD"]),
  fields: z
    .array(
      z.object({
        fieldId: z.string().min(1).max(64),
        value: z.string().max(200).optional(),
        dataUrl: z.string().max(3_000_000).optional(),
      }),
    )
    .max(100),
});

/** A PENDING record younger than this blocks a second attempt (idempotency). */
const PENDING_LOCK_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const consentMissing =
        raw != null && (raw as { consent?: unknown }).consent !== true;
      return NextResponse.json(
        {
          message: consentMissing
            ? "Your consent to sign electronically is required."
            : "Invalid signing request.",
        },
        { status: 400 },
      );
    }
    const { linkId, viewId, fields, method } = parsed.data;
    const requestIp = ipAddress(request) ?? LOCALHOST_IP;
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // Session-bound like the rest of the viewer APIs: a valid, fingerprint-
    // matched link session in the httpOnly cookie is required.
    const session = await verifyLinkSession(request, linkId);
    if (!session) {
      return NextResponse.json(
        { message: "Invalid or expired session. Please reopen the link." },
        { status: 401 },
      );
    }

    // Signing requires a verified identity — the existing emailAuthenticated
    // OTP machinery sets `verified` on the session.
    if (!session.verified) {
      return NextResponse.json(
        { message: "Email verification is required before signing." },
        { status: 403 },
      );
    }

    const { success: rateOk } = await ratelimit(10, "1 m").limit(
      `sign:${linkId}:${session.email}`,
    );
    if (!rateOk) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: {
        id: true,
        requireSignature: true,
        signatureFieldConfiguration: true,
        signatureConsentRequired: true,
        isArchived: true,
        deletedAt: true,
        expiresAt: true,
        emailAuthenticated: true,
        documentId: true,
        teamId: true,
        name: true,
        document: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: { select: { email: true } },
            versions: {
              where: { isPrimary: true },
              select: { id: true, versionNumber: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!link || link.isArchived || link.deletedAt) {
      return NextResponse.json(
        { message: "Link not found." },
        { status: 404 },
      );
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json(
        { message: "Link has expired." },
        { status: 404 },
      );
    }
    if (!link.requireSignature) {
      return NextResponse.json(
        { message: "This link does not require a signature." },
        { status: 400 },
      );
    }

    const configuration = parseSignatureFieldConfiguration(
      link.signatureFieldConfiguration,
    );
    if (!configuration || configuration.fields.length === 0) {
      return NextResponse.json(
        { message: "Signature fields are not configured for this link." },
        { status: 400 },
      );
    }
    if (!link.emailAuthenticated) {
      return NextResponse.json(
        {
          message:
            "Email verification is required for signing but not enabled on this link.",
        },
        { status: 400 },
      );
    }
    if (!configuration.methods.includes(method)) {
      return NextResponse.json(
        { message: "This signing method is not allowed for this link." },
        { status: 400 },
      );
    }

    const viewerEmail = session.email.toLowerCase();
    if (!link.documentId || !link.document || !link.teamId) {
      return NextResponse.json(
        { message: "Link not found." },
        { status: 404 },
      );
    }
    const primaryVersion = link.document.versions[0];
    if (!primaryVersion) {
      return NextResponse.json(
        { message: "Document version not found." },
        { status: 404 },
      );
    }

    // The view must belong to this link and this verified signer.
    const view = await prisma.view.findUnique({
      where: { id: viewId },
      select: { id: true, linkId: true, viewerEmail: true, viewerId: true },
    });
    if (
      !view ||
      view.linkId !== linkId ||
      !view.viewerEmail ||
      view.viewerEmail.toLowerCase() !== viewerEmail
    ) {
      return NextResponse.json(
        { message: "Unauthorized access." },
        { status: 403 },
      );
    }

    // Idempotency: one completed signature per (link, signer).
    const existing = await prisma.signatureRecord.findMany({
      where: { linkId, viewerEmail },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing.some((r) => r.status === "COMPLETED")) {
      return NextResponse.json(
        { message: "This document has already been signed by you." },
        { status: 409 },
      );
    }
    const activePending = existing.find(
      (r) =>
        r.status === "PENDING" &&
        Date.now() - r.createdAt.getTime() < PENDING_LOCK_MS,
    );
    if (activePending) {
      return NextResponse.json(
        { message: "A signing attempt is already in progress." },
        { status: 409 },
      );
    }
    // Stale PENDING rows older than the lock window are retryable — clean up.
    const staleIds = existing
      .filter(
        (r) =>
          r.status === "PENDING" &&
          Date.now() - r.createdAt.getTime() >= PENDING_LOCK_MS,
      )
      .map((r) => r.id);

    // Validate every required field carries a value.
    try {
      validateFieldValues(configuration, fields);
    } catch (error) {
      return NextResponse.json(
        { message: (error as Error).message },
        { status: 400 },
      );
    }

    const now = new Date();
    const auditCreated = { reason: "sign_request", method, ip: requestIp };

    const record = await prisma.$transaction(async (tx) => {
      if (staleIds.length > 0) {
        await tx.signatureRecord.deleteMany({
          where: { id: { in: staleIds } },
        });
      }
      const created = await tx.signatureRecord.create({
        data: {
          linkId,
          documentId: link.documentId!,
          documentVersionId: primaryVersion.id,
          viewId: view.id,
          viewerEmail,
          viewerId: view.viewerId ?? session.viewerId ?? null,
          method: method as SignatureMethod,
          status: "PENDING",
          consentAcceptedAt: link.signatureConsentRequired ? now : null,
          ipAddress: requestIp,
          userAgent,
        },
      });
      await tx.signatureAuditEvent.createMany({
        data: [
          {
            signatureRecordId: created.id,
            type: "CREATED",
            details: auditCreated,
          },
          {
            signatureRecordId: created.id,
            type: "OTP_VERIFIED",
            details: {
              verificationMethod: "Email OTP",
              verifiedEmail: viewerEmail,
            },
          },
          ...(link.signatureConsentRequired
            ? [
                {
                  signatureRecordId: created.id,
                  type: "CONSENT",
                  details: { text: SIGNATURE_CONSENT_COPY },
                },
              ]
            : []),
        ],
      });
      return created;
    });

    // Sign outside the DB transaction (network + CPU heavy).
    let result: NativeSignatureResult;
    try {
      result = await signDocumentServerSide({
        linkId,
        documentId: link.documentId!,
        documentVersionId: primaryVersion.id,
        teamId: link.teamId!,
        viewerEmail,
        method: method as SignatureMethod,
        configuration,
        fieldValues: fields,
      });

      await prisma.$transaction(async (tx) => {
        await tx.signatureRecord.update({
          where: { id: record.id },
          data: {
            status: "COMPLETED",
            signedAt: new Date(),
            signedFileKey: result.signedFileKey,
            signedFileHash: result.signedFileHash,
            originalFileHash: result.originalFileHash,
            fieldValues: result.fieldValues,
          },
        });
        await tx.signatureAuditEvent.create({
          data: {
            signatureRecordId: record.id,
            type: "SIGNED",
            details: {
              signedFileKey: result.signedFileKey,
              signedFileHash: result.signedFileHash,
              originalFileHash: result.originalFileHash,
              documentVersionId: primaryVersion.id,
              versionNumber: primaryVersion.versionNumber,
            },
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signing failed";
      await prisma.signatureRecord
        .update({
          where: { id: record.id },
          data: { status: "FAILED" },
        })
        .catch(() => {});
      await prisma.signatureAuditEvent
        .create({
          data: {
            signatureRecordId: record.id,
            type: "FAILED",
            details: { error: message.slice(0, 500) },
          },
        })
        .catch(() => {});
      log({
        message: `Native signing failed for link ${linkId}: ${message}`,
        type: "error",
      });
      return NextResponse.json(
        { message: "Signing failed. Please try again." },
        { status: 500 },
      );
    }

    // Owner notification + signer confirmation (best-effort, Beacon).
    const documentForEmail = link.document;
    waitUntil(
      (async () => {
        const signedAt = new Date();
        await sendSignatureCompletedEmail({
          ownerEmail: documentForEmail.owner?.email ?? null,
          documentId: link.documentId!,
          documentName: documentForEmail.name,
          linkName: link.name ?? `Link #${linkId.slice(-5)}`,
          viewerEmail,
          signedAt,
          method: method as SignatureMethod,
        });
        await sendSignatureConfirmationEmail({
          viewerEmail,
          documentName: documentForEmail.name,
          ownerEmail: documentForEmail.owner?.email ?? null,
          signedAt,
        });
      })().catch((error) => {
        console.error("Error sending signature emails:", error);
      }),
    );

    return NextResponse.json({
      message: "Document signed.",
      status: "COMPLETED",
      recordId: record.id,
      signedAt: new Date().toISOString(),
    });
  } catch (error) {
    log({
      message: `Failed to process signing request. \n\n ${error}`,
      type: "error",
    });
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
