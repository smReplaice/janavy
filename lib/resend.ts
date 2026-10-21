import { JSXElementConstructor, ReactElement } from "react";

import { render, toPlainText } from "react-email";
import { Resend } from "resend";

import { sendEmailViaBeacon } from "@/lib/emails/beacon";
import prisma from "@/lib/prisma";
import { log, nanoid } from "@/lib/utils";

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * JANAVI sender identities (env-driven, no hardcoded vendor addresses).
 *
 * Resolution per category: category-specific env var → JANAVI_EMAIL_FROM →
 * a default derived from the deployment base URL.
 */
function janaviEmailHost(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "localhost:3000";
  try {
    return new URL(baseUrl).hostname;
  } catch {
    // Accept bare hosts without a scheme ("localhost:3000", "janavi.example")
    // after stripping any protocol prefix or path.
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function defaultJanaviFromAddress(): string {
  return (
    process.env.JANAVI_EMAIL_FROM || `JANAVI <no-reply@${janaviEmailHost()}>`
  );
}

function resolveJanaviFromAddress({
  from,
  marketing,
  system,
  verify,
}: {
  from?: string;
  marketing?: boolean;
  system?: boolean;
  verify?: boolean;
}): string {
  if (from) {
    return from;
  }
  if (marketing && process.env.JANAVI_EMAIL_FROM_MARKETING) {
    return process.env.JANAVI_EMAIL_FROM_MARKETING;
  }
  if (system && process.env.JANAVI_EMAIL_FROM_SYSTEM) {
    return process.env.JANAVI_EMAIL_FROM_SYSTEM;
  }
  if (verify && process.env.JANAVI_EMAIL_FROM_VERIFY) {
    return process.env.JANAVI_EMAIL_FROM_VERIFY;
  }
  return defaultJanaviFromAddress();
}

function resolveJanaviReplyTo(replyTo?: string): string | undefined {
  return process.env.JANAVI_EMAIL_REPLY_TO || replyTo;
}

export const sendEmail = async ({
  to,
  subject,
  react,
  from,
  marketing,
  system,
  verify,
  test,
  cc,
  replyTo,
  scheduledAt,
  unsubscribeUrl,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
  from?: string;
  marketing?: boolean;
  system?: boolean;
  verify?: boolean;
  test?: boolean;
  cc?: string | string[];
  replyTo?: string;
  scheduledAt?: string;
  unsubscribeUrl?: string;
  idempotencyKey?: string;
}) => {
  // JANAVI: when BEACON_API_TOKEN is set, transactional email goes through
  // the Replaice Beacon HTTP API instead of Resend (same from-address
  // selection, same return shape). subscribe/unsubscribe (contacts
  // management) are not part of the Beacon scope and stay on Resend.
  const viaBeacon = Boolean(process.env.BEACON_API_TOKEN);

  if (!viaBeacon && !resend) {
    // Throw an error if resend is not initialized
    throw new Error("Resend not initialized");
  }

  const html = await render(react);
  const plainText = toPlainText(html);

  const fromAddress = resolveJanaviFromAddress({
    from,
    marketing,
    system,
    verify,
  });
  const replyToAddress = resolveJanaviReplyTo(replyTo);

  if (viaBeacon) {
    try {
      return await sendEmailViaBeacon({
        // QA/dev sink is OPT-IN: without JANAVY_EMAIL_SINK every recipient
        // gets the real email (the previous NODE_ENV-based redirect silently
        // swallowed all local OTP mail into resend's sink address).
        to: process.env.JANAVY_EMAIL_SINK || (test ? "delivered@resend.dev" : to),
        subject,
        html,
        text: plainText,
        from: fromAddress,
        cc,
        replyTo: replyToAddress,
        scheduledAt,
        headers: {
          // Reusing an idempotency key with a changed payload is rejected, so
          // the ref id has to come from the key rather than a fresh nanoid.
          "X-Entity-Ref-ID": idempotencyKey ?? nanoid(),
          ...(unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
        idempotencyKey,
      });
    } catch (exception) {
      // Log and rethrow any caught exceptions for upstream handling
      log({
        message: `Unexpected error when sending email via Beacon: ${exception}`,
        type: "error",
        mention: true,
      });
      throw exception;
    }
  }

  if (!resend) {
    // Throw an error if resend is not initialized (unchanged legacy path)
    throw new Error("Resend not initialized");
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: fromAddress,
        // QA/dev sink is OPT-IN: without JANAVY_EMAIL_SINK every recipient
        // gets the real email (the previous NODE_ENV-based redirect silently
        // swallowed all local OTP mail into resend's sink address).
        to: process.env.JANAVY_EMAIL_SINK || (test ? "delivered@resend.dev" : to),
        cc: cc,
        replyTo: replyToAddress,
        subject,
        react,
        scheduledAt,
        text: plainText,
        headers: {
          // Reusing an idempotency key with a changed payload is a 409, so the
          // ref id has to come from the key rather than a fresh nanoid.
          "X-Entity-Ref-ID": idempotencyKey ?? nanoid(),
          ...(unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
      },
      { idempotencyKey },
    );

    // Check if the email sending operation returned an error and throw it
    if (error) {
      log({
        message: `Resend returned error when sending email: ${error.name} \n\n ${error.message}`,
        type: "error",
        mention: true,
      });
      throw error;
    }

    // If there's no error, return the data
    return data;
  } catch (exception) {
    // Log and rethrow any caught exceptions for upstream handling
    log({
      message: `Unexpected error when sending email: ${exception}`,
      type: "error",
      mention: true,
    });
    throw exception; // Rethrow the caught exception
  }
};

export const subscribe = async (email: string): Promise<void> => {
  if (!resend) {
    console.error("RESEND_API_KEY is not set in the .env. Skipping.");
    return;
  }

  const { data, error } = await resend.contacts.create({
    email,
  });

  if (error || !data?.id) {
    console.error("Failed to create contact:", error);
    return;
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.RESEND_MARKETING_SEGMENT_ID
  ) {
    await resend.contacts.segments.add({
      contactId: data.id,
      segmentId: process.env.RESEND_MARKETING_SEGMENT_ID as string,
    });
  }
};

export const unsubscribe = async (email: string): Promise<void> => {
  if (!resend) {
    console.error("RESEND_API_KEY is not set in the .env. Skipping.");
    return;
  }

  if (!email) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true },
  });

  if (!user || !user.email) {
    return;
  }

  await resend.contacts.update({
    email: user.email,
    unsubscribed: true,
  });
};
