import { useCallback, useEffect, useRef } from "react";
import { LockIcon } from "lucide-react";

import { BRANDING_PREVIEW_MESSAGE_TYPE } from "@/lib/branding/use-branding-preview-params";

/**
 * Wraps a branding preview iframe with browser-chrome styling (traffic
 * lights + address bar) and keeps the iframe live: the initial params are
 * encoded in the iframe URL, and every subsequent change is streamed over
 * postMessage so the preview updates without a reload flash.
 */
export function BrandingPreviewChrome({
  name,
  basePath,
  urlLabel,
  params,
  className,
}: {
  /** iframe name / a11y label, e.g. "dataroom-view". */
  name: string;
  /** Demo page the iframe renders, e.g. "/room_ppreview_demo". */
  basePath: string;
  /** Fake URL shown in the chrome address bar. */
  urlLabel: string;
  /** Current preview values (strings; boolean-ish values are "1"/"0"). */
  params: Record<string, string>;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The src is seeded once from the first params — later edits travel via
  // postMessage, so keep the initial value stable across re-renders.
  const initialSrcRef = useRef<string | null>(null);
  if (initialSrcRef.current === null) {
    const query = new URLSearchParams(params).toString();
    initialSrcRef.current = query ? `${basePath}?${query}` : basePath;
  }
  const initialSrc = initialSrcRef.current;

  const postParams = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: BRANDING_PREVIEW_MESSAGE_TYPE, params },
      "*",
    );
  }, [params]);

  // Stream param changes (blob:/data: previews have opaque or cross origins,
  // so the target origin has to be "*").
  useEffect(() => {
    postParams();
  }, [postParams]);

  return (
    <div className="flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-950">
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/70 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-1">
          <LockIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground">
            {urlLabel}
          </span>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        name={name}
        title={`${name} branding preview`}
        src={initialSrc}
        onLoad={postParams}
        className={className ?? "h-full w-full flex-1 border-0"}
      />
    </div>
  );
}
