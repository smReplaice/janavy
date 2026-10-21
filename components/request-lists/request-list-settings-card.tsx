import { JANAVI_FEATURES } from "@/config/features";

/**
 * Request List settings card (JANAVY).
 *
 * Honest OFF state: the full request-list workflow ships in Phase 2
 * (`JANAVI_FEATURES.requestLists`). Until then this mount renders nothing —
 * the settings page gates it with `useRequestListFeatureEnabled()` as well,
 * so the card stays hidden rather than showing dead UI.
 */
export function RequestListSettingsCard({
  dataroomId,
  teamId,
  requestListEnabled,
}: {
  dataroomId: string;
  teamId: string;
  requestListEnabled: boolean;
}) {
  if (!JANAVI_FEATURES.requestLists) {
    return null;
  }

  // Unreachable while the flag is false — kept explicit so the flag is the
  // single gate when the P2 workflow lands.
  void dataroomId;
  void teamId;
  void requestListEnabled;

  // TODO(P2 request lists): dataroom-level enable/disable card over the
  // Dataroom.requestListEnabled flag and the TaskList management API.
  return null;
}
