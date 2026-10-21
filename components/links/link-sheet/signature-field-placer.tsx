import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTeam } from "@/context/team-context";
import {
  DndContext,
  DragEndEvent,
  pointerWithin,
  useDraggable,
} from "@dnd-kit/core";
import { TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  SIGNATURE_FIELD_LABELS,
  SignatureField,
  SignatureFieldTypeValue,
} from "@/lib/signing/signature-fields";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ButtonTooltip } from "@/components/ui/tooltip";

type PlacerPage = {
  pageNumber: number;
  file: string | null;
};

const FIELD_PALETTE: { type: SignatureFieldTypeValue; defaultSize: [number, number] }[] =
  [
    { type: "SIGNATURE", defaultSize: [0.25, 0.06] },
    { type: "FULL_NAME", defaultSize: [0.2, 0.045] },
    { type: "DATE", defaultSize: [0.12, 0.04] },
    { type: "INITIALS", defaultSize: [0.08, 0.05] },
    { type: "COMPANY", defaultSize: [0.2, 0.045] },
  ];

const BATCH_SIZE = 50;

function newFieldId() {
  return `sf_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Owner-side signature field placement over the existing document page-image
 * preview (same preview-pages API the dashboard preview uses). Fields are
 * stored as normalized 0–1 coordinates relative to the displayed page box.
 */
export default function SignatureFieldPlacer({
  isOpen,
  onOpenChange,
  documentId,
  initialFields,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  initialFields: SignatureField[];
  onSave: (fields: SignatureField[]) => void;
}) {
  const { currentTeamId } = useTeam();
  const [fields, setFields] = useState<SignatureField[]>(initialFields);
  const [pages, setPages] = useState<PlacerPage[] | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const pageSizes = useRef(new Map<number, { width: number; height: number }>());
  const saveAttempted = useRef(false);

  // Load every page image through the existing owner preview API in batches.
  useEffect(() => {
    if (!isOpen || !currentTeamId) return;
    let cancelled = false;
    setPages(null);
    (async () => {
      const collected: PlacerPage[] = [];
      try {
        for (let start = 1; ; start += BATCH_SIZE) {
          const batch = Array.from(
            { length: BATCH_SIZE },
            (_, i) => start + i,
          );
          const res = await fetch(
            `/api/teams/${currentTeamId}/documents/${documentId}/preview-pages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pageNumbers: batch }),
            },
          );
          if (!res.ok) throw new Error(`preview-pages failed (${res.status})`);
          const body = (await res.json()) as { pages: PlacerPage[] };
          if (cancelled) return;
          collected.push(...body.pages);
          setPages([...collected]);
          if (body.pages.length < batch.length) break;
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? `Could not load the document preview: ${error.message}`
              : "Could not load the document preview.",
          );
          setPages([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentTeamId, documentId]);

  useEffect(() => {
    if (isOpen) {
      setFields(initialFields);
      setSelectedFieldId(null);
      saveAttempted.current = false;
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = pages?.length ?? 0;

  const addField = useCallback(
    (type: SignatureFieldTypeValue) => {
      const entry = FIELD_PALETTE.find((f) => f.type === type)!;
      const samePage = fields.filter((f) => f.pageNumber === activePage).length;
      setFields((prev) => [
        ...prev,
        {
          fieldId: newFieldId(),
          type,
          pageNumber: activePage,
          // Stagger new fields so they don't stack exactly.
          x: Math.min(0.55, 0.1 + (samePage % 4) * 0.08),
          y: Math.min(0.8, 0.12 + (samePage % 4) * 0.08),
          width: entry.defaultSize[0],
          height: entry.defaultSize[1],
          required: true,
        },
      ]);
    },
    [fields, activePage],
  );

  const updateField = useCallback(
    (fieldId: string, patch: Partial<SignatureField>) => {
      setFields((prev) =>
        prev.map((f) => (f.fieldId === fieldId ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const removeField = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.fieldId !== fieldId));
    setSelectedFieldId((prev) => (prev === fieldId ? null : prev));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const fieldId = String(event.active.id);
      const field = fields.find((f) => f.fieldId === fieldId);
      if (!field || !event.delta) return;
      const size = pageSizes.current.get(field.pageNumber);
      if (!size) return;
      const nx = field.x + event.delta.x / size.width;
      const ny = field.y + event.delta.y / size.height;
      updateField(fieldId, {
        x: Math.min(Math.max(0, nx), 1 - field.width),
        y: Math.min(Math.max(0, ny), 1 - field.height),
      });
    },
    [fields, updateField],
  );

  const hasSignatureField = useMemo(
    () => fields.some((f) => f.type === "SIGNATURE"),
    [fields],
  );

  const handleSave = () => {
    saveAttempted.current = true;
    if (!hasSignatureField) {
      toast.error("Place at least one Signature field before saving.");
      return;
    }
    onSave(fields);
    toast.success(
      `Saved ${fields.length} signature field${fields.length === 1 ? "" : "s"}. Remember to save the link.`,
    );
    onOpenChange(false);
  };

  const selectedField = fields.find((f) => f.fieldId === selectedFieldId) ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[97%] max-w-5xl flex-col justify-between border border-gray-200 bg-background p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-gray-200 px-6 py-4 text-start">
          <DialogTitle>Configure Signature Fields</DialogTitle>
          <DialogDescription>
            Drag to position fields on the document. Fields are placed on the
            page image exactly as the signer will see them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {FIELD_PALETTE.map(({ type }) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-3xl bg-muted text-sm font-normal text-foreground/80 hover:bg-muted/70"
                disabled={!pages || pageCount === 0}
                onClick={() => addField(type)}
              >
                + {SIGNATURE_FIELD_LABELS[type]}
              </Button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">
              Adding to page {activePage}
              {pageCount ? ` of ${pageCount}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="preview-signer-view"
              className="text-sm text-muted-foreground"
            >
              Preview signer view
            </Label>
            <Switch
              id="preview-signer-view"
              checked={previewMode}
              onCheckedChange={setCheckedSafe(setPreviewMode)}
            />
          </div>
        </div>

        <ScrollArea className="flex-grow bg-gray-100 dark:bg-gray-950">
          <div className="mx-auto flex max-w-[750px] flex-col items-center gap-6 py-6">
            {pages === null ? (
              <p className="p-10 text-sm text-muted-foreground">
                Loading document pages…
              </p>
            ) : pageCount === 0 ? (
              <p className="p-10 text-sm text-muted-foreground">
                No page preview is available for this document yet. Wait for
                processing to finish and try again.
              </p>
            ) : (
              <DndContext
                collisionDetection={pointerWithin}
                onDragEnd={handleDragEnd}
              >
                {pages.map((page) => (
                  <div
                    key={page.pageNumber}
                    className="w-full"
                    onClick={() => setActivePage(page.pageNumber)}
                  >
                    <p className="mb-1 text-xs text-muted-foreground">
                      Page {page.pageNumber}
                    </p>
                    <PlacerPageSurface
                      page={page}
                      fields={fields.filter(
                        (f) => f.pageNumber === page.pageNumber,
                      )}
                      previewMode={previewMode}
                      selectedFieldId={selectedFieldId}
                      onSelect={setSelectedFieldId}
                      onRemove={removeField}
                      onResize={(fieldId, width, height) =>
                        updateField(fieldId, { width, height })
                      }
                      onSizeKnown={(pageNumber, size) =>
                        pageSizes.current.set(pageNumber, size)
                      }
                    />
                  </div>
                ))}
              </DndContext>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {selectedField && !previewMode ? (
              <span className="flex flex-wrap items-center gap-3">
                <span>{SIGNATURE_FIELD_LABELS[selectedField.type]} · page {selectedField.pageNumber}</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#0A1234]"
                    checked={selectedField.required}
                    onChange={(e) =>
                      updateField(selectedField.fieldId, {
                        required: e.target.checked,
                      })
                    }
                  />
                  Required
                </label>
                <ButtonTooltip content="Delete field">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => removeField(selectedField.fieldId)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </ButtonTooltip>
              </span>
            ) : (
              <span>
                At least one Signature field is required to save.{" "}
                {fields.length} field{fields.length === 1 ? "" : "s"} placed.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveAttempted.current && !hasSignatureField}
            >
              Save Fields
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function setCheckedSafe(setter: (v: boolean) => void) {
  return (checked: boolean) => setter(checked);
}

function PlacerPageSurface({
  page,
  fields,
  previewMode,
  selectedFieldId,
  onSelect,
  onRemove,
  onResize,
  onSizeKnown,
}: {
  page: PlacerPage;
  fields: SignatureField[];
  previewMode: boolean;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  onRemove: (fieldId: string) => void;
  onResize: (fieldId: string, width: number, height: number) => void;
  onSizeKnown: (
    pageNumber: number,
    size: { width: number; height: number },
  ) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onSizeKnown(page.pageNumber, {
          width: rect.width,
          height: rect.height,
        });
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page.pageNumber, onSizeKnown]);

  return (
    <div ref={containerRef} className="relative w-full bg-white shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.file ?? ""}
        alt={`Page ${page.pageNumber}`}
        className="block h-auto w-full select-none"
        draggable={false}
      />
      {fields.map((field) => (
        <PlacerField
          key={field.fieldId}
          field={field}
          previewMode={previewMode}
          selected={selectedFieldId === field.fieldId}
          onSelect={onSelect}
          onRemove={onRemove}
          onResize={onResize}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

function PlacerField({
  field,
  previewMode,
  selected,
  onSelect,
  onRemove,
  onResize,
  containerRef,
}: {
  field: SignatureField;
  previewMode: boolean;
  selected: boolean;
  onSelect: (fieldId: string) => void;
  onRemove: (fieldId: string) => void;
  onResize: (fieldId: string, width: number, height: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggableField(field.fieldId, previewMode);

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = field.width;
    const startH = field.height;
    const move = (e: PointerEvent) => {
      const width = Math.min(
        1,
        Math.max(0.04, startW + (e.clientX - startX) / rect.width),
      );
      const height = Math.min(
        1,
        Math.max(0.02, startH + (e.clientY - startY) / rect.height),
      );
      onResize(field.fieldId, width, height);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const style: React.CSSProperties = {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
    ...(transform
      ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
      : {}),
  };

  if (previewMode) {
    return (
      <div
        className="pointer-events-none absolute z-10 flex flex-col items-center justify-center rounded border border-dashed border-[#123DFF] bg-white/85 text-[10px] font-medium text-[#0A1234]"
        style={style}
      >
        <span className="truncate px-1 text-center">
          {SIGNATURE_FIELD_LABELS[field.type]}
          {field.required ? " *" : ""}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group absolute z-10 flex cursor-grab touch-none select-none items-center justify-center rounded border-2 bg-white/70 text-[10px] font-medium text-[#0A1234]",
        selected
          ? "border-[#123DFF] shadow-[0_0_0_2px_rgba(18,61,255,0.25)]"
          : "border-[#123DFF]/60 hover:border-[#123DFF]",
        isDragging && "cursor-grabbing opacity-80",
      )}
      style={style}
      onPointerDown={() => onSelect(field.fieldId)}
      {...attributes}
      {...listeners}
    >
      <span className="truncate px-1 text-center">
        {SIGNATURE_FIELD_LABELS[field.type]}
        {field.required ? " *" : ""}
      </span>
      <button
        type="button"
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(field.fieldId);
        }}
      >
        <TrashIcon className="h-3 w-3" />
      </button>
      <span
        className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-[#123DFF]"
        onPointerDown={startResize}
      />
    </div>
  );
}

function useDraggableField(fieldId: string, previewMode: boolean) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: fieldId,
      disabled: previewMode,
    });
  return { attributes, listeners, setNodeRef, transform, isDragging };
}
