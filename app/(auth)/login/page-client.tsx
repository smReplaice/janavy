"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useState } from "react";

import { signInWithPasskey } from "@teamhanko/passkeys-next-auth-provider/client";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { JANAVI_BRAND } from "@/lib/branding/janavy";
import { cn } from "@/lib/utils";

import { AuthCarousel } from "@/components/shared/auth-carousel";
import { LastUsed, useLastUsed } from "@/components/hooks/useLastUsed";
import Google from "@/components/shared/icons/google";
import LinkedIn from "@/components/shared/icons/linkedin";
import Passkey from "@/components/shared/icons/passkey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login({
  googleEnabled = false,
  linkedinEnabled = false,
  passkeyEnabled = false,
}: {
  googleEnabled?: boolean;
  linkedinEnabled?: boolean;
  passkeyEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? undefined;

  const [lastUsed, setLastUsed] = useLastUsed();
  const [clickedMethod, setClickedMethod] = useState<
    "email" | "google" | "linkedin" | "passkey" | undefined
  >(undefined);
  const [email, setEmail] = useState<string>("");
  const [emailButtonText, setEmailButtonText] = useState<string>(
    "Continue with Email",
  );

  const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: "Please enter a valid email." })
    .email({ message: "Please enter a valid email." });

  const emailValidation = emailSchema.safeParse(email);
  const hasSocialAuth = googleEnabled || linkedinEnabled || passkeyEnabled;

  return (
    <div className="flex min-h-screen w-full flex-wrap lg:h-screen lg:overflow-hidden">
      {/* Left — authentication */}
      <div className="flex w-full justify-center bg-white md:w-[55%] lg:w-[55%]">
        <div className="z-10 mx-5 flex h-fit w-full max-w-md flex-col py-10 sm:mx-0 lg:my-auto">
          <div className="flex flex-col space-y-4 px-4 pb-2 pt-10 sm:px-12 sm:pt-14">
          <Link href="/" className="mb-6 flex items-center gap-3">
            <img
              src="/images/branding/jv-symbol-transparent.png"
              alt="Janavy"
              className="h-10 w-auto"
            />
            <img
              src="/images/branding/janavy-wordmark-transparent.png"
              alt="Janavy"
              className="h-6 w-auto"
            />
          </Link>
            <h1
              className="text-balance text-3xl font-semibold tracking-tight"
              style={{ color: JANAVI_BRAND.colors.primary }}
            >
              Welcome to Janavy
            </h1>
            <p className="text-balance text-sm leading-relaxed text-gray-600">
              Securely share your most important information with complete
              control and visibility.
            </p>
          </div>
          <form
            className="flex flex-col gap-3 px-4 pt-6 sm:px-12"
            onSubmit={(e) => {
              e.preventDefault();
              if (!emailValidation.success) {
                toast.error(emailValidation.error.errors[0].message);
                return;
              }

              setClickedMethod("email");
              signIn("email", {
                email: emailValidation.data,
                redirect: false,
                ...(next && next.length > 0 ? { callbackUrl: next } : {}),
              }).then((res) => {
                if (res?.ok && !res?.error) {
                  setLastUsed("credentials");
                  // Store email in sessionStorage for the verification page
                  try {
                    sessionStorage.setItem(
                      "pendingVerificationEmail",
                      emailValidation.data,
                    );
                  } catch {
                    // sessionStorage not available, verification page will show email input
                  }
                  router.push("/auth/email");
                } else {
                  setEmailButtonText("Error sending email - try again?");
                  toast.error("Error sending email - try again?");
                  setClickedMethod(undefined);
                }
              });
            }}
          >
            <Label className="sr-only" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@company.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={clickedMethod === "email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                "flex h-11 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 ring-1 transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                email.length > 0 && !emailValidation.success
                  ? "ring-red-400 focus-visible:ring-red-500"
                  : "ring-gray-200 focus-visible:ring-[#123DFF]",
              )}
            />
            <div className="relative">
              <Button
                type="submit"
                loading={clickedMethod === "email"}
                disabled={!emailValidation.success || !!clickedMethod}
                className="h-11 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-100"
                style={{
                  backgroundColor: JANAVI_BRAND.colors.secondary,
                }}
              >
                {emailButtonText}
              </Button>
              {lastUsed === "credentials" && <LastUsed />}
            </div>
          </form>

          {hasSocialAuth && (
            <>
              <p className="py-4 text-center text-xs text-gray-400">or</p>
              <div className="flex flex-col space-y-2 px-4 sm:px-12">
                {googleEnabled && (
                  <div className="relative">
                    <Button
                      onClick={() => {
                        setClickedMethod("google");
                        setLastUsed("google");
                        signIn("google", {
                          ...(next && next.length > 0
                            ? { callbackUrl: next }
                            : {}),
                        }).then(() => {
                          setClickedMethod(undefined);
                        });
                      }}
                      loading={clickedMethod === "google"}
                      disabled={clickedMethod && clickedMethod !== "google"}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white font-normal text-gray-900 transition-colors hover:bg-gray-50"
                    >
                      <Google className="h-5 w-5" />
                      <span>Continue with Google</span>
                      {clickedMethod !== "google" && lastUsed === "google" && (
                        <LastUsed />
                      )}
                    </Button>
                  </div>
                )}
                {linkedinEnabled && (
                  <div className="relative">
                    <Button
                      onClick={() => {
                        setClickedMethod("linkedin");
                        setLastUsed("linkedin");
                        signIn("linkedin", {
                          ...(next && next.length > 0
                            ? { callbackUrl: next }
                            : {}),
                        }).then(() => {
                          setClickedMethod(undefined);
                        });
                      }}
                      loading={clickedMethod === "linkedin"}
                      disabled={
                        clickedMethod && clickedMethod !== "linkedin"
                      }
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white font-normal text-gray-900 transition-colors hover:bg-gray-50"
                    >
                      <LinkedIn />
                      <span>Continue with LinkedIn</span>
                      {clickedMethod !== "linkedin" && lastUsed === "linkedin" && (
                        <LastUsed />
                      )}
                    </Button>
                  </div>
                )}
                {passkeyEnabled && (
                  <div className="relative">
                    <Button
                      onClick={() => {
                        setLastUsed("passkey");
                        setClickedMethod("passkey");
                        signInWithPasskey({
                          tenantId: process.env
                            .NEXT_PUBLIC_HANKO_TENANT_ID as string,
                        }).then(() => {
                          setClickedMethod(undefined);
                        });
                      }}
                      variant="outline"
                      loading={clickedMethod === "passkey"}
                      disabled={
                        clickedMethod && clickedMethod !== "passkey"
                      }
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white font-normal text-gray-900 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Passkey className="h-4 w-4" />
                      <span>Continue with a passkey</span>
                      {lastUsed === "passkey" && <LastUsed />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          <p className="mt-10 w-full max-w-md px-4 pb-10 text-xs leading-relaxed text-gray-500 sm:px-12">
            By continuing, you agree to Janavy&apos;s{" "}
            <a
              href={JANAVI_BRAND.legal.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href={JANAVI_BRAND.legal.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>

      {/* Right — capability carousel */}
      <AuthCarousel />
    </div>
  );
}
