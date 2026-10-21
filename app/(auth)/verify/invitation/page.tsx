import { Metadata } from "next";
import Link from "next/link";

import NotFound from "@/pages/404";
import { format } from "date-fns";
import { ClockIcon, MailIcon } from "lucide-react";

import { JANAVI_BRAND } from "@/lib/branding/janavy";
import prisma from "@/lib/prisma";
import { verifyJWT } from "@/lib/utils/generate-jwt";

import AcceptInvitationButton from "./AcceptInvitationButton";
import InvitationStatusContent from "./InvitationStatusContent";
import CleanUrlOnExpire from "./status/ClientRedirect";

const data = {
  description: "Accept your team invitation on JANAVY",
  title: "Accept Invitation | JANAVY",
  url: "/verify/invitation",
};

export const metadata: Metadata = {
  metadataBase: new URL(JANAVI_BRAND.defaultAppUrl),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "JANAVY",
    images: [
      {
        url: "/_static/meta-image.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    images: ["/_static/meta-image.png"],
  },
};

export default async function VerifyInvitationPage({
  searchParams,
}: {
  searchParams: {
    token?: string;
  };
}) {
  const { token: jwtToken } = searchParams;

  if (!jwtToken) {
    return <NotFound />;
  }

  // verify JWT token
  const payload = verifyJWT(jwtToken);

  if (!payload) {
    return <NotFound />;
  }

  const { verification_url, teamId, token, email, expiresAt } = payload;

  // Validate required parameters
  if (!verification_url || !teamId || !token || !email) {
    return <NotFound />;
  }
  const isExpired = expiresAt ? new Date() > new Date(expiresAt) : false;
  let isRevoked = false;
  if (!isExpired) {
    try {
      const invitation = await prisma.invitation.findUnique({
        where: {
          token: token,
        },
      });
      isRevoked = !invitation;
    } catch (error) {
      console.error("Error checking invitation status:", error);
    }
  }
  return (
    <>
      <CleanUrlOnExpire shouldClean={isExpired || isRevoked} />
      <div className="flex h-screen w-full flex-wrap">
        {/* Left part */}
        <div className="flex h-full w-full items-center justify-center bg-white md:w-1/2 lg:w-2/5">
          <div
            className="absolute inset-x-0 top-10 -z-10 flex transform-gpu justify-center overflow-hidden blur-3xl"
            aria-hidden="true"
          ></div>
          <div className="z-10 mx-auto h-fit w-full max-w-md overflow-hidden rounded-lg">
            <div className="flex flex-col items-center justify-center space-y-3 px-4 py-6 pt-8 text-center sm:px-16">
              <Link href="/">
                <span className="text-balance text-2xl font-semibold text-gray-800">
                  Welcome to JANAVY
                </span>
              </Link>
              {!isExpired && !isRevoked && (
                <>
                  <h3 className="text-balance py-1 text-sm font-normal text-gray-800">
                    You&apos;ve been invited to join a team on JANAVY
                  </h3>
                  <div className="mt-2 flex w-auto items-center justify-center gap-2 rounded-full bg-gray-50 px-5 py-2.5 text-sm text-gray-600 shadow-sm">
                    <MailIcon className="h-4 w-4 text-gray-400" />
                    {email}
                  </div>
                </>
              )}
            </div>

            {isRevoked || isExpired ? (
              <div className="px-4 py-6 sm:px-16">
                <InvitationStatusContent status={"expired"} />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 px-4 pt-8 sm:px-16">
                  <div className="relative">
                    <AcceptInvitationButton
                      verificationUrl={verification_url}
                    />
                  </div>
                  {expiresAt ? (
                    <div className="text-center text-sm text-gray-500">
                      <p className="flex items-center justify-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-amber-700">
                        <ClockIcon className="h-4 w-4 text-amber-500" />
                        <span>
                          Expires on{" "}
                          <span className="font-medium">
                            {format(new Date(expiresAt), "MMM d, yyyy")}
                          </span>{" "}
                          at{" "}
                          <span className="font-medium">
                            {format(new Date(expiresAt), "h:mm a")}
                          </span>
                        </span>
                      </p>
                    </div>
                  ) : null}
                </div>
                <p className="mt-10 w-full max-w-md px-4 text-xs text-muted-foreground sm:px-16">
                  By accepting this invitation, you acknowledge that you have
                  read and agree to Janavy&apos;s{" "}
                  <a
                    href="https://janavy.com/terms"
                    target="_blank"
                    className="underline hover:text-gray-900"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://janavy.com/privacy"
                    target="_blank"
                    className="underline hover:text-gray-900"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        </div>
        {/* Right part — Janavy positioning (no third-party testimonials) */}
        <div
          className="hidden h-full w-full justify-center md:flex md:w-1/2 lg:w-3/5"
          style={{ backgroundColor: "#050A22" }}
        >
          <div className="flex w-full max-w-lg flex-col justify-center px-10 py-16">
            <img
              src="/images/branding/janavy-wordmark-transparent.png"
              alt="Janavy"
              className="mb-8 h-6 w-auto brightness-0 invert"
            />
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Share with Confidence.
              <br />
              Stay in Control.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#8FA3D8]">
              Janavy helps you securely share sensitive documents with advanced
              protection, real-time tracking and complete control over your
              information.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-[#B5C3E8]">
              <li>· Secure document sharing and data rooms</li>
              <li>· Restrict downloads, copying and printing</li>
              <li>· Track every view with document analytics</li>
              <li>· Revoke access anytime, even after sharing</li>
            </ul>
            <p className="mt-10 border-t border-white/10 pt-5 text-xs tracking-wide text-[#5B6C99]">
              Share with Confidence. Stay in Control.
            </p>
          </div>
        </div>
      </div>
</>
  );
}
