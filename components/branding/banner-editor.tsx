import React, { useState } from "react";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { classifyDataroomBanner } from "@/lib/branding/dataroom-banner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Banner upload/remove editor for the branding settings.
 *
 * The heavy lifting (file picker + drag & drop drop zone + live preview) is
 * owned by the page and passed in as `dropZone` so each surface can size and
 * preview it natively. This component contributes the framing: label, size
 * hint, default-banner handling and the "paste a URL" flow that accepts
 * image, video and YouTube banners.
 */
export function BannerEditor({
  banner,
  setBanner,
  setBannerBlobUrl,
  sizeHint,
  defaultBannerImage,
  onUrlApplied,
  dropZone,
}: {
  banner: string | null;
  setBanner: React.Dispatch<React.SetStateAction<string | null>>;
  setBannerBlobUrl: React.Dispatch<React.SetStateAction<string | null>>;
  /** Hint text describing constraints, e.g. "(max 5 MB, min. 1920×320)". */
  sizeHint?: string;
  /** Default banner asset offered when no custom banner is set. */
  defaultBannerImage?: string;
  /** Called after a banner URL was applied from the paste field. */
  onUrlApplied?: () => void;
  /** Page-owned upload drop zone (file input + preview). */
  dropZone?: React.ReactNode;
}) {
  const [bannerUrl, setBannerUrl] = useState("");

  const applyBannerUrl = () => {
    const value = bannerUrl.trim();
    if (!value) return;

    const classified = classifyDataroomBanner(value);
    if (classified.kind === "none") {
      toast.error("Enter an image, video or YouTube URL");
      return;
    }

    // URL banners are used as-is: no local blob preview to track.
    setBanner(classified.src);
    setBannerBlobUrl(null);
    setBannerUrl("");
    onUrlApplied?.();
  };

  return (
    <div className="space-y-3">
      <Label className="flex flex-wrap items-baseline gap-x-2">
        Banner
        {sizeHint ? (
          <span className="font-normal text-muted-foreground">{sizeHint}</span>
        ) : null}
      </Label>

      {dropZone}

      <div className="space-y-2">
        <Label
          htmlFor="banner-url"
          className="text-xs font-normal text-muted-foreground"
        >
          Or paste a banner URL (image, video or YouTube)
        </Label>
        <div className="flex gap-2">
          <Input
            id="banner-url"
            type="text"
            placeholder="https://example.com/banner.mp4"
            value={bannerUrl}
            onChange={(event) => setBannerUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyBannerUrl();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyBannerUrl}
            disabled={!bannerUrl.trim()}
            className="shrink-0"
          >
            <LinkIcon className="mr-1 h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      </div>

      {defaultBannerImage && banner !== defaultBannerImage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setBanner(defaultBannerImage);
            setBannerBlobUrl(null);
          }}
          className="text-xs"
        >
          Use default banner
        </Button>
      ) : null}
    </div>
  );
}
