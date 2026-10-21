import { JANAVI_FEATURES } from "@/config/features";

/**
 * Viewer-side Request List trigger button (JANAVY).
 *
 * Honest OFF state: renders nothing while `JANAVI_FEATURES.requestLists` is
 * false. When the feature ships, this button dispatches
 * `VIEWER_TOGGLE_REQUEST_LIST_EVENT` (lib/request-lists/events.ts) so the
 * dataroom nav opens the sheet it owns.
 */
export function RequestListButton({ className }: { className?: string }) {
  if (!JANAVI_FEATURES.requestLists) {
    return null;
  }

  // Unreachable while the flag is false.
  void className;

  // TODO(P2 request lists): toolbar button that dispatches
  // dispatchToggleRequestListEvent().
  return null;
}
