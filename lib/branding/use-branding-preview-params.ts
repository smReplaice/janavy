/**
 * Branding preview iframe parameters.
 *
 * The branding settings pages render live previews in iframes
 * (/nav_ppreview_demo, /room_ppreview_demo, /entrance_ppreview_demo). The
 * iframe URL is seeded with the current values as query params, and
 * `BrandingPreviewChrome` then streams subsequent edits over postMessage so
 * the iframe never has to reload (which would flash).
 */

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { JANAVI_BRAND } from "@/lib/branding/janavy";

/** postMessage type shared with `components/branding/branding-preview-chrome`. */
export const BRANDING_PREVIEW_MESSAGE_TYPE = "janavi:branding-preview-params";

export type BrandingPreviewParams = {
  brandColor: string;
  accentColor: string;
  brandLogo: string;
  brandBanner: string;
  hideLogo: string;
  applyAccentColorToDataroomView: string;
  accentButtonColor: string;
  ctaLabel: string;
  ctaUrl: string;
  welcomeMessage: string;
  cardLayout: string;
  showFolderTree: string;
  viewerHeaderStyle: string;
  hideFolderIconsInMain: string;
};

export const BRANDING_PREVIEW_PARAM_KEYS = Object.keys({
  brandColor: "",
  accentColor: "",
  brandLogo: "",
  brandBanner: "",
  hideLogo: "",
  applyAccentColorToDataroomView: "",
  accentButtonColor: "",
  ctaLabel: "",
  ctaUrl: "",
  welcomeMessage: "",
  cardLayout: "",
  showFolderTree: "",
  viewerHeaderStyle: "",
  hideFolderIconsInMain: "",
}) as ReadonlyArray<keyof BrandingPreviewParams>;

const DEFAULT_PARAMS: BrandingPreviewParams = {
  brandColor: JANAVI_BRAND.colors.primary,
  accentColor: JANAVI_BRAND.colors.background,
  brandLogo: "",
  brandBanner: "",
  hideLogo: "0",
  applyAccentColorToDataroomView: "0",
  accentButtonColor: JANAVI_BRAND.colors.primary,
  ctaLabel: "",
  ctaUrl: "",
  welcomeMessage: "",
  cardLayout: "LIST",
  showFolderTree: "1",
  viewerHeaderStyle: "DEFAULT",
  hideFolderIconsInMain: "0",
};

function normalizeQueryValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return null;
}

/**
 * Reads the branding preview params: seeded from the URL query on first
 * paint, then live-updated via postMessage from the embedding editor.
 */
export function useBrandingPreviewParams(): BrandingPreviewParams {
  const router = useRouter();
  const [liveParams, setLiveParams] = useState<Partial<
    BrandingPreviewParams
  > | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as
        | { type?: unknown; params?: Record<string, unknown> }
        | null;
      if (!data || typeof data !== "object") return;
      if (data.type !== BRANDING_PREVIEW_MESSAGE_TYPE) return;
      if (!data.params || typeof data.params !== "object") return;

      const next: Partial<BrandingPreviewParams> = {};
      for (const key of BRANDING_PREVIEW_PARAM_KEYS) {
        const value = data.params[key];
        if (typeof value === "string") {
          next[key] = value;
        }
      }
      setLiveParams(next);
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return useMemo(() => {
    const params = { ...DEFAULT_PARAMS };

    // URL query seeds the first paint (before any postMessage arrives).
    for (const key of BRANDING_PREVIEW_PARAM_KEYS) {
      const fromQuery = normalizeQueryValue(router.query[key]);
      if (fromQuery !== null) {
        params[key] = fromQuery;
      }
    }

    // Live postMessage edits win over the seeded query values.
    if (liveParams) {
      Object.assign(params, liveParams);
    }

    return params;
  }, [router.query, liveParams]);
}
