"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SignaturePad from "signature_pad";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  SignatureField,
  SignatureMethodValue,
} from "@/lib/signing/signature-fields";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Handwriting-ish cursive styles for the Type method. Rendered via canvas
 * fonts with a generic `cursive` fallback per platform.
 */
const TYPE_STYLES: { id: string; label: string; fontFamily: string }[] = [
  {
    id: "flowing",
    label: "Flowing",
    fontFamily: `'Brush Script MT', 'Brush Script Std', 'Segoe Script', cursive`,
  },
  {
    id: "elegant",
    label: "Elegant",
    fontFamily: `'Lucida Handwriting', 'Apple Chancery', 'Comic Sans MS', cursive`,
  },
  {
    id: "casual",
    label: "Casual",
    fontFamily: `'Segoe Print', 'Bradley Hand', 'Chalkboard SE', cursive`,
  },
];

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 180;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export default function SignatureCaptureModal({
  field,
  allowedMethods,
  open,
  onOpenChange,
  onConfirm,
  viewerName,
}: {
  field: SignatureField | null;
  allowedMethods: SignatureMethodValue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dataUrl: string, method: SignatureMethodValue) => void;
  viewerName: string;
}) {
  const [tab, setTab] = useState<SignatureMethodValue>("TYPE");
  const [typedName, setTypedName] = useState(viewerName);
  const [styleId, setStyleId] = useState(TYPE_STYLES[0].id);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);

  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const fieldLabel = field?.type === "INITIALS" ? "Initials" : "Signature";

  useEffect(() => {
    if (!open) return;
    setTypedName(viewerName);
    setUploadedDataUrl(null);
    setTab(allowedMethods[0] ?? "TYPE");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize the drawing pad when the Draw tab is visible.
  useEffect(() => {
    if (!open || tab !== "DRAW" || !drawCanvasRef.current) return;
    const canvas = drawCanvasRef.current;
    const pad = new SignaturePad(canvas, {
      penColor: "#0A1234",
      backgroundColor: "#ffffff",
      minWidth: 1.2,
      maxWidth: 2.6,
    });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [open, tab]);

  // Render the typed name into the preview canvas whenever it changes.
  useEffect(() => {
    if (!open || tab !== "TYPE") return;
    const canvas = typeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const style = TYPE_STYLES.find((s) => s.id === styleId) ?? TYPE_STYLES[0];
    const text = typedName.trim() || "Your name";
    let fontSize = Math.min(72, CANVAS_HEIGHT * 0.6);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "#0A1234";
    do {
      ctx.font = `${fontSize}px ${style.fontFamily}`;
      fontSize -= 2;
    } while (ctx.measureText(text).width > CANVAS_WIDTH - 40 && fontSize > 12);
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 4);
  }, [open, tab, typedName, styleId]);

  const trimmedName = useMemo(() => typedName.trim(), [typedName]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        toast.error("Only PNG or JPG images are accepted.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("The image must be smaller than 2 MB.");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadedDataUrl(dataUrl);
    },
    [],
  );

  const handleUse = () => {
    if (tab === "DRAW") {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) {
        toast.error("Please draw your signature first.");
        return;
      }
      onConfirm(pad.toDataURL("image/png"), "DRAW");
    } else if (tab === "TYPE") {
      if (!trimmedName) {
        toast.error("Please type your name first.");
        return;
      }
      const canvas = typeCanvasRef.current;
      if (!canvas) return;
      onConfirm(canvas.toDataURL("image/png"), "TYPE");
    } else {
      if (!uploadedDataUrl) {
        toast.error("Please upload a PNG or JPG image of your signature.");
        return;
      }
      onConfirm(uploadedDataUrl, "UPLOAD");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader className="text-start">
          <DialogTitle>Adopt your {fieldLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>
            This {fieldLabel.toLowerCase()} will be applied to the document you
            are signing electronically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex gap-2">
          {allowedMethods.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setTab(method)}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors",
                tab === method
                  ? "border-[#123DFF] bg-[#123DFF]/10 text-[#0A1234]"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {method === "DRAW" ? "Draw" : method === "TYPE" ? "Type" : "Upload"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "DRAW" ? (
            <div className="space-y-2">
              <canvas
                ref={drawCanvasRef}
                className="h-[180px] w-full touch-none rounded-md border border-gray-300 bg-white"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => padRef.current?.clear()}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {tab === "TYPE" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="signature-typed-name">Your name</Label>
                <Input
                  id="signature-typed-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Amara Okafor"
                  maxLength={100}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {TYPE_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setStyleId(style.id)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      styleId === style.id
                        ? "border-[#123DFF] text-[#0A1234]"
                        : "border-border text-muted-foreground",
                    )}
                    style={{ fontFamily: style.fontFamily }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              <canvas
                ref={typeCanvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full rounded-md border border-gray-300 bg-white"
              />
            </div>
          ) : null}

          {tab === "UPLOAD" ? (
            <div className="space-y-3">
              <Label htmlFor="signature-upload">Upload an image (PNG or JPG, max 2 MB)</Label>
              <Input
                id="signature-upload"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
              {uploadedDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={uploadedDataUrl}
                  alt="Uploaded signature preview"
                  className="max-h-[180px] w-full rounded-md border border-gray-300 bg-white object-contain"
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleUse}>
            Use this {fieldLabel.toLowerCase()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
