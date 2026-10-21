import { Brand } from "@prisma/client";
import { CheckIcon, PlusIcon, StarIcon, TrashIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Sentinel selectedBrandId for a brand being created that has not been
 * persisted yet (the settings form edits it locally until "Save changes").
 */
export const DRAFT_TEAM_BRAND_ID = "__draft_team_brand__";

const DRAFT_TEAM_BRAND_LABEL = "New brand (unsaved)";

/**
 * Next free brand name: "Brand 1", "Brand 2", … skipping names already used
 * by the team's brands (names are unique per team).
 */
export function nextTeamBrandName(brands: Brand[]): string {
  const taken = new Set(brands.map((brand) => brand.name));
  let counter = brands.length + 1;
  while (taken.has(`Brand ${counter}`)) {
    counter += 1;
  }
  return `Brand ${counter}`;
}

/**
 * Multi-brand switcher for the team branding page: pick an existing brand,
 * rename it inline, create a new one, promote one to default, or delete the
 * current selection. All persistence is delegated to the page's callbacks.
 */
export function TeamBrandSwitcher({
  brands,
  selectedBrandId,
  defaultBrandId,
  brandName,
  onBrandNameChange,
  onSelect,
  onCreate,
  onSetDefault,
  onDelete,
  disabled = false,
}: {
  brands: Brand[];
  /** Brand id, or DRAFT_TEAM_BRAND_ID while editing an unsaved brand. */
  selectedBrandId: string | null;
  defaultBrandId: string | null;
  brandName: string;
  onBrandNameChange: (name: string) => void;
  onSelect: (brandId: string | null) => void;
  onCreate: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const isDraft = selectedBrandId === DRAFT_TEAM_BRAND_ID;
  const effectiveSelectedId = selectedBrandId ?? defaultBrandId ?? "";
  const isSelectedDefault =
    !isDraft && Boolean(effectiveSelectedId) && effectiveSelectedId === defaultBrandId;
  const canDelete = !disabled && (isDraft || Boolean(effectiveSelectedId));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select
        value={isDraft ? DRAFT_TEAM_BRAND_ID : effectiveSelectedId || undefined}
        onValueChange={(value) => {
          onSelect(value === DRAFT_TEAM_BRAND_ID ? null : value);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-56 [&>span]:min-w-0 [&>span]:truncate">
          <SelectValue placeholder="Select brand" />
        </SelectTrigger>
        <SelectContent align="start">
          {isDraft && (
            <>
              <SelectItem value={DRAFT_TEAM_BRAND_ID}>
                {DRAFT_TEAM_BRAND_LABEL}
              </SelectItem>
              <SelectSeparator />
            </>
          )}
          <SelectGroup>
            <SelectLabel className="text-xs font-normal text-muted-foreground">
              Team brands
            </SelectLabel>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{brand.name}</span>
                  {brand.id === defaultBrandId && (
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground">
                      <CheckIcon className="h-3 w-3" aria-hidden="true" />
                      Default
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
            {brands.length === 0 && !isDraft && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No brands yet — create one to start.
              </div>
            )}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Input
        aria-label="Brand name"
        value={brandName}
        onChange={(event) => onBrandNameChange(event.target.value)}
        placeholder="Brand name"
        disabled={disabled}
        className="w-44"
        maxLength={80}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreate}
          disabled={disabled}
        >
          <PlusIcon className="mr-1 h-3.5 w-3.5" />
          New brand
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSetDefault}
          disabled={disabled || isDraft || isSelectedDefault || !effectiveSelectedId}
          title={
            isSelectedDefault
              ? "This brand is already the team default"
              : "Make this brand the team default"
          }
        >
          <StarIcon
            className={cn(
              "mr-1 h-3.5 w-3.5",
              isSelectedDefault && "fill-amber-400 text-amber-400",
            )}
          />
          Set as default
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={!canDelete}
          title={
            isDraft ? "Discard the unsaved brand" : "Delete the selected brand"
          }
        >
          <TrashIcon className="mr-1 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
