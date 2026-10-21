import type { Team } from "@prisma/client";

/**
 * JANAVI team paused-state.
 *
 * Replaces the commercial subscription-pause check
 * (`ee/features/billing/cancellation/lib/is-team-paused`) with an
 * import-compatible surface. JANAVI has no subscriptions, so a team can
 * never be paused: both helpers always resolve to `false`. The `Team`
 * parameter type is kept so call sites stay type-compatible.
 */

export function isTeamPaused(
  _team: Pick<Team, "pausedAt" | "pauseStartsAt" | "pauseEndsAt">,
): boolean {
  // JANAVI has no subscriptions — teams are never paused.
  return false;
}

export async function isTeamPausedById(_teamId: string): Promise<boolean> {
  // JANAVI has no subscriptions — teams are never paused.
  return false;
}
