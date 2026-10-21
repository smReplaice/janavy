import SignatureCompletedEmail from "@/components/emails/signature-completed";
import SignatureConfirmationEmail from "@/components/emails/signature-confirmation";

import { sendEmail } from "@/lib/resend";

export const sendSignatureCompletedEmail = async ({
  ownerEmail,
  documentId,
  documentName,
  linkName,
  viewerEmail,
  signedAt,
  method,
}: {
  ownerEmail: string | null;
  documentId: string;
  documentName: string;
  linkName: string;
  viewerEmail: string;
  signedAt: Date;
  method: "DRAW" | "TYPE" | "UPLOAD";
}) => {
  if (!ownerEmail) {
    return { success: false, error: new Error("Document owner not found") };
  }

  try {
    const data = await sendEmail({
      to: ownerEmail,
      subject: `${viewerEmail} electronically signed: ${documentName}`,
      react: SignatureCompletedEmail({
        documentId,
        documentName,
        linkName,
        viewerEmail,
        signedAt,
        method,
      }),
      system: true,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
};

export const sendSignatureConfirmationEmail = async ({
  viewerEmail,
  documentName,
  ownerEmail,
  signedAt,
}: {
  viewerEmail: string;
  documentName: string;
  ownerEmail: string | null;
  signedAt: Date;
}) => {
  try {
    const data = await sendEmail({
      to: viewerEmail,
      subject: `Your electronic signature was recorded: ${documentName}`,
      react: SignatureConfirmationEmail({
        documentName,
        ownerEmail,
        signedAt,
      }),
      system: true,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
};
