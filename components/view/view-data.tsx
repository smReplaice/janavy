import dynamic from "next/dynamic";

import { useMemo } from "react";

import {
  Brand,
  DataroomBrand,
  Document,
  DocumentVersion,
} from "@prisma/client";
import { ExtendedRecordMap } from "notion-types";

import { useLazyPages } from "@/lib/hooks/use-lazy-pages";
import {
  SignatureField,
  SignatureMethodValue,
  ViewerSignatureConfig,
} from "@/lib/signing/signature-fields";
import {
  LinkWithDataroomDocument,
  LinkWithDocument,
  NotionTheme,
  WatermarkConfig,
} from "@/lib/types";
import { useMediaQuery } from "@/lib/utils/use-media-query";

import {
  ConversationSidebarLayout,
  ConversationSidebarProvider,
} from "@/components/conversations/viewer/conversation-sidebar-provider";
import { DEFAULT_DOCUMENT_VIEW_TYPE } from "@/components/view/document-view";
import { NotionPage } from "@/components/view/viewer/notion-page";
import PDFViewer from "@/components/view/viewer/pdf-default-viewer";

import { DEFAULT_DATAROOM_DOCUMENT_VIEW_TYPE } from "./dataroom/dataroom-document-view";
import LinkPreview from "./link-preview";
import { TNavData } from "./nav";
import SignatureFlow from "./signature/signature-flow";
import AdvancedExcelViewer from "./viewer/advanced-excel-viewer";
import DownloadOnlyViewer from "./viewer/download-only-viewer";
import HtmlViewer from "./viewer/html-viewer";
import ImageViewer from "./viewer/image-viewer";
import PagesHorizontalViewer from "./viewer/pages-horizontal-viewer";
import PagesVerticalViewer from "./viewer/pages-vertical-viewer";
import VideoViewer from "./viewer/video-viewer";

const ExcelViewer = dynamic(
  () => import("@/components/view/viewer/excel-viewer"),
  { ssr: false },
);

export type TViewDocumentData = Document & {
  versions: DocumentVersion[];
};

const EMPTY_PAGES: never[] = [];

const isDownloadAllowed = (
  canDownload: boolean | undefined,
  linkAllowDownload: boolean | undefined,
): boolean => {
  if (canDownload === false) return false;
  return !!linkAllowDownload;
};

