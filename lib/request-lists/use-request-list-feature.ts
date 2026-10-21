import { JANAVI_FEATURES } from "@/config/features";

/**
 * Whether the request-list feature (task lists, requests, submissions) is
 * enabled on this JANAVI deployment. Read by the dataroom sidebar, the
 * mobile more-menu and the dataroom settings page so their mounts hide
 * cleanly while the feature is off.
 *
 * TODO(P2 request lists): flip `JANAVI_FEATURES.requestLists` and ship the
 * workflow (create list, request docs, submissions, review/approve,
 * notifications) over the AGPL TaskList/Task/TaskAssignment/TaskActivity
 * models.
 */
export function useRequestListFeatureEnabled(): boolean {
  return JANAVI_FEATURES.requestLists;
}
