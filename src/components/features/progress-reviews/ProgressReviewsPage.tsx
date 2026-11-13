"use client";
// FEATURE: progress reviews module — due-now dashboard, review history table, early review initiation.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { formatDate, fullName } from "@/lib/format";
import { PERMS, REVIEW_STATUSES, labelize } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { EpisodePickerDialog } from "./EpisodePickerDialog";
import ReviewForm from "./ReviewForm";
import { DECISION_TONE } from "./types";
import type { PickerEpisode, ReviewsListResponse } from "./types";

export default function ProgressReviewsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [pendingEpisode, setPendingEpisode] = useState<PickerEpisode | null>(null);
  const [earlyReason, setEarlyReason] = useState("");

  const listQuery = useQuery({
    queryKey: ["reviews", page, pageSize, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return apiFetch<ReviewsListResponse>(`/api/reviews?${params.toString()}`);
    },
  });

  const startReview = useMutation({
    mutationFn: (opts: { episodeId: string; early?: boolean; reason?: string }) =>
      apiFetch<{ review: { id: string } }>("/api/reviews", {
        method: "POST",
        json: { episodeId: opts.episodeId, ...(opts.early ? { early: true, reason: opts.reason || undefined } : {}) },
      }),
    onSuccess: (data) => {
      toast.success("Review started — draft created");
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
      setSelectedId(data.review.id);
      setPendingEpisode(null);
      setEarlyReason("");
    },
    onError: (err: Error) => toast.error(err.message || "Could not start review"),
  });

  // Cross-module navigation (e.g. dashboard "review due", sessions module) → start a review for that episode
  useEffect(() => {
    if (navOpts?.episodeId) {
      const episodeId = navOpts.episodeId;
      clearOpts();
      startReview.mutate({ episodeId });
    }
  }, [navOpts]);

  if (selectedId) {
    return <ReviewForm reviewId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const data = listQuery.data;
  const stats = data?.stats;
  const dueEpisodes = data?.dueEpisodes || [];
  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Progress Reviews"
        description="Structured re-assessment every review cycle — evaluate objectives, compare against baseline and decide the next step"
        icon="TrendingUp"
        actions={
          canManage ? (
            <Button onClick={() => setEarlyOpen(true)}>
              <AtomIcon name="Zap" className="mr-2 h-4 w-4" />
              Early review
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Due now" value={stats ? stats.due : "—"} icon="BellRing" tone="amber" loading={listQuery.isLoading} hint="Episodes at/over review threshold" />
        <StatCard label="In draft" value={stats ? stats.draft : "—"} icon="FileEdit" tone="sky" loading={listQuery.isLoading} hint="Reviews not yet signed off" />
        <StatCard label="Completed (30 days)" value={stats ? stats.completed : "—"} icon="CheckCircle2" tone="emerald" loading={listQuery.isLoading} hint="Signed reviews in the last 30 days" />
      </div>

      {/* Due now — prominent section */}
      <SectionCard
        title="Due for review"
        icon="BellRing"
        description="Sessions completed since last review vs threshold — start a review to evaluate progress and reset the counter"
        loading={listQuery.isLoading}
      >
        {dueEpisodes.length === 0 ? (
          <EmptyState icon="CheckCheck" title="No reviews due" description="Episodes will appear here when they reach their review threshold (default every 15 sessions)." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dueEpisodes.map((ep) => {
              const pct = Math.min(100, Math.round((ep.sessionsSinceReview / (ep.reviewThreshold || 15)) * 100));
              return (
                <div key={ep.id} className="flex flex-col justify-between rounded-lg border p-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{fullName(ep.patient)}</p>
                        <p className="truncate text-xs text-muted-foreground">{ep.patient.patientCode} · {ep.title}</p>
                      </div>
                      {ep.reviewDue ? <StatusBadge status="DUE" /> : <StatusBadge status={ep.status} />}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Sessions since review</span>
                        <span className="font-semibold text-foreground">{ep.sessionsSinceReview}/{ep.reviewThreshold}</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ep.totalCompletedSessions} total sessions{ep.therapist ? ` · ${ep.therapist.firstName} ${ep.therapist.lastName}` : ""}
                      {ep.lastReviewDate ? ` · last review ${formatDate(ep.lastReviewDate)}` : " · no review yet"}
                    </p>
                  </div>
                  <div className="mt-3">
                    {ep.draftReviewId ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedId(ep.draftReviewId!)}>
                        <AtomIcon name="FileEdit" className="mr-2 h-4 w-4" />
                        Resume draft review
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!canManage || startReview.isPending}
                        onClick={() => startReview.mutate({ episodeId: ep.id })}
                      >
                        <AtomIcon name="Play" className="mr-2 h-4 w-4" />
                        Start review
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Review history */}
      <SectionCard title="Review history" icon="History" noPadding loading={listQuery.isLoading}>
        <div className="px-4 pt-1 pb-3">
          <DataToolbar
            search={undefined}
            filters={
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {REVIEW_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            }
            onRefresh={() => listQuery.refetch()}
            refreshing={listQuery.isFetching}
          />
        </div>
        {items.length === 0 ? (
          <div className="px-4 pb-6">
            <EmptyState icon="Inbox" title="No reviews yet" description="Reviews appear here once started — threshold reviews from completed sessions or early reviews." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Episode</TableHead>
                    <TableHead className="text-right">Trigger sessions</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Therapist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                      <TableCell className="font-medium">{formatDate(r.reviewDate)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{fullName(r.episode.patient)}</p>
                        <p className="text-xs text-muted-foreground">{r.episode.patient.patientCode}</p>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{r.episode.title}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.triggerSessions}</TableCell>
                      <TableCell>
                        {r.decision ? <Badge variant="outline" className={DECISION_TONE[r.decision]}>{labelize(r.decision)}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.episode.therapist ? `${r.episode.therapist.firstName} ${r.episode.therapist.lastName}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination page={data?.page || page} pageSize={data?.pageSize || pageSize} total={data?.total || 0} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      {/* Early review: pick any open episode */}
      <EpisodePickerDialog
        open={earlyOpen}
        onOpenChange={setEarlyOpen}
        endpoint="/api/reviews/episodes"
        title="Start an early review"
        description="Search any open episode — early reviews do not reset the session threshold requirement, they evaluate progress now."
        onPicked={(ep) => setPendingEpisode(ep)}
      />

      {/* Confirm initiation for the picked episode */}
      <Dialog open={!!pendingEpisode} onOpenChange={(open) => { if (!open) setPendingEpisode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Initiate early review</DialogTitle>
            <DialogDescription>
              {pendingEpisode ? `${fullName(pendingEpisode.patient)} (${pendingEpisode.patient.patientCode}) · ${pendingEpisode.title}` : ""}
            </DialogDescription>
          </DialogHeader>
          {pendingEpisode ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={pendingEpisode.status} />
              <span>{pendingEpisode.sessionsSinceReview}/{pendingEpisode.reviewThreshold} sessions since review</span>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reason for early review (optional)</label>
            <Input value={earlyReason} onChange={(e) => setEarlyReason(e.target.value)} placeholder="e.g. Patient reports significant improvement" />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPendingEpisode(null)}>Cancel</Button>
            <Button size="sm" disabled={startReview.isPending} onClick={() => pendingEpisode && startReview.mutate({ episodeId: pendingEpisode.id, early: true, reason: earlyReason })}>
              {startReview.isPending ? "Starting…" : "Start review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
