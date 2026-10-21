"use client";

import { useEffect, useState } from "react";

import { DEFAULT_LINK_TYPE } from "@/components/links/link-sheet";
import LinkItem from "@/components/links/link-sheet/link-item";

/**
 * Link-option row for confidential view (JANAVY).
 *
 * Mirrors the neighboring option rows (e.g. screenshot-protection-section):
 * a single switch that toggles `enableConfidentialView` on the link data.
 * The overlay itself deters casual viewing; it is not copy protection and
 * the copy here must never claim absolute protection.
 */
export default function ConfidentialViewSection({
  data,
  setData,
  isAllowed,
  handleUpgradeStateChange,
}: {
  data: DEFAULT_LINK_TYPE;
  setData: React.Dispatch<React.SetStateAction<DEFAULT_LINK_TYPE>>;
  isAllowed: boolean;
  handleUpgradeStateChange: ({
    state,
    trigger,
    plan,
    highlightItem,
  }: {
    state: boolean;
    trigger: string;
    plan?: "Pro" | "Business" | "Data Rooms" | "Data Rooms Plus";
    highlightItem?: string[];
  }) => void;
}) {
  const { enableConfidentialView } = data;
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(!!enableConfidentialView);
  }, [enableConfidentialView]);

  const handleEnableConfidentialView = () => {
    const updatedEnableConfidentialView = !enabled;
    setData({
      ...data,
      enableConfidentialView: updatedEnableConfidentialView,
    });
    setEnabled(updatedEnableConfidentialView);
  };

  return (
    <div className="pb-5">
      <LinkItem
        title="Confidential view"
        tooltipContent="Obscures content until the recipient moves their pointer over it. Deters casual viewing; it is not copy protection."
        link="https://janavy.dev/help/article/confidential-view"
        enabled={enabled}
        action={handleEnableConfidentialView}
        isAllowed={isAllowed}
        requiredPlan="business"
        upgradeAction={() =>
          handleUpgradeStateChange({
            state: true,
            trigger: "link_sheet_confidential_view_section",
            plan: "Business",
            highlightItem: ["confidential"],
          })
        }
      />
    </div>
  );
}
