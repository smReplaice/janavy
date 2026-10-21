import { useRouter } from "next/router";

import { Ban } from "lucide-react";

import AppLayout from "@/components/layouts/app";

/**
 * Redaction workspace route (JANAVY).
 *
 * True (permanent) redaction is not enabled on this deployment
 * (`JANAVI_FEATURES.documentRedaction === false`): the feature ships in
 * Phase 2 with mupdf-based content removal. This page intentionally renders
 * a clean notice instead of placeholder redaction UI.
 */
export default function DocumentRedactionJobPage() {
  const router = useRouter();
  void router; // query is unused while the feature is off

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Ban className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Redaction is not enabled on this JANAVY deployment
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Permanent document redaction is not available here. Contact your
          deployment administrator if you need this capability.
        </p>
      </div>
    </AppLayout>
  );
}
