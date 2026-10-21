import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";

import { TeamProvider } from "@/context/team-context";
import { UploadProgressProvider } from "@/context/upload-progress-context";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/pages";

import { JANAVI_BRAND } from "@/lib/branding/janavy";
import { EXCLUDED_PATHS } from "@/lib/constants";
import { useTrackLastVisited } from "@/lib/hooks/use-last-visited";

import { PostHogGroupSync } from "@/components/providers/posthog-group-sync";
import { PostHogCustomProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

const siteDescription =
  "JANAVY is secure document sharing infrastructure with DRM controls, virtual data rooms and real-time analytics. Share with Confidence. Stay in Control.";

function LastVisitedTracker() {
  useTrackLastVisited();
  return null;
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
  router,
}: AppProps<{ session: Session }>) {
  return (
    <>
      <Head>
        <title>JANAVY</title>
        <meta name="theme-color" content="#111827" key="theme-color" />
        <meta name="description" content={siteDescription} key="description" />
        <meta property="og:title" content="JANAVY" key="og-title" />
        <meta
          property="og:description"
          content={siteDescription}
          key="og-description"
        />
        <meta
          property="og:image"
          content={`${JANAVI_BRAND.defaultAppUrl}/_static/meta-image.png`}
          key="og-image"
        />
        <meta
          property="og:url"
          content={JANAVI_BRAND.defaultAppUrl}
          key="og-url"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="JANAVY" key="tw-title" />
        <meta
          name="twitter:description"
          content={siteDescription}
          key="tw-description"
        />
        <meta
          name="twitter:image"
          content={`${JANAVI_BRAND.defaultAppUrl}/_static/meta-image.png`}
          key="tw-image"
        />
        <link rel="icon" href="/images/branding/janavy-favicon.svg" key="favicon" />
      </Head>
      <SessionProvider session={session}>
        <PostHogCustomProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <NuqsAdapter>
              <main className={inter.className}>
                <Toaster closeButton />
                <TooltipProvider delayDuration={100}>
                  {EXCLUDED_PATHS.includes(router.pathname) ? (
                    <Component {...pageProps} />
                  ) : (
                    <TeamProvider>
                      <PostHogGroupSync />
                      <LastVisitedTracker />
                      <UploadProgressProvider>
                        <Component {...pageProps} />
                      </UploadProgressProvider>
                    </TeamProvider>
                  )}
                </TooltipProvider>
              </main>
            </NuqsAdapter>
          </ThemeProvider>
        </PostHogCustomProvider>
      </SessionProvider>
    </>
  );
}
