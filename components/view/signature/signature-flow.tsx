"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { BRANDING } from "@/config/branding";
import { CheckCircle2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  isImageFieldType,
  SignatureField,
  SIGNATURE_CONSENT_COPY,
  ViewerSignatureConfig,
} from "@/lib/signing/signature-fields";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import SignatureCaptureModal from "./signature-capture-modal";

export type SignatureFieldValue = {
  value?: string;
  dataUrl?: string;
  method?: "DRAW" | "TYPE" | "UPLOAD";
};

type SignatureFlowContextValue = {
  fields: SignatureField[];
  values: Record<string, SignatureFieldValue>;
  setValue: (fieldId: string, value: SignatureFieldValue) => void;
  openCapture: (field: SignatureField) => void;
  completed: boolean;
};

const SignatureFlowContext = createContext<SignatureFlowContextValue | null>(
  null,
);

export function useSignatureFieldContext(): SignatureFlowContextValue | null {
  return useContext(SignatureFlowContext);
}

function guessNameFromEmail(email: string | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/**
 * Recipient signing flow: renders the interactive signature fields over the
 * existing page-image viewer (via context, consumed by SignatureFieldBox in
 * the page content) plus the consent + submit bar and the confirmation screen.
 * All watermark/download/copy protections of the protected viewer stay active.
 */
export default function SignatureFlow({
  config,
  linkId,
  viewId,
  viewerEmail,
  viewerName,
  children,
}: {
  config: ViewerSignatureConfig;
  linkId: string;
  viewId?: string;
  viewerEmail?: string;
  viewerName?: string;
  children: React.ReactNode;
}) {
  const [values, setValues] = useState<
    Record<string, SignatureFieldValue>
  >(() => {
    const initial: Record<string, SignatureFieldValue> = {};
    const name = viewerName?.trim() || guessNameFromEmail(viewerEmail);
    for (const field of config.fields) {
      if (field.type === "FULL_NAME") initial[field.fieldId] = { value: name };
      else if (field.type === "DATE")
        initial[field.fieldId] = { value: new Date().toLocaleDateString() };
      else if (field.type === "INITIALS")
        initial[field.fieldId] = { value: deriveInitials(name) };
    }
    return initial;
  });
  const [captureField, setCaptureField] = useState<SignatureField | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(config.signed);
  const [dismissedConfirmation, setDismissedConfirmation] = useState(
    config.signed,
  );
  const submitAttempted = useRef(false);

  const setValue = useCallback(
    (fieldId: string, value: SignatureFieldValue) => {
      setValues((prev) => ({ ...prev, [fieldId]: value }));
    },
    [],
  );

  const openCapture = useCallback((field: SignatureField) => {
    setCaptureField(field);
  }, []);

  const missingRequired = useMemo(() => {
    return config.fields.filter((field) => {
      if (!field.required) return false;
      const v = values[field.fieldId];
      if (isImageFieldType(field.type)) return !v?.dataUrl;
      return !v?.value?.trim();
    });
  }, [config.fields, values]);

  const canSubmit =
    !submitting &&
    missingRequired.length === 0 &&
    (!config.consentRequired || consentChecked);

  const handleSubmit = async () => {
    submitAttempted.current = true;
    if (!canSubmit) {
      if (missingRequired.length > 0) {
        setError(
          `Complete the remaining required field${missingRequired.length === 1 ? "" : "s"} before signing.`,
        );
      } else {
        setError("Please accept the electronic signature consent.");
      }
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Single-signer MVP: one signing method per document — taken from the
      // SIGNATURE field (or the first image field) the signer completed.
      const signatureField =
        config.fields.find((f) => f.type === "SIGNATURE") ??
        config.fields.find((f) => isImageFieldType(f.type));
      const method =
        (signatureField && values[signatureField.fieldId]?.method) || "TYPE";
      const response = await fetch("/api/views/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          viewId,
          consent: true,
          method,
          fields: config.fields.map((field) => ({
            fieldId: field.fieldId,
            ...(values[field.fieldId]?.value
              ? { value: values[field.fieldId].value }
              : {}),
            ...(values[field.fieldId]?.dataUrl
              ? { dataUrl: values[field.fieldId].dataUrl }
              : {}),
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (response.ok || response.status === 409) {
        setCompleted(true);
        setDismissedConfirmation(false);
      } else {
        setError(body.message ?? "Signing failed. Please try again.");
      }
    } catch {
      setError("Signing failed. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Scroll the first missing required field into view when submit is blocked.
  useEffect(() => {
    if (error && missingRequired.length > 0) {
      document
        .querySelector(`[data-signature-field="${missingRequired[0].fieldId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error, missingRequired]);

  const contextValue = useMemo<SignatureFlowContextValue>(
    () => ({
      fields: config.fields,
      values,
      setValue,
      openCapture,
      completed,
    }),
    [config.fields, values, setValue, openCapture, completed],
  );

  if (config.signed && dismissedConfirmation) {
    // Already signed on a previous visit — no layer, just the viewer.
    return <>{children}</>;
  }

  return (
    <SignatureFlowContext.Provider value={contextValue}>
      {children}

      {!completed ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              {config.consentRequired ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={consentChecked}
                    onCheckedChange={(checked) =>
                      setConsentChecked(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="max-w-xl">{SIGNATURE_CONSENT_COPY}</span>
                </label>
              ) : null}
              <p
                className={cn(
                  "text-xs",
                  error ? "text-red-600" : "text-muted-foreground",
                )}
              >
                {error
                  ? error
                  : missingRequired.length > 0
                    ? `${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} remaining — click each field on the document to complete it.`
                    : "All required fields are complete."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              loading={submitting}
              className="shrink-0"
            >
              Sign &amp; Complete
            </Button>
          </div>
        </div>
      ) : null}

      {completed && !dismissedConfirmation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/90 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2Icon className="h-8 w-8 text-green-600" />
              </span>
            </div>
            <h2 className="mb-1 text-xl font-semibold text-[#0A1234]">
              Document signed
            </h2>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-300">
              You electronically signed this document. Your signature and a
              completion receipt were sent to the document owner.
            </p>
            <p className="mb-6 text-xs text-gray-500">
              {BRANDING.productName} · Electronic signature — verified via email
              one-time code. This is not a certificate-based digital signature.
            </p>
            <Button
              type="button"
              onClick={() => setDismissedConfirmation(true)}
              className="w-full"
            >
              Continue viewing
            </Button>
          </div>
        </div>
      ) : null}

      <SignatureCaptureModal
        field={captureField}
        allowedMethods={config.methods.length > 0 ? config.methods : ["TYPE"]}
        open={!!captureField}
        onOpenChange={(open) => {
          if (!open) setCaptureField(null);
        }}
        onConfirm={(dataUrl, method) => {
          if (captureField) {
            setValue(captureField.fieldId, { dataUrl, method });
          }
        }}
        viewerName={
          viewerName?.trim() || guessNameFromEmail(viewerEmail)
        }
      />
    </SignatureFlowContext.Provider>
  );
}
