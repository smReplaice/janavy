/**
 * Request List viewer events (JANAVI).
 *
 * The viewer toolbar's Request List trigger button dispatches a DOM event so
 * the sheet state stays owned by the dataroom nav without prop-drilling —
 * the same pattern as `VIEWER_TOGGLE_CONVERSATIONS_EVENT` in
 * components/view/dataroom/dataroom-trailing-actions.tsx.
 *
 * Analytics/emit helpers below are typed, no-op-safe stubs: the full
 * request-list workflow ships in Phase 2, so until then they only log.
 */

/** Dispatched by the toolbar button to toggle the viewer request-list sheet. */
export const VIEWER_TOGGLE_REQUEST_LIST_EVENT = "viewer-request-list-toggle";

export type RequestListEventName =
  | "request_list_sheet_opened"
  | "request_list_sheet_closed"
  | "request_list_button_clicked"
  | "request_list_upload_started";

/**
 * Emit a request-list analytics event. Phase 2 wires this to the analytics
 * pipeline; for now it logs to the console (safe in browser and server,
 * never throws).
 */
export function trackRequestListEvent(
  name: RequestListEventName,
  payload?: Record<string, unknown>,
): void {
  try {
    console.log(
      `[request-list] ${name}`,
      payload ? JSON.stringify(payload) : "",
    );
  } catch {
    // Never let analytics break the feature.
  }
}

/** Dispatch the toggle event on behalf of the viewer toolbar button. */
export function dispatchToggleRequestListEvent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(VIEWER_TOGGLE_REQUEST_LIST_EVENT));
  trackRequestListEvent("request_list_button_clicked");
}
