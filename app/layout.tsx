import { Metadata } from "next";
import { Inter } from "next/font/google";

import { JANAVI_BRAND } from "@/lib/branding/janavy";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

const data = {
  description:
    "JANAVY is secure document sharing infrastructure with DRM controls, virtual data rooms and real-time analytics. Share with Confidence. Stay in Control.",
  title: "JANAVY — Share with Confidence. Stay in Control.",
  url: "/",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
