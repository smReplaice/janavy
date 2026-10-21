import { GlobeIcon } from "lucide-react";

import { JANAVI_BRAND } from "@/lib/branding/janavy";

/**
 * Read-only Open Graph card preview: what a shared link looks like when
 * someone pastes it into a chat or social feed.
 */
export function BrandingSocialPreviewReadonly({
  title,
  description,
  image,
  favicon,
}: {
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
}) {
  const domain = JANAVI_BRAND.defaultAppUrl.replace(/^https?:\/\//, "");

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-950">
      <div className="flex aspect-[1.91/1] w-full items-center justify-center overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt="Link preview image"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            No preview image set
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {favicon ? (
            <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
          ) : (
            <GlobeIcon className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{domain}</span>
        </div>
        <p className="truncate text-sm font-medium text-foreground">
          {title || JANAVI_BRAND.name}
        </p>
        {description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
