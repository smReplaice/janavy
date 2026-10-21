import BlockedAccessAttemptEmail from "@/components/emails/blocked-access-attempt";

import { sendEmail } from "@/lib/resend";

interface SendBlockedAccessAttemptEmailParams {
  to: string;
  cc?: string[];
  blockedEmail: string;
  linkName: string;
  resourceName: string;
  resourceType: "document" | "dataroom";
  timestamp: string;
  accessType: "global" | "allow" | "deny";
}

export const sendBlockedAccessAttemptEmail = async (
  params: SendBlockedAccessAttemptEmailParams,
) => {
  const { to, cc, ...templateProps } = params;
  try {
    await sendEmail({
      to,
      cc: cc && cc.length > 0 ? cc : undefined,
      subject: `Blocked access attempt on ${templateProps.resourceName}`,
      react: BlockedAccessAttemptEmail(templateProps),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    console.error("Failed to send blocked access attempt email:", error);
  }
};
