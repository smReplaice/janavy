/**
 * Dataroom viewer layout vocabulary.
 *
 * The Brand / DataroomBrand models store layout preferences as plain string
 * columns (no DB enums), so this module is the single source of truth for the
 * allowed values, their Zod schemas (used by the branding API routes), safe
 * coercions for values coming out of the database, and the preset definitions
 * that power the Layouts tab in the branding settings.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Card layout (how documents/folders are listed in the dataroom main area)
// ---------------------------------------------------------------------------

export const DATAROOM_CARD_LAYOUTS = ["LIST", "COMPACT", "GRID"] as const;
export type DataroomCardLayout = (typeof DATAROOM_CARD_LAYOUTS)[number];
export const DataroomCardLayoutSchema = z.enum(DATAROOM_CARD_LAYOUTS);

export const DEFAULT_DATAROOM_CARD_LAYOUT: DataroomCardLayout = "LIST";

/** Radio options for the branding settings (LIST renders as "Cards", …). */
export const CARD_LAYOUT_OPTIONS: ReadonlyArray<{
  value: DataroomCardLayout;
  label: string;
}> = [
  { value: "LIST", label: "Cards" },
  { value: "COMPACT", label: "List" },
  { value: "GRID", label: "Grid" },
];

export function asDataroomCardLayout(
  value: string | null | undefined,
): DataroomCardLayout {
  return DataroomCardLayoutSchema.safeParse(value).success
    ? (value as DataroomCardLayout)
    : DEFAULT_DATAROOM_CARD_LAYOUT;
}

// ---------------------------------------------------------------------------
// Header style (how the dataroom nav / hero area renders)
// ---------------------------------------------------------------------------

export const DATAROOM_VIEWER_HEADER_STYLES = [
  "DEFAULT",
  "SPLIT",
  "NOTION",
] as const;
export type DataroomViewerHeaderStyle =
  (typeof DATAROOM_VIEWER_HEADER_STYLES)[number];
export const DataroomViewerHeaderStyleSchema = z.enum(
  DATAROOM_VIEWER_HEADER_STYLES,
);

export const DEFAULT_DATAROOM_VIEWER_HEADER_STYLE: DataroomViewerHeaderStyle =
  "DEFAULT";

export function asDataroomViewerHeaderStyle(
  value: string | null | undefined,
): DataroomViewerHeaderStyle {
  return DataroomViewerHeaderStyleSchema.safeParse(value).success
    ? (value as DataroomViewerHeaderStyle)
    : DEFAULT_DATAROOM_VIEWER_HEADER_STYLE;
}

// ---------------------------------------------------------------------------
// Layout presets (named combinations persisted on Brand.viewerLayoutPreset)
// ---------------------------------------------------------------------------

export const DATAROOM_VIEWER_LAYOUT_PRESETS = [
  "STANDARD",
  "STRICT",
  "MODERN",
  "NOTION",
  "CUSTOM",
] as const;
export type DataroomViewerLayoutPreset =
  (typeof DATAROOM_VIEWER_LAYOUT_PRESETS)[number];
export const DataroomViewerLayoutPresetSchema = z.enum(
  DATAROOM_VIEWER_LAYOUT_PRESETS,
);

export const DEFAULT_DATAROOM_VIEWER_LAYOUT_PRESET: DataroomViewerLayoutPreset =
  "STANDARD";

/** Selectable preset card ids (CUSTOM is only ever inferred, never picked). */
export type DataroomLayoutCardId = DataroomViewerLayoutPreset;

export type DataroomLayoutPresetDefinition = {
  id: Exclude<DataroomLayoutCardId, "CUSTOM">;
  name: string;
  description: string;
  cardLayout: DataroomCardLayout;
  showFolderTree: boolean;
  viewerHeaderStyle: DataroomViewerHeaderStyle;
  hideFolderIconsInMain: boolean;
};

export const DATAROOM_LAYOUT_PRESET_DEFINITIONS: readonly DataroomLayoutPresetDefinition[] =
  [
    {
      id: "STANDARD",
      name: "Standard",
      description: "Classic view with folder tree and card layout.",
      cardLayout: "LIST",
      showFolderTree: true,
      viewerHeaderStyle: "DEFAULT",
      hideFolderIconsInMain: false,
    },
    {
      id: "STRICT",
      name: "Strict",
      description: "Dense list, no tree, no icons — compliance first.",
      cardLayout: "COMPACT",
      showFolderTree: false,
      viewerHeaderStyle: "DEFAULT",
      hideFolderIconsInMain: true,
    },
    {
      id: "MODERN",
      name: "Modern",
      description: "Split header with hero banner and compact rows.",
      cardLayout: "COMPACT",
      showFolderTree: false,
      viewerHeaderStyle: "SPLIT",
      hideFolderIconsInMain: true,
    },
    {
      id: "NOTION",
      name: "Notion",
      description: "Cover image, grid cards, no navbar.",
      cardLayout: "GRID",
      showFolderTree: false,
      viewerHeaderStyle: "NOTION",
      hideFolderIconsInMain: false,
    },
  ];

export function asDataroomViewerLayoutPreset(
  value: string | null | undefined,
): DataroomViewerLayoutPreset {
  return DataroomViewerLayoutPresetSchema.safeParse(value).success
    ? (value as DataroomViewerLayoutPreset)
    : DEFAULT_DATAROOM_VIEWER_LAYOUT_PRESET;
}

/**
 * Map a concrete combination of layout fields back to the named preset it
 * matches, or "CUSTOM" when the fields were mixed manually.
 */
export function inferDataroomViewerLayoutPreset(input: {
  cardLayout?: string | null;
  showFolderTree?: boolean | null;
  hideFolderIconsInMain?: boolean | null;
  viewerHeaderStyle?: string | null;
}): DataroomViewerLayoutPreset {
  const cardLayout = asDataroomCardLayout(input.cardLayout);
  const showFolderTree = input.showFolderTree !== false;
  const hideFolderIconsInMain = input.hideFolderIconsInMain === true;
  const viewerHeaderStyle = asDataroomViewerHeaderStyle(input.viewerHeaderStyle);

  const match = DATAROOM_LAYOUT_PRESET_DEFINITIONS.find(
    (preset) =>
      preset.cardLayout === cardLayout &&
      preset.showFolderTree === showFolderTree &&
      preset.hideFolderIconsInMain === hideFolderIconsInMain &&
      preset.viewerHeaderStyle === viewerHeaderStyle,
  );

  return match?.id ?? "CUSTOM";
}

/**
 * Resolve the layout fields a preset stands for. Returns null for "CUSTOM"
 * (which has no fixed combination).
 */
export function getDataroomLayoutPresetFields(id: DataroomLayoutCardId): {
  cardLayout: DataroomCardLayout;
  showFolderTree: boolean;
  viewerHeaderStyle: DataroomViewerHeaderStyle;
  hideFolderIconsInMain: boolean;
} | null {
  const preset = DATAROOM_LAYOUT_PRESET_DEFINITIONS.find(
    (definition) => definition.id === id,
  );
  if (!preset) return null;
  return {
    cardLayout: preset.cardLayout,
    showFolderTree: preset.showFolderTree,
    viewerHeaderStyle: preset.viewerHeaderStyle,
    hideFolderIconsInMain: preset.hideFolderIconsInMain,
  };
}
