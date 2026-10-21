import { JANAVI_FEATURES } from "@/config/features";

/**
 * Detect whether the current viewer has an assigned request list for the
 * dataroom they are visiting.
 *
 * Consumed by the dataroom viewer, the dataroom nav (sheet) and the dataroom
 * view (upload tracking). While `JANAVI_FEATURES.requestLists` is false this
 * returns a permanently disabled/empty state — no request is made — so every
 * mount (toggle button, sheet, upload tracking) hides cleanly.
 *
 * TODO(P2 request lists): when the feature ships, fetch the viewer's
 * assigned tasks (lib/request-lists/assignments.ts `getAssignedUploadTasks`
 * behind a session-verified viewer endpoint) via SWR and derive `enabled`.
 */
export function useViewerRequestList(_params?: {
  linkId?: string;
  dataroomId?: string;
  viewerId?: string;
  isPreview?: boolean;
}): {
  /** Whether a request list applies to this viewer. Always false for now. */
  enabled: boolean;
  /** Assigned tasks, once the feature ships. Empty for now. */
  tasks: [];
  /** Whether the detection request is loading. Never true while disabled. */
  isLoading: false;
} {
  // Single gate: the feature flag. The parameters only matter once the
  // feature ships, so they are accepted but unused today.
  const enabled: boolean = JANAVI_FEATURES.requestLists;

  return { enabled, tasks: [], isLoading: false };
}
