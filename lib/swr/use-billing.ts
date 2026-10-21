"use client";

import { PLAN_NAME_MAP } from "@/lib/janavi/plan";

export type BasePlan =
  | "free"
  | "starter"
  | "pro"
  | "trial"
  | "business"
  | "datarooms"
  | "datarooms-plus"
  | "datarooms-premium"
  | "datarooms-unlimited";

type PlanWithTrial = `${BasePlan}+drtrial`;
type PlanWithOld = `${BasePlan}+old` | `${BasePlan}+drtrial+old`;

type PlanResponse = {
  plan: BasePlan | PlanWithTrial | PlanWithOld;
  startsAt: Date | null;
  endsAt: Date | null;
  pausedAt: Date | null;
  pauseStartsAt: Date | null;
  pauseEndsAt: Date | null;
  isPaused: boolean;
  cancelledAt: Date | null;
  trialEndsAt: Date | null;
  isCustomer: boolean;
  subscriptionCycle: "monthly" | "yearly";
  discount: null;
};

/**
 * JANAVI plan hook.
 *
 * Replaces the commercial `usePlan` (which fetched
 * `/api/teams/:id/billing/plan` — a billing endpoint that no longer
 * exists). JANAVI is self-hosted with a single all-inclusive tier:
 * every "paid" flag is true, every "free/trial/paused" flag is false,
 * and there is no subscription state to fetch. The returned shape is
 * kept field-for-field compatible with the previous hook so call sites
 * are unchanged.
 */
export function usePlan(_opts: { withDiscount?: boolean } = {}) {
  const plan: PlanResponse = {
    plan: "datarooms-unlimited",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    pauseStartsAt: null,
    pauseEndsAt: null,
    isPaused: false,
    cancelledAt: null,
    trialEndsAt: null,
    isCustomer: false,
    subscriptionCycle: "monthly",
    discount: null,
  };

  return {
    plan: plan.plan,
    planName: PLAN_NAME_MAP[plan.plan],
    originalPlan: plan.plan,
    trial: null,
    isTrial: false,
    isOldAccount: false,
    isCustomer: false,
    isAnnualPlan: false,
    startsAt: null,
    endsAt: null,
    cancelledAt: null,
    trialEndsAt: null,
    pausedAt: null,
    isPaused: false,
    isCancelled: false,
    pauseStartsAt: null,
    pauseEndsAt: null,
    discount: null,
    // JANAVI: single tier — every paid capability is enabled.
    isFree: false,
    isStarter: false,
    isPro: true,
    isBusiness: true,
    isDatarooms: true,
    isDataroomsPlus: true,
    isDataroomsPremium: true,
    isDataroomsUnlimited: true,
    loading: false,
    error: undefined,
    mutate: async () => {},
  };
}
