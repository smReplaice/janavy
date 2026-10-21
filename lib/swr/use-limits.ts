"use client";

import { useTeam } from "@/context/team-context";
import useSWR from "swr";

import { fetcher } from "@/lib/utils";

export type LimitProps = {
  users: number | null;
  links: number | null;
  documents: number | null;
  domains: number | null;
  datarooms: number | null;
  customDomainOnPro: boolean;
  customDomainInDataroom: boolean;
  advancedLinkControlsOnPro: boolean | null;
  watermarkOnBusiness?: boolean | null;
  agreementOnBusiness?: boolean | null;
  linkCustomFields?: number | null;
  conversationsInDataroom?: boolean;
  fileSizeLimits?: {
    video?: number | null;
    document?: number | null;
    image?: number | null;
    excel?: number | null;
    maxFiles?: number | null;
    maxPages?: number | null;
  };
  usage: {
    documents: number;
    links: number;
    users: number;
  };
  dataroomUpload: boolean;
};

/**
 * JANAVI limits hook. Replaces the commercial `ee/limits/swr-handler`.
 *
 * JANAVI has a single all-inclusive tier: entitlement counts come back as
 * `null` (unlimited), so `canAdd*` is always true and there is never an
 * upgrade modal to show. Only the technical limits (file sizes, page and
 * file counts) are meaningful.
 */
export function useLimits() {
  const teamInfo = useTeam();
  const teamId = teamInfo?.currentTeam?.id;

  const { data, error } = useSWR<LimitProps | null>(
    teamId && `/api/teams/${teamId}/limits`,
    fetcher,
    {
      dedupingInterval: 30000,
    },
  );

  const canAddDocuments = data?.documents
    ? data?.usage?.documents < data?.documents
    : true;
  const canAddLinks = data?.links ? data?.usage?.links < data?.links : true;
  const canAddUsers = data?.users ? data?.usage?.users < data?.users : true;
  // JANAVI has no upgrades — this is always false.
  const showUpgradePlanModal = false;

  return {
    showUpgradePlanModal,
    limits: data,
    canAddDocuments,
    canAddLinks,
    canAddUsers,
    // JANAVI has no subscriptions — teams are never paused.
    isPaused: false,
    error,
    loading: !data && !error,
  };
}

export default useLimits;
