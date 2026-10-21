"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  isImageFieldType,
  SIGNATURE_FIELD_LABELS,
  SignatureField,
} from "@/lib/signing/signature-fields";

import { useSignatureFieldContext } from "./signature-flow";

/**
 * One interactive signature field, positioned absolutely over a page image
 * (normalized 0–1 coordinates → percentage offsets). Image fields
 * (SIGNATURE/INITIALS) open the capture modal; text fields are inline inputs
 * with sensible auto-fills. Watermark and copy protections of the protected
 * viewer remain active around this layer.
 */
export default function SignatureFieldBox({
  field,
  viewerEmail,
}: {
  field: SignatureField;
  viewerEmail?: string;
}) {
  const context = useSignatureFieldContext();
  const [textDraft, setTextDraft] = useState<string | null>(null);
  if (!context || context.completed) return null;

  const { values, setValue, openCapture } = context;
  const value = values[field.fieldId];
  const isImage = isImageFieldType(field.type);
  const label = SIGNATURE_FIELD_LABELS[field.type];
  const filled = isImage ? !!value?.dataUrl : !!value?.value?.trim();

  const boxStyle: React.CSSProperties = {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  };

  if (isImage) {
    return (
      <div
        data-signature-field={field.fieldId}
        className={cn(
          "absolute z-10 flex items-center justify-center overflow-hidden rounded border-2 border-dashed",
          filled
            ? "border-[#123DFF]/70 bg-white"
            : field.required
              ? "border-[#123DFF] bg-white/95 hover:bg-white"
              : "border-gray-400 bg-white/90 hover:bg-white",
        )}
        style={boxStyle}
      >
        <button
          type="button"
          className="flex h-full w-full items-center justify-center p-0.5"
          onClick={() => openCapture(field)}
          aria-label={`${filled ? "Edit" : "Sign"} ${label}${field.required ? " (required)" : ""}`}
        >
          {value?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.dataUrl}
              alt={label}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="pointer-events-none select-none text-center text-[10px] font-medium leading-tight text-[#123DFF] sm:text-xs">
              {label === "Initials" ? "Add initials" : "Sign here"}
              {field.required ? " *" : ""}
            </span>
          )}
        </button>
      </div>
    );
  }

  const isDate = field.type === "DATE";
  const displayValue = textDraft ?? value?.value ?? "";

  return (
    <div
      data-signature-field={field.fieldId}
      className={cn(
        "absolute z-10 flex items-center rounded border px-1",
        filled
          ? "border-[#123DFF]/60 bg-white/80"
          : field.required
            ? "border-[#123DFF] bg-white/95"
            : "border-gray-400 bg-white/90",
      )}
      style={boxStyle}
      title={viewerEmail ? `${label} — ${viewerEmail}` : label}
    >
      {isDate ? (
        <span className="w-full select-none truncate text-center text-[10px] font-medium text-[#0A1234] sm:text-xs">
          {displayValue}
        </span>
      ) : (
        <input
          type="text"
          value={displayValue}
          placeholder={label}
          maxLength={100}
          onChange={(e) => setTextDraft(e.target.value)}
          onBlur={() => {
            setValue(field.fieldId, { value: textDraft ?? value?.value ?? "" });
            setTextDraft(null);
          }}
          className="w-full bg-transparent text-center text-[10px] font-medium text-[#0A1234] outline-none placeholder:text-[#123DFF]/60 sm:text-xs"
        />
      )}
    </div>
  );
}
