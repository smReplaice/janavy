import { useEffect, useState } from "react";

import { LockIcon, PenLineIcon } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { FADE_IN_ANIMATION_SETTINGS } from "@/lib/constants";
import {
  DEFAULT_SIGNATURE_CONFIGURATION,
  SIGNATURE_METHOD_LABELS,
  SIGNATURE_METHODS,
  SignatureFieldConfiguration,
  SignatureMethodValue,
} from "@/lib/signing/signature-fields";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { DEFAULT_LINK_TYPE } from ".";
import LinkItem from "./link-item";
import SignatureFieldPlacer from "./signature-field-placer";

/**
 * "Require Electronic Signature" — native e-signature link settings.
 * Sits directly below the NDA agreement section and follows the same
 * LinkItem + conditional sub-section pattern as the other security controls.
 */
export default function SignatureSection({
  data,
  setData,
  targetId,
  linkType,
}: {
  data: DEFAULT_LINK_TYPE;
  setData: React.Dispatch<React.SetStateAction<DEFAULT_LINK_TYPE>>;
  /** Document id (link target) — needed to load page images for placement. */
  targetId?: string;
  linkType: Omit<import("@prisma/client").LinkType, "WORKFLOW_LINK">;
}) {
  const { requireSignature, signatureFieldConfiguration } = data;
  const [enabled, setEnabled] = useState<boolean>(false);
  const [isPlacerOpen, setIsPlacerOpen] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(!!requireSignature);
  }, [requireSignature]);

  const configuration: SignatureFieldConfiguration =
    signatureFieldConfiguration ?? DEFAULT_SIGNATURE_CONFIGURATION;
  const fields = configuration.fields;

  const handleToggle = () => {
    const updated = !enabled;
    setData({
      ...data,
      requireSignature: updated,
      // Signing requires a verified identity — the email gate + OTP
      // verification are forced on server-side while signing is required.
      emailProtected: updated ? true : data.emailProtected,
      emailAuthenticated: updated ? true : data.emailAuthenticated,
      signatureVerificationRequired: true,
      signatureConsentRequired:
        data.signatureConsentRequired === false ? false : true,
      signatureFieldConfiguration: updated
        ? configuration
        : signatureFieldConfiguration,
    });
    setEnabled(updated);
  };

  const handleMethodToggle = (method: SignatureMethodValue, checked: boolean) => {
    const current = configuration.methods;
    const next = checked
      ? [...new Set([...current, method])]
      : current.filter((m) => m !== method);
    if (next.length === 0) {
      toast.error("At least one signing method must be enabled.");
      return;
    }
    setData({
      ...data,
      signatureFieldConfiguration: { ...configuration, methods: next },
    });
  };

  const handleConsentToggle = () => {
    setData({
      ...data,
      signatureConsentRequired: !data.signatureConsentRequired,
    });
  };

  const handleFieldsSave = (fields: SignatureFieldConfiguration["fields"]) => {
    setData({
      ...data,
      signatureFieldConfiguration: { ...configuration, fields },
    });
  };

  const canPlaceFields = !!targetId && linkType === "DOCUMENT_LINK";

  const fieldCount = fields.length;
  const hasSignatureField = fields.some((f) => f.type === "SIGNATURE");

  return (
    <div className="pb-5">
      <LinkItem
        title="Require Electronic Signature"
        link="https://janavy.com"
        tooltipContent="Require recipients to electronically sign the shared document before completing their access."
        enabled={enabled}
        action={handleToggle}
      />

      {enabled && (
        <motion.div
          className="relative mt-4 space-y-4"
          {...FADE_IN_ANIMATION_SETTINGS}
        >
          <div className="flex w-full flex-col gap-3 overflow-x-visible">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Signing Method:
              </Label>
              <div className="flex flex-col gap-2">
                {SIGNATURE_METHODS.map((method) => (
                  <label
                    key={method}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={configuration.methods.includes(method)}
                      onCheckedChange={(checked) =>
                        handleMethodToggle(method, checked === true)
                      }
                    />
                    {SIGNATURE_METHOD_LABELS[method]}
                  </label>
                ))}
              </div>
            </div>

            {/* Locked: signing requires verified identity (server-enforced). */}
            <div className="flex items-center justify-between gap-x-2">
              <h2 className="flex flex-1 items-center gap-2 text-sm font-medium leading-6 text-foreground">
                Require Email Verification
                <LockIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </h2>
              <Switch checked disabled aria-disabled className="opacity-50" />
            </div>

            <LinkItem
              title="Require Signing Consent"
              tooltipContent="Show the electronic-signature consent statement before the signer can submit."
              enabled={data.signatureConsentRequired}
              action={handleConsentToggle}
            />

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8"
                size="sm"
                disabled={!canPlaceFields}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!canPlaceFields) {
                    toast.error(
                      "Signature fields can only be placed on document links.",
                    );
                    return;
                  }
                  setIsPlacerOpen(true);
                }}
              >
                <PenLineIcon className="mr-2 h-4 w-4" />
                Configure Signature Fields
              </Button>
              <p className="text-xs text-muted-foreground">
                {fieldCount === 0
                  ? "No fields placed yet — place at least one Signature field before sharing."
                  : `${fieldCount} field${fieldCount === 1 ? "" : "s"} placed${hasSignatureField ? "" : " — add a Signature field to enable signing"}.`}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {isPlacerOpen && targetId ? (
        <SignatureFieldPlacer
          isOpen={isPlacerOpen}
          onOpenChange={setIsPlacerOpen}
          documentId={targetId}
          initialFields={fields}
          onSave={handleFieldsSave}
        />
      ) : null}
    </div>
  );
}
