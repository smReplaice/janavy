import { useMemo, useState } from "react";

import { useRouter } from "next/router";

import { BarChart3, Download, Eye, Users } from "lucide-react";

import { useTeam } from "@/context/team-context";
import { useDataroom, useDataroomDocuments } from "@/lib/swr/use-dataroom";
import { useDataroomStats } from "@/lib/swr/use-dataroom-stats";

import StatsCard from "@/components/datarooms/stats-card";
import { ExportVisitsModal } from "@/components/datarooms/export-visits-modal";
import AppLayout from "@/components/layouts/app";
import { BadgeTooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Data room analytics (JANAVY).
 *
 * Built on the AGPL building blocks: the dataroom stats endpoint
 * (`/api/teams/:teamId/datarooms/:id/stats`), the dataroom documents list
 * and the existing export-visits flow — the same endpoint family the
 * document analytics pages use.
 */
export default function DataroomAnalyticsPage() {
  const router = useRouter();
  const teamInfo = useTeam();
  const teamId = teamInfo?.currentTeam?.id;
  const dataroomId = router.query.id as string | undefined;

  const { dataroom } = useDataroom();
  const { documents } = useDataroomDocuments();
  const { stats, loading: statsLoading } = useDataroomStats();

  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);

  // Map document ids to their names for per-document view counts.
  const documentNames = useMemo(() => {
    const map = new Map<string, string>();
    documents?.forEach((doc) => {
      if (doc.documentId) map.set(doc.documentId, doc.document.name);
    });
    return map;
  }, [documents]);

  const dataroomViews = stats?.dataroomViews ?? [];
  const documentViews = stats?.documentViews ?? [];

  // Unique visitors: distinct identified viewers across all view types,
  // keyed by email when known, else by viewer id.
  const uniqueVisitors = useMemo(() => {
    const seen = new Set<string>();
    for (const view of [...dataroomViews, ...documentViews]) {
      const key = view.viewerEmail ?? view.viewerId ?? view.id;
      seen.add(key);
    }
    return seen.size;
  }, [dataroomViews, documentViews]);

  // Per-document view counts, most viewed first.
  const perDocument = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of documentViews) {
      if (!view.documentId) continue;
      counts.set(view.documentId, (counts.get(view.documentId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([documentId, views]) => ({
        documentId,
        name: documentNames.get(documentId) ?? "Unknown document",
        views,
      }))
      .sort((a, b) => b.views - a.views);
  }, [documentViews, documentNames]);

  const totalDocumentViews = documentViews.length || 1;

  // Average viewing duration across document views with tracked duration.
  const trackedViewCount = stats?.duration?.length ?? 0;
  const totalDuration = stats?.total_duration ?? 0;
  const avgDurationMs = trackedViewCount > 0 ? totalDuration / trackedViewCount : 0;
  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  // Recent activity: latest views across both view types.
  const recentViews = useMemo(
    () =>
      [...dataroomViews, ...documentViews]
        .sort(
          (a, b) =>
            new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime(),
        )
        .slice(0, 10),
    [dataroomViews, documentViews],
  );

  const formatViewedAt = (viewedAt: Date | string) =>
    new Date(viewedAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const highlights = [
    {
      label: "Total views",
      value: dataroomViews.length.toString(),
      icon: Eye,
    },
    {
      label: "Unique visitors",
      value: uniqueVisitors.toString(),
      icon: Users,
    },
    {
      label: "Avg. viewing duration",
      value: formatDuration(avgDurationMs),
      icon: BarChart3,
    },
  ];

  return (
    <AppLayout>
      <div className="relative mx-2 mb-10 mt-4 space-y-8 overflow-hidden px-1 sm:mx-3 md:mx-5 md:mt-5 lg:mx-7 lg:mt-8 xl:mx-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              Analytics
              <BadgeTooltip
                content="Views, visitors and viewing durations for this data room."
                key="dataroom-analytics"
              >
                <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" />
              </BadgeTooltip>
            </h3>
            <p className="text-sm text-muted-foreground">
              Engagement across {dataroom?.name ?? "this data room"}.
            </p>
          </div>
          <Button
            onClick={() => setExportModalOpen(true)}
            variant="outline"
            className="h-8 whitespace-nowrap text-xs lg:h-9 lg:text-sm"
          >
            <Download className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
        </div>

        {/* Views / doc views / total time (AGPL stats card) */}
        <StatsCard />

        {/* Highlights: total views, unique visitors, average duration */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-foreground/5 px-6 py-5"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
              {statsLoading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {item.value}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Per-document view counts */}
        <div className="space-y-4">
          <h4 className="text-lg font-semibold tracking-tight text-foreground">
            Views by document
          </h4>
          <div className="rounded-lg border border-foreground/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">Document</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perDocument.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {statsLoading
                        ? "Loading document views..."
                        : "No document views yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  perDocument.map((doc) => (
                    <TableRow key={doc.documentId}>
                      <TableCell className="max-w-[280px] truncate font-medium">
                        {doc.name}
                      </TableCell>
                      <TableCell>{doc.views}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {Math.round((doc.views / totalDocumentViews) * 100)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Recent activity */}
        <div className="space-y-4">
          <h4 className="text-lg font-semibold tracking-tight text-foreground">
            Recent activity
          </h4>
          <div className="rounded-lg border border-foreground/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viewer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Viewed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentViews.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {statsLoading
                        ? "Loading recent views..."
                        : "No views yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  recentViews.map((view) => (
                    <TableRow key={view.id}>
                      <TableCell className="max-w-[280px] truncate">
                        {view.viewerEmail ??
                          view.viewerName ??
                          "Anonymous viewer"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {view.viewType === "DATAROOM_VIEW"
                          ? "Data room view"
                          : "Document view"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatViewedAt(view.viewedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {teamId && dataroomId && dataroom && exportModalOpen ? (
        <ExportVisitsModal
          teamId={teamId}
          dataroomId={dataroomId}
          dataroomName={dataroom.name}
          onClose={() => setExportModalOpen(false)}
        />
      ) : null}
    </AppLayout>
  );
}
