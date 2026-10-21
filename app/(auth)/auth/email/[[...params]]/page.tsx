import { Metadata } from "next";

import { JANAVI_BRAND } from "@/lib/branding/janavy";

import EmailVerificationClient from "./page-client";

const data = {
  description: "Verify your login to JANAVY",
  title: "Verify Login | JANAVY",
  url: "/auth/email",
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

export default async function EmailVerificationPage() {
  return <EmailVerificationClient />;
}
