import { cn } from "@/lib/utils";
import {
  type DataroomLayoutCardId,
  type DataroomViewerLayoutPreset,
  DATAROOM_LAYOUT_PRESET_DEFINITIONS,
} from "@/lib/branding/dataroom-viewer-layout";

/** Tiny wireframe hint of each preset's structure, drawn per card. */
function PresetWireframe({
  cardLayout,
  showFolderTree,
  viewerHeaderStyle,
}: {
  cardLayout: "LIST" | "COMPACT" | "GRID";
  showFolderTree: boolean;
  viewerHeaderStyle: "DEFAULT" | "SPLIT" | "NOTION";
}) {
  return (
    <div className="flex h-16 w-full flex-col gap-1 overflow-hidden rounded-md border bg-white p-1 dark:bg-neutral-900">
      {viewerHeaderStyle === "NOTION" ? (
        <div className="h-3 w-full rounded-sm bg-neutral-200 dark:bg-neutral-700" />
      ) : viewerHeaderStyle === "SPLIT" ? (
        <div className="flex items-center gap-1">
          <div className="h-2.5 flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-2.5 w-8 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
        </div>
      ) : (
        <div className="h-2 w-14 rounded-sm bg-neutral-800 dark:bg-neutral-300" />
      )}
      <div className="flex min-h-0 flex-1 gap-1">
        {showFolderTree && (
          <div className="flex w-1/4 flex-col gap-1">
            <div className="h-1.5 flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-1.5 flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
          </div>
        )}
        <div
          className={cn(
            "flex min-w-0 flex-1 gap-1",
            cardLayout === "GRID" ? "flex-row" : "flex-col",
          )}
        >
          {cardLayout === "GRID" ? (
            <>
              <div className="h-full flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-full flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
            </>
          ) : (
            <>
              <div
                className={cn(
                  "flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-700",
                  cardLayout === "COMPACT" ? "h-1.5" : "flex-1",
                )}
              />
              <div
                className={cn(
                  "rounded-sm bg-neutral-200 dark:bg-neutral-700",
                  cardLayout === "COMPACT" ? "h-1.5 flex-1" : "h-2 w-2/3",
                )}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Radio-card picker for the dataroom viewer layout presets. `selectedPreset`
 * may be "CUSTOM" (mixed combination) — no card is highlighted then.
 */
export function DataroomLayoutPresetCards({
  selectedPreset,
  onSelect,
}: {
  selectedPreset: DataroomViewerLayoutPreset;
  onSelect: (id: DataroomLayoutCardId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Data room layout preset"
      className="grid grid-cols-2 gap-2"
    >
      {DATAROOM_LAYOUT_PRESET_DEFINITIONS.map((preset) => {
        const isSelected = selectedPreset === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(preset.id)}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              isSelected
                ? "border-black bg-gray-50 dark:border-white dark:bg-neutral-900"
                : "border-gray-200 hover:border-gray-400 dark:border-neutral-800 dark:hover:border-neutral-600",
            )}
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {preset.name}
              </span>
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full border",
                  isSelected
                    ? "border-black bg-black dark:border-white dark:bg-white"
                    : "border-gray-300 dark:border-neutral-600",
                )}
              />
            </span>
            <PresetWireframe
              cardLayout={preset.cardLayout}
              showFolderTree={preset.showFolderTree}
              viewerHeaderStyle={preset.viewerHeaderStyle}
            />
            <span className="text-xs text-muted-foreground">
              {preset.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
