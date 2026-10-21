import { Metadata } from "next";

import { JANAVI_BRAND } from "@/lib/branding/janavy";

import { GTMComponent } from "@/components/gtm-component";

import LoginClient from "./page-client";

const data = {
  description: "Login to Janavy — the secure agreement cloud.",
  title: "Login | Janavy",
  url: "/login",
};

export const metadata: Metadata = {
  metadataBase: new URL(JANAVI_BRAND.defaultAppUrl),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "Janavy",
    images: [
      {
        url: "/images/branding/janavy-wordmark-transparent.png",
        width: 519,
        height: 69,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    images: ["/images/branding/janavy-wordmark-transparent.png"],
  },
};

export default function LoginPage() {
  return (
    <>
      <GTMComponent />
      {/* Only offer auth methods that are actually configured on this deployment */}
      <LoginClient
        googleEnabled={!!process.env.GOOGLE_CLIENT_ID}
        linkedinEnabled={!!process.env.LINKEDIN_CLIENT_ID}
        passkeyEnabled={!!process.env.NEXT_PUBLIC_HANKO_TENANT_ID}
      />
    </>
  );
}
