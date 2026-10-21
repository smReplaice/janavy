import { useCallback, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const MAX_ASSET_SIZE_MB = 2;

type AssetSlotProps = {
  id: string;
  label: string;
  hint: string;
  value: string | null;
  onChange: (value: string | null) => void;
  previewClassName?: string;
};

/** Image/favicon asset slot: upload → data URL preview → remove. */
function AssetSlot({
  id,
  label,
  hint,
  value,
  onChange,
  previewClassName,
}: AssetSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.size / 1024 / 1024 > MAX_ASSET_SIZE_MB) {
        setError(`File size too big (max ${MAX_ASSET_SIZE_MB}MB)`);
        return;
      }
      if (file.type !== "image/png" && file.type !== "image/jpeg") {
        setError("File type not supported (.png or .jpg only)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        onChange(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50 transition-all hover:border-gray-400 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900",
            previewClassName,
          )}
        >
          {value ? (
            <img
              src={value}
              alt={`${label} preview`}
              className="max-h-full max-w-full object-contain p-1"
            />
          ) : (
            <UploadIcon
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          )}
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted-foreground">{hint}</p>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              className="w-fit text-xs"
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) readFile(file);
          event.target.value = "";
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * Custom Link Preview (Open Graph) override form shared by the team branding
 * page and the per-dataroom branding page. Values are edited in place;
 * uploads stay data URLs until the page's save handler persists them.
 */
export function BrandingLinkPreviewForm({
  enabled,
  onEnabledChange,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  imageUrl,
  onImageChange,
  faviconUrl,
  onFaviconChange,
  inheritanceHint,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  imageUrl: string | null;
  onImageChange: (value: string | null) => void;
  faviconUrl: string | null;
  onFaviconChange: (value: string | null) => void;
  /** Where empty fields fall back to (differs team vs dataroom). */
  inheritanceHint?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="link-preview-enabled">Custom Link Preview</Label>
        <Switch
          id="link-preview-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Customize the title, description and image shown when this link is
        shared on social media or chat apps.
      </p>

      {enabled && (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="link-preview-title">Title</Label>
            <Input
              id="link-preview-title"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Shared via JANAVY"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-preview-description">Description</Label>
            <Input
              id="link-preview-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Share with confidence. Stay in control."
            />
          </div>
          <AssetSlot
            id="link-preview-image"
            label="Preview image"
            hint={`Social card image (max ${MAX_ASSET_SIZE_MB} MB, .png or .jpg). Recommended 1200×630.`}
            value={imageUrl}
            onChange={onImageChange}
          />
          <AssetSlot
            id="link-preview-favicon"
            label="Favicon"
            hint={`Icon shown next to the link (max ${MAX_ASSET_SIZE_MB} MB, .png or .jpg).`}
            value={faviconUrl}
            onChange={onFaviconChange}
            previewClassName="w-16"
          />
          {inheritanceHint ? (
            <p className="text-xs text-muted-foreground">{inheritanceHint}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
