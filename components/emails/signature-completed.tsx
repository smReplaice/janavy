import React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

import { Footer } from "./shared/footer";

/** Owner notification: a recipient electronically signed a shared document. */
export default function SignatureCompleted({
  documentId = "",
  documentName = "Document",
  linkName = "Link",
  viewerEmail = "",
  signedAt,
  method = "TYPE",
}: {
  documentId: string;
  documentName: string;
  linkName: string;
  viewerEmail: string;
  signedAt?: Date;
  method?: string;
}) {
  const methodLabel =
    method === "DRAW" ? "drawn" : method === "UPLOAD" ? "uploaded" : "typed";
  return (
    <Html>
      <Head />
      <Preview>Your document has been electronically signed</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 w-[465px] p-5">
            <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
              <span className="font-bold tracking-tighter">JANAVY</span>
            </Text>
            <Text className="mx-0 my-7 p-0 text-center text-xl font-semibold text-black">
              Document Electronically Signed
            </Text>
            <Text className="text-sm leading-6 text-black">
              <span className="font-semibold">{viewerEmail}</span> electronically
              signed <span className="font-semibold">{documentName}</span>{" "}
              {signedAt
                ? `on ${signedAt.toLocaleDateString()} at ${signedAt.toLocaleTimeString()}`
                : ""}
              {" "}({methodLabel} signature) from the link{" "}
              <span className="font-semibold">{linkName}</span>.
            </Text>
            <Text className="text-sm leading-6 text-black">
              The signed PDF and a signature certificate with the verification
              evidence are available on JANAVY. The signer verified their email
              address with a one-time code before signing.
            </Text>
            <Section className="my-8 text-center">
              <Button
                className="rounded bg-black text-center text-xs font-semibold text-white no-underline"
                href={`${process.env.NEXT_PUBLIC_BASE_URL}/documents/${documentId}`}
                style={{ padding: "12px 20px" }}
              >
                View signatures
              </Button>
            </Section>
            <Footer
              footerText={
                <>
                  Electronic signatures show the signer&apos;s intent; they are
                  not certificate-based digital signatures.
                </>
              }
            />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
