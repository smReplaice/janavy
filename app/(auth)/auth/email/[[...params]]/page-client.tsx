"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { AuthCarousel } from "@/components/shared/auth-carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function EmailVerificationClient() {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    try {
      const pendingEmail = sessionStorage.getItem("pendingVerificationEmail");
      if (pendingEmail) {
        setEmail(pendingEmail);
        setEmailLocked(true);
        sessionStorage.removeItem("pendingVerificationEmail");
        setTimeout(() => {
          codeInputRef.current?.focus();
        }, 100);
      }
    } catch {
      // sessionStorage not available
    }
  }, []);

  // Code verification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (
          response.status === 410 ||
          response.status === 401 ||
          data.error?.includes("expired") ||
          data.error?.includes("Invalid code")
        ) {
          setIsExpired(true);
          setError("This code has expired or is invalid.");
        } else if (response.status === 429) {
          setError(
            data.error || "Too many attempts. Please wait before trying again.",
          );
        } else {
          setError(data.error || "Verification failed. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      // Redirect to the callback URL
      if (data.callbackUrl) {
        router.push(data.callbackUrl);
      } else {
        // No callback URL in response - stop loading and show error
        setIsLoading(false);
        setError(
          "Unable to complete sign-in: missing callback URL. Please try again.",
        );
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  // Resend: request a fresh code through the same NextAuth email signin
  // flow the login page uses, staying on this page.
  const handleResend = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    setError(null);
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();
      const res = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, csrfToken, type: "email" }),
      });
      if (res.ok) {
        toast.success("A new verification code is on its way.");
        setCode("");
        setIsExpired(false);
        codeInputRef.current?.focus();
      } else {
        setError("Could not resend the code. Please try again.");
      }
    } catch {
      setError("Could not resend the code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  if (isExpired) {
    return (
      <AuthLayout>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-gray-900">
          Code expired
        </h1>
        <p className="mt-2 text-balance text-sm leading-relaxed text-gray-600">
          This verification code has expired or has already been used.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button
            onClick={handleResend}
            loading={isResending}
            disabled={isResending || !email}
            className="h-11 w-full rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "#123DFF" }}
          >
            Resend Code
          </Button>
          <Link
            href="/login"
            className="text-center text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Back to Login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-gray-900">
        Verify your email
      </h1>
      <p className="mt-2 text-balance text-sm leading-relaxed text-gray-600">
        We&apos;ve sent a verification code to{" "}
        {emailLocked ? (
          <span className="font-medium text-gray-900">{email}</span>
        ) : (
          "your email"
        )}
        .
      </p>

      <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
        {!emailLocked && (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="name@company.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg ring-gray-200 focus-visible:ring-[#123DFF]"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            ref={codeInputRef}
            id="code"
            placeholder="Enter 10-character code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            disabled={isLoading}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={10}
            className="h-11 rounded-lg font-mono text-lg tracking-widest ring-gray-200 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus-visible:ring-[#123DFF]"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          loading={isLoading}
          disabled={isLoading || !email || code.length < 10}
          className="h-11 w-full rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "#123DFF" }}
        >
          Verify
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || !email}
          className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900 disabled:opacity-50"
        >
          {isResending ? "Sending…" : "Resend Code"}
        </button>
        <Link
          href="/login"
          className="text-gray-500 underline underline-offset-2 hover:text-gray-700"
        >
          Back to Login
        </Link>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-gray-500">
        By continuing, you agree to Janavy&apos;s{" "}
        <a
          href="https://janavy.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gray-700"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="https://janavy.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gray-700"
        >
          Privacy Policy
        </a>
        .
      </p>
    </AuthLayout>
  );
}

/**
 * Shared split layout for the verification screens: compact left column
 * (fits the desktop viewport without scrolling) + carousel right column.
 */
function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-wrap lg:h-screen lg:overflow-hidden">
      <div className="flex w-full justify-center bg-white md:w-[55%] lg:w-[55%]">
        <div className="z-10 mx-5 flex h-fit w-full max-w-md flex-col py-10 sm:py-14 lg:my-auto">
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
          {children}
        </div>
      </div>
      <AuthCarousel />
    </div>
  );
}
