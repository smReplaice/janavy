"use client";

/**
 * JANAVY dataroom link sheet.
 *
 * The commercial permission-scoped dataroom sheet is out of scope; JANAVY
 * dataroom links are created through the standard AGPL LinkSheet, which
 * already supports DATAROOM_LINK (viewer groups, upload folders, file
 * permissions payload). Extra props historically accepted by the commercial
 * sheet (e.g. `initialView`) are absorbed for compatibility.
 */
import LinkSheet, { DEFAULT_LINK_TYPE } from "@/components/links/link-sheet";
import { Dispatch, SetStateAction } from "react";

import { LinkType } from "@prisma/client";

/** Per-item file permissions attached to dataroom link payloads. */
export type ItemPermission = Record<
  string,
  {
    canView: boolean;
    canDownload: boolean;
    canDownloadOriginal?: boolean;
  }
>;

type DataroomLinkSheetProps = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  linkType: LinkType;
  currentLink?: DEFAULT_LINK_TYPE;
  existingLinks?: Parameters<typeof LinkSheet>[0]["existingLinks"];
  linkTargetId?: string;
  onLinkCreatedNavigate?: (targetId: string) => void;
  /** Deprecated: absorbed, not used by the standard sheet. */
  initialView?: string;
  [key: string]: unknown;
};

export function DataroomLinkSheet({
  initialView: _initialView,
  ...props
}: DataroomLinkSheetProps) {
  return <LinkSheet {...(props as Parameters<typeof LinkSheet>[0])} />;
}
