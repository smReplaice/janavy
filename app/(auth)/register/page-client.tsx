"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useState } from "react";

import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { JANAVI_BRAND } from "@/lib/branding/janavy";
import { cn } from "@/lib/utils";

import { AuthCarousel } from "@/components/shared/auth-carousel";
import Google from "@/components/shared/icons/google";
import LinkedIn from "@/components/shared/icons/linkedin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register({
  googleEnabled = false,
  linkedinEnabled = false,
}: {
  googleEnabled?: boolean;
  linkedinEnabled?: boolean;
}) {
  const { next } = useParams as { next?: string };

  const [email, setEmail] = useState<string>("");

  const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: "Please enter a valid email." })
    .email({ message: "Please enter a valid email." });
  const emailValidation = emailSchema.safeParse(email);
  const hasSocialAuth = googleEnabled || linkedinEnabled;

  return (
    <div className="flex min-h-screen w-full flex-wrap lg:h-screen lg:overflow-hidden">
      {/* Left — signup */}
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
              Create your Janavy account
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
              signIn("email", {
                email: emailValidation.data,
                redirect: false,
                ...(next && next.length > 0 ? { callbackUrl: next } : {}),
              }).then((res) => {
                if (res?.ok && !res?.error) {
                  setEmail("");
                  toast.success("Email sent - check your inbox!");
                } else {
                  toast.error("Error sending email - try again?");
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                "flex h-11 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 ring-1 transition-all placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2",
                email.length > 0 && !emailValidation.success
                  ? "ring-red-400 focus-visible:ring-red-500"
                  : "ring-gray-200 focus-visible:ring-[#123DFF]",
              )}
            />
            <Button
              type="submit"
              disabled={!emailValidation.success}
              className="h-11 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors duration-200"
              style={{ backgroundColor: JANAVI_BRAND.colors.secondary }}
            >
              Continue with Email
            </Button>
          </form>

          {hasSocialAuth && (
            <>
              <p className="py-4 text-center text-xs text-gray-400">or</p>
              <div className="flex flex-col space-y-2 px-4 sm:px-12">
                {googleEnabled && (
                  <Button
                    onClick={() => {
                      signIn("google", {
                        ...(next && next.length > 0
                          ? { callbackUrl: next }
                          : {}),
                      });
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white font-normal text-gray-900 transition-colors hover:bg-gray-50"
                  >
                    <Google className="h-5 w-5" />
                    <span>Continue with Google</span>
                  </Button>
                )}
                {linkedinEnabled && (
                  <Button
                    onClick={() => {
                      signIn("linkedin", {
                        ...(next && next.length > 0
                          ? { callbackUrl: next }
                          : {}),
                      });
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white font-normal text-gray-900 transition-colors hover:bg-gray-50"
                  >
                    <LinkedIn />
                    <span>Continue with LinkedIn</span>
                  </Button>
                )}
              </div>
            </>
          )}

          <p className="mt-8 px-4 text-xs text-gray-600 sm:px-12">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium underline underline-offset-2"
              style={{ color: JANAVI_BRAND.colors.secondary }}
            >
              Log in
            </Link>
          </p>
          <p className="mt-6 w-full max-w-md px-4 pb-10 text-xs leading-relaxed text-gray-500 sm:px-12">
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
