import { JANAVI_FEATURES } from "@/config/features";

/**
 * Request List management view (JANAVY).
 *
 * Honest OFF state: mounts at `pages/datarooms/[id]/tasks` render nothing
 * while `JANAVI_FEATURES.requestLists` is false. The full workflow (create
 * lists, request documents, track submissions) is Phase 2.
 */
export function RequestListView({ dataroomId }: { dataroomId: string }) {
  if (!JANAVI_FEATURES.requestLists) {
    return null;
  }

  // Unreachable while the flag is false.
  void dataroomId;

  // TODO(P2 request lists): list/board UI over TaskList/Task/TaskAssignment
  // with assignment and submission tracking.
  return null;
}
