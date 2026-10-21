import React from "react";

import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

import { Footer } from "./shared/footer";

/** Signer confirmation: your electronic signature was recorded. */
export default function SignatureConfirmation({
  documentName = "Document",
  ownerEmail = "",
  signedAt,
}: {
  documentName: string;
  ownerEmail: string | null;
  signedAt?: Date;
}) {
  return (
    <Html>
      <Head />
      <Preview>Your electronic signature was recorded</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 w-[465px] p-5">
            <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
              <span className="font-bold tracking-tighter">JANAVY</span>
            </Text>
            <Text className="mx-0 my-7 p-0 text-center text-xl font-semibold text-black">
              Signature Complete
            </Text>
            <Text className="text-sm leading-6 text-black">
              You electronically signed{" "}
              <span className="font-semibold">{documentName}</span>
              {signedAt
                ? ` on ${signedAt.toLocaleDateString()} at ${signedAt.toLocaleTimeString()}`
                : ""}
              . Your email address was verified with a one-time code before you
              signed.
              {ownerEmail ? (
                <>
                  {" "}
                  The document owner ({ownerEmail}) has been notified and
                  received the signed copy.
                </>
              ) : (
                " The document owner has been notified and received the signed copy."
              )}
            </Text>
            <Text className="text-sm leading-6 text-black">
              Keep this email as your confirmation. This is an electronic
              signature record, not a certificate-based digital signature.
            </Text>
            <Section className="my-8 text-center text-xs text-gray-500">
              Questions about this document? Reply to this email.
            </Section>
            <Footer
              footerText={
                <>
                  If you did not sign this document, contact the document owner
                  immediately.
                </>
              }
            />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
