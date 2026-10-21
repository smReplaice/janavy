import { JANAVI_FEATURES } from "@/config/features";

/**
 * Viewer-side Request List sheet (JANAVY).
 *
 * Honest OFF state: renders nothing while `JANAVI_FEATURES.requestLists` is
 * false (the nav only mounts it when a request list is detected, which the
 * disabled `useViewerRequestList` never reports). Phase 2 fills in the
 * assigned-requests sheet with upload targets per task.
 */
export function RequestListSheet({
  linkId,
  dataroomId,
  viewId,
  viewerId,
  isOpen,
  onOpenChange,
}: {
  linkId: string;
  dataroomId: string;
  viewId: string;
  viewerId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!JANAVI_FEATURES.requestLists) {
    return null;
  }

  // Unreachable while the flag is false.
  void linkId;
  void dataroomId;
  void viewId;
  void viewerId;
  void isOpen;
  void onOpenChange;

  // TODO(P2 request lists): sheet listing the viewer's assigned UPLOAD
  // tasks (lib/request-lists/assignments.ts) with per-task upload targets.
  return null;
}
