/**
 * Static demo dataset for the dataroom branding preview iframe
 * (`/room_ppreview_demo`). The preview always renders the same "Example Data
 * Room" so the Layouts tab can show how folders/documents look under each
 * preset without depending on a real team's contents.
 */

import { DataroomFolder } from "@prisma/client";

/** Matches the `DocumentVersion` shape the preview cards consume. */
export type DataroomPreviewDocumentVersion = {
  id: string;
  type: string;
  versionNumber: number;
  hasPages: boolean;
  isVertical: boolean;
  updatedAt: Date;
  fileSize?: number | bigint | null;
};

export type DataroomPreviewDocument = {
  id: string;
  dataroomDocumentId: string;
  name: string;
  /** Preview docs locate their folder by name; the demo has no real ids. */
  folderName: string | null;
  downloadOnly: boolean;
  canDownload: boolean;
  orderIndex: number | null;
  hierarchicalIndex: string | null;
  versions: DataroomPreviewDocumentVersion[];
};

export type DataroomPreviewDataset = {
  folders: DataroomFolder[];
  documents: DataroomPreviewDocument[];
};

const DEMO_DATAROOM_ID = "preview-dataroom";

function folder(args: {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  orderIndex: number;
  hierarchicalIndex?: string | null;
}): DataroomFolder {
  const now = new Date();
  return {
    id: args.id,
    name: args.name,
    path: args.path,
    parentId: args.parentId,
    icon: args.icon,
    color: args.color,
    dataroomId: DEMO_DATAROOM_ID,
    orderIndex: args.orderIndex,
    hierarchicalIndex: args.hierarchicalIndex ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function documentVersion(args: {
  id: string;
  type: string;
  fileSize: number;
}): DataroomPreviewDocumentVersion {
  return {
    id: args.id,
    type: args.type,
    versionNumber: 1,
    hasPages: true,
    isVertical: false,
    updatedAt: new Date(),
    fileSize: args.fileSize,
  };
}

/**
 * Build the demo dataset fresh on each call so components can treat the
 * Date objects as stable-per-render without cross-render mutation.
 */
export function getDataroomPreviewDataset(): DataroomPreviewDataset {
  return {
    folders: [
      folder({
        id: "preview-folder-company",
        name: "Company Documents",
        path: "/Company Documents",
        parentId: null,
        icon: "briefcase",
        color: "blue",
        orderIndex: 0,
        hierarchicalIndex: "1",
      }),
      folder({
        id: "preview-folder-financials",
        name: "Financials",
        path: "/Financials",
        parentId: null,
        icon: "layers",
        color: "green",
        orderIndex: 1,
        hierarchicalIndex: "2",
      }),
      folder({
        id: "preview-folder-legal",
        name: "Legal",
        path: "/Legal",
        parentId: null,
        icon: "shield",
        color: "gray",
        orderIndex: 2,
        hierarchicalIndex: "3",
      }),
      folder({
        id: "preview-folder-governance",
        name: "Governance",
        path: "/Company Documents/Governance",
        parentId: "preview-folder-company",
        icon: "folder",
        color: "gray",
        orderIndex: 0,
        hierarchicalIndex: "1.1",
      }),
    ],
    documents: [
      {
        id: "preview-doc-pitch",
        dataroomDocumentId: "preview-dataroom-doc-pitch",
        name: "Pitch Deck.pdf",
        folderName: null,
        downloadOnly: false,
        canDownload: true,
        orderIndex: 0,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-pitch",
            type: "pdf",
            fileSize: 2_411_724,
          }),
        ],
      },
      {
        id: "preview-doc-model",
        dataroomDocumentId: "preview-dataroom-doc-model",
        name: "Financial Model.xlsx",
        folderName: "Financials",
        downloadOnly: false,
        canDownload: true,
        orderIndex: 1,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-model",
            type: "sheet",
            fileSize: 184_320,
          }),
        ],
      },
      {
        id: "preview-doc-q3",
        dataroomDocumentId: "preview-dataroom-doc-q3",
        name: "Q3 Report.pdf",
        folderName: "Financials",
        downloadOnly: false,
        canDownload: true,
        orderIndex: 2,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-q3",
            type: "pdf",
            fileSize: 987_136,
          }),
        ],
      },
      {
        id: "preview-doc-handbook",
        dataroomDocumentId: "preview-dataroom-doc-handbook",
        name: "Employee Handbook.pdf",
        folderName: "Company Documents",
        downloadOnly: false,
        canDownload: true,
        orderIndex: 3,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-handbook",
            type: "pdf",
            fileSize: 1_468_004,
          }),
        ],
      },
      {
        id: "preview-doc-mgt",
        dataroomDocumentId: "preview-dataroom-doc-mgt",
        name: "Management Presentation.pdf",
        folderName: "Governance",
        downloadOnly: false,
        canDownload: true,
        orderIndex: 4,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-mgt",
            type: "pdf",
            fileSize: 3_244_028,
          }),
        ],
      },
      {
        id: "preview-doc-msa",
        dataroomDocumentId: "preview-dataroom-doc-msa",
        name: "MSA Template.pdf",
        folderName: "Legal",
        downloadOnly: false,
        canDownload: false,
        orderIndex: 5,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-msa",
            type: "pdf",
            fileSize: 322_560,
          }),
        ],
      },
      {
        id: "preview-doc-cap-table",
        dataroomDocumentId: "preview-dataroom-doc-cap-table",
        name: "Cap Table.xlsx",
        folderName: "Legal",
        downloadOnly: false,
        canDownload: false,
        orderIndex: 6,
        hierarchicalIndex: null,
        versions: [
          documentVersion({
            id: "preview-version-cap-table",
            type: "sheet",
            fileSize: 96_256,
          }),
        ],
      },
    ],
  };
}