export default function ViewData({
  viewData,
  link,
  document,
  notionData,
  brand,
  showPoweredByBanner,
  showAccountCreationSlide,
  useAdvancedExcelViewer,
  viewerEmail,
  dataroomId,
  canDownload,
  annotationsEnabled,
  textSelectionEnabled,
  previewToken,
}: {
  viewData: DEFAULT_DOCUMENT_VIEW_TYPE | DEFAULT_DATAROOM_DOCUMENT_VIEW_TYPE;
  link: LinkWithDocument | LinkWithDataroomDocument;
  document: TViewDocumentData;
  notionData?: {
    rootNotionPageId: string | null;
    recordMap: ExtendedRecordMap | null;
    theme: NotionTheme | null;
  };
  brand?: Partial<Brand> | Partial<DataroomBrand> | null;
  showPoweredByBanner?: boolean;
  showAccountCreationSlide?: boolean;
  useAdvancedExcelViewer?: boolean;
  viewerEmail?: string;
  dataroomId?: string;
  canDownload?: boolean;
  annotationsEnabled?: boolean;
  textSelectionEnabled?: boolean;
  previewToken?: string;
}) {
  const { isMobile } = useMediaQuery();

  const documentVersionId = document.versions[0]?.id;

  const { pages: lazyPages, ensurePagesLoaded } = useLazyPages({
    initialPages: viewData.pages ?? EMPTY_PAGES,
    viewId: viewData.viewId,
    previewToken: viewData.isPreview ? previewToken : undefined,
    linkId: viewData.isPreview ? link.id : undefined,
    documentVersionId: documentVersionId,
  });

  const viewerId = "viewerId" in viewData ? viewData.viewerId : undefined;
  const conversationsEnabled =
    !!dataroomId &&
    ("conversationsEnabled" in viewData
      ? viewData.conversationsEnabled
      : false);
  const allowDownload =
    document.downloadOnly ||
    isDownloadAllowed(canDownload, link.allowDownload ?? false);

  // Determine dataroom name if applicable
  const dataroomName =
    dataroomId && "dataroomName" in viewData
      ? viewData.dataroomName
      : undefined;

  // Native electronic signature: activate the signing layer only for a
  // page-image document on a signing link where this recipient hasn't signed.
  const rawSignature = "signature" in viewData ? viewData.signature : undefined;
  const signatureConfig: ViewerSignatureConfig | null = useMemo(() => {
    if (!rawSignature || !rawSignature.required || rawSignature.signed) {
      return null;
    }
    if (!link.requireSignature || viewData.isPreview || !viewData.viewId) {
      return null;
    }
    if (!viewData.pages) return null;
    return {
      required: true,
      signed: false,
      consentRequired: rawSignature.consentRequired,
      methods: (rawSignature.methods ?? []) as SignatureMethodValue[],
      fields: (rawSignature.fields ?? []) as SignatureField[],
    };
  }, [rawSignature, link.requireSignature, viewData.isPreview, viewData.viewId, viewData.pages]);
  const signatureFields = signatureConfig?.fields;

  const navData: TNavData = useMemo(
    () => ({
      viewId: viewData.viewId,
      isPreview: viewData.isPreview,
      linkId: link.id,
      brand: brand,
      viewerId,
      isMobile: isMobile,
      isDataroom: !!dataroomId,
      documentId: document.id,
      documentName: document.name,
      dataroomId: dataroomId,
      dataroomName: dataroomName,
      conversationsEnabled,
      allowDownload,
      isTeamMember: viewData.isTeamMember,
      annotationsFeatureEnabled: annotationsEnabled,
    }),
    [
      viewData.viewId,
      viewData.isPreview,
      viewData.isTeamMember,
      link.id,
      brand,
      viewerId,
      isMobile,
      dataroomId,
      document.id,
      document.name,
      dataroomName,
      conversationsEnabled,
      allowDownload,
      annotationsEnabled,
    ],
  );

  return (
    <SignatureFlowGate
      signatureConfig={signatureConfig}
      linkId={link.id}
      viewId={viewData.viewId}
      viewerEmail={viewerEmail}
    >
      <ConversationSidebarProvider conversationsEnabled={conversationsEnabled}>
        <ConversationSidebarLayout>
          {notionData?.recordMap ? (
          <NotionPage
            recordMap={notionData.recordMap}
            versionNumber={document.versions[0].versionNumber}
            theme={notionData.theme}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            textSelectionEnabled={textSelectionEnabled ?? false}
            navData={navData}
          />
        ) : viewData.fileType === "link" ? (
          <LinkPreview
            linkUrl={viewData.file || document.versions[0]?.file || ""}
            linkName={document.name}
            versionNumber={document.versions[0]?.versionNumber || 1}
            isEmbeddable={viewData.isEmbeddable ?? false}
            navData={navData}
          />
        ) : document.downloadOnly ? (
          <DownloadOnlyViewer
            versionNumber={document.versions[0].versionNumber}
            documentName={document.name}
            navData={navData}
          />
        ) : viewData.fileType === "html" && viewData.htmlContent ? (
          <HtmlViewer
            htmlContent={viewData.htmlContent}
            documentName={document.name}
            versionNumber={document.versions[0].versionNumber}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            navData={navData}
          />
        ) : viewData.fileType === "sheet" && viewData.sheetData ? (
          <ExcelViewer
            versionNumber={document.versions[0].versionNumber}
            sheetData={viewData.sheetData}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            navData={navData}
          />
        ) : viewData.fileType === "sheet" && useAdvancedExcelViewer ? (
          <AdvancedExcelViewer
            file={viewData.file!}
            versionNumber={document.versions[0].versionNumber}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            navData={navData}
          />
        ) : viewData.fileType === "image" ? (
          <ImageViewer
            file={viewData.file!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            versionNumber={document.versions[0].versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
          />
        ) : viewData.pages && !document.versions[0].isVertical ? (
          <PagesHorizontalViewer
            pages={lazyPages}
            feedbackEnabled={link.enableFeedback!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            versionNumber={document.versions[0].versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            showAccountCreationSlide={showAccountCreationSlide}
            enableQuestion={link.enableQuestion}
            feedback={link.feedback}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
            ensurePagesLoaded={ensurePagesLoaded}
            signatureFields={signatureFields}
          />
        ) : viewData.pages && document.versions[0].isVertical ? (
          <PagesVerticalViewer
            pages={lazyPages}
            feedbackEnabled={link.enableFeedback!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            versionNumber={document.versions[0].versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            enableQuestion={link.enableQuestion}
            feedback={link.feedback}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
            ensurePagesLoaded={ensurePagesLoaded}
            signatureFields={signatureFields}
          />
        ) : viewData.fileType === "video" ? (
          <VideoViewer
            file={viewData.file!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            confidentialViewEnabled={!!link.enableConfidentialView}
            versionNumber={document.versions[0].versionNumber}
            navData={navData}
          />
        ) : (
          <PDFViewer
            file={viewData.file}
            name={document.name}
            versionNumber={document.versions[0].versionNumber}
            navData={navData}
          />
        )}
        </ConversationSidebarLayout>
      </ConversationSidebarProvider>
    </SignatureFlowGate>
  );
}

/** Renders the signing flow around the viewer when a signature is required. */
function SignatureFlowGate({
  signatureConfig,
  linkId,
  viewId,
  viewerEmail,
  children,
}: {
  signatureConfig: ViewerSignatureConfig | null;
  linkId: string;
  viewId?: string;
  viewerEmail?: string;
  children: React.ReactNode;
}) {
  if (!signatureConfig) {
    return <>{children}</>;
  }
  return (
    <SignatureFlow
      config={signatureConfig}
      linkId={linkId}
      viewId={viewId}
      viewerEmail={viewerEmail}
    >
      {children}
    </SignatureFlow>
  );
}
