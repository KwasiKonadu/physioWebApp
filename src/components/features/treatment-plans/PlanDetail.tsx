"use client";
// FEATURE: Treatment plan detail — header actions + schedule/objectives/milestones/interventions/precautions/versions
import { DataTable } from "@/components/molecules/data-table";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { formatDate, formatDateTime, relativeTime, fullName } from "@/lib/format";
import { PERMS } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { plansApi } from "./plan-api";
import { ObjectiveRow, VersionHistory } from "./PlanDetailParts";

export function PlanDetail({
  planId, onBack, onEdit, onRevise, onOpenVersion,
}: {
  planId: string;
  onBack: () => void;
  onEdit: () => void;
  onRevise: () => void;
  onOpenVersion: (id: string) => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [activateOpen, setActivateOpen] = useState(false);
  const [discontinueOpen, setDiscontinueOpen] = useState(false);
  const [discontinueReason, setDiscontinueReason] = useState("");

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plans", "detail", planId],
    queryFn: () => plansApi.detail(planId),
    enabled: !!planId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plans"] });

  const activateMutation = useMutation({
    mutationFn: () => plansApi.activate(planId),
    onSuccess: (updated) => {
      toast.success(`Plan v${updated.version} activated — episode is now in active treatment`);
      setActivateOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discontinueMutation = useMutation({
    mutationFn: (reason: string) => plansApi.discontinue(planId, reason),
    onSuccess: () => {
      toast.success("Plan discontinued");
      setDiscontinueOpen(false);
      setDiscontinueReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !plan) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const status = plan.status;
  const canActivate = canManage && (status === "DRAFT" || status === "UNDER_REVIEW");
  const canRevise = canManage && (status === "ACTIVE" || status === "UNDER_REVIEW");
  const canDiscontinue = canManage && ["DRAFT", "ACTIVE", "UNDER_REVIEW"].includes(status);
  const achieved = plan.objectives.filter((o) => o.status === "ACHIEVED").length;
  const objectivesTotal = plan.objectives.length;
  const reviewPct = plan.episode.reviewThreshold > 0
    ? Math.min(100, Math.round((plan.episode.sessionsSinceReview / plan.reviewThresholdSessions) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <PageBreadcrumb items={[{ label: "Treatment Plans", onClick: onBack }, { label: `${fullName(plan.episode.patient)} — v${plan.version}` }]} />
      {/* ---- header ---- */}
      <div className="rounded-lg border bg-white">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">
                  <button type="button" title="Open patient profile" className="truncate text-left transition-colors hover:text-navy-800 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: plan.episode.patient.id })}>
                    {fullName(plan.episode.patient)}
                  </button>
                </h2>
                <Badge variant="outline" className="font-mono text-xs">{plan.episode.patient.patientCode}</Badge>
                <Badge variant="outline" className="bg-navy-50 text-xs font-semibold text-navy-800">v{plan.version}</Badge>
                <StatusBadge status={plan.status} />
                {plan.episode.reviewDue ? <Badge className="bg-amber-500 text-[10px] text-white">Review due</Badge> : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {plan.episode.title} · episode status {plan.episode.status.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan.activatedAt
                  ? <>Activated {formatDateTime(plan.activatedAt)}</>
                  : <>Created {relativeTime(plan.createdAt)}</>}
                {plan.episode.therapist ? <> · Therapist: {fullName(plan.episode.therapist)} ({plan.episode.therapist.staffCode})</> : null}
                {plan.revisedFromId ? <> · revised from {plan.versions.find((v) => v.id === plan.revisedFromId) ? `v${plan.versions.find((v) => v.id === plan.revisedFromId)!.version}` : "previous version"}</> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canActivate ? (
              <Button
                className="bg-navy-800 text-white hover:bg-navy-900"
                onClick={() => setActivateOpen(true)}
                disabled={activateMutation.isPending}
              >
                <AtomIcon name="Zap" className="mr-1.5 h-4 w-4" /> Activate
              </Button>
            ) : null}
            {canRevise ? (
              <Button className="bg-navy-800 text-white hover:bg-navy-900" onClick={onRevise}>
                <AtomIcon name="GitBranch" className="mr-1.5 h-4 w-4" /> Revise
              </Button>
            ) : null}
            {canManage && status === "DRAFT" ? (
              <Button variant="outline" onClick={onEdit}>
                <AtomIcon name="Pencil" className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => navigate("patients", { patientId: plan.episode.patient.id, episodeId: plan.episode.id })}>
              <AtomIcon name="FolderOpen" className="mr-1.5 h-4 w-4" /> Episode
            </Button>
            <Button variant="outline" onClick={() => navigate("therapy-sessions", { episodeId: plan.episode.id })}>
              <AtomIcon name="Activity" className="mr-1.5 h-4 w-4" /> Start session
            </Button>
            {canDiscontinue ? (
              <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDiscontinueOpen(true)}>
                <AtomIcon name="Ban" className="mr-1.5 h-4 w-4" /> Discontinue
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- content grid ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Session schedule" icon="CalendarClock">
          <DetailGrid>
            <DetailRow label="Sessions / week" value={plan.sessionsPerWeek ?? "—"} />
            <DetailRow label="Expected total sessions" value={plan.expectedTotalSessions ?? "—"} />
            <DetailRow label="Session duration" value={plan.sessionDurationMin ? `${plan.sessionDurationMin} min` : "—"} />
            <DetailRow label="Plan period" value={`${formatDate(plan.startDate)} → ${formatDate(plan.endDate)}`} />
            <DetailRow label="Review threshold" value={`Every ${plan.reviewThresholdSessions} sessions`} />
            <DetailRow
              label="Completed sessions"
              value={
                <span>
                  {plan.episode.totalCompletedSessions}
                  {plan.expectedTotalSessions ? <span className="text-muted-foreground"> / {plan.expectedTotalSessions}</span> : null}
                </span>
              }
            />
          </DetailGrid>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Sessions since last review</span>
              <span className="font-semibold text-foreground">
                {plan.episode.sessionsSinceReview} / {plan.reviewThresholdSessions}
              </span>
            </div>
            <Progress value={reviewPct} className="mt-2 h-2" />
            {plan.episode.reviewDue ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AtomIcon name="AlertTriangle" className="h-3.5 w-3.5" />
                Progress review due — schedule a review for this episode.
              </p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Objectives"
          icon="Target"
          description={objectivesTotal ? `${achieved} of ${objectivesTotal} achieved` : undefined}
          actions={
            objectivesTotal ? (
              <div className="w-28">
                <Progress value={objectivesTotal ? (achieved / objectivesTotal) * 100 : 0} className="h-2" />
              </div>
            ) : undefined
          }
        >
          {objectivesTotal === 0 ? (
            <EmptyStateCompact message="No objectives defined for this plan" />
          ) : (
            <div className="space-y-2">
              {plan.objectives.map((o) => <ObjectiveRow key={o.id} objective={o} />)}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Milestones" icon="Flag">
          {plan.milestones.length === 0 ? (
            <EmptyStateCompact message="No milestones defined" />
          ) : (
            <ul className="space-y-2">
              {plan.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{m.description}</p>
                    {m.objectiveId ? (
                      <p className="text-xs text-muted-foreground">
                        linked to: {plan.objectives.find((o) => o.id === m.objectiveId)?.description?.slice(0, 60) || "objective"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {m.expectedDate ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <AtomIcon name="CalendarDays" className="h-3 w-3" /> {formatDate(m.expectedDate)}
                      </span>
                    ) : null}
                    <StatusBadge status={m.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Precautions & recommendations" icon="ShieldAlert">
          <DetailGrid cols={1}>
            <DetailRow label="Contraindications" value={plan.contraindications} />
            <DetailRow label="Restrictions" value={plan.restrictions} />
            <DetailRow label="Activities to avoid" value={plan.activitiesToAvoid} />
            <DetailRow label="Special precautions" value={plan.specialPrecautions} />
            <DetailRow label="Patient recommendations" value={plan.patientRecommendations} />
            <DetailRow label="Referral instructions" value={plan.referralInstructions} />
          </DetailGrid>
        </SectionCard>

        <SectionCard title="Interventions" icon="ClipboardList" className="lg:col-span-2">
          <DataTable
            maxHeight="max-h-none"
            minWidth="min-w-0"
            rows={plan.interventions}
            rowKey={(iv) => iv.id}
            empty={<EmptyStateCompact message="No interventions defined" />}
            columns={[
              { id: "name", header: "Intervention", cell: (iv) => <span className="font-medium text-foreground">{iv.name}</span> },
              { id: "desc", header: "Description", hideBelow: "md", className: "max-w-65 truncate", cell: (iv) => <span title={iv.description || ""}>{iv.description || "—"}</span> },
              { id: "freq", header: "Frequency", cell: (iv) => iv.frequency || "—" },
              { id: "dur", header: "Duration", cell: (iv) => iv.duration || "—" },
              { id: "instr", header: "Instructions", hideBelow: "lg", className: "max-w-70", cell: (iv) => <span title={iv.instructions || ""}>{iv.instructions || "—"}</span> },
            ]}
          />
        </SectionCard>

        <SectionCard title="Version history" icon="History" className="lg:col-span-2">
          <VersionHistory versions={plan.versions} currentId={plan.id} onOpen={onOpenVersion} />
        </SectionCard>
      </div>

      {/* ---- activate confirm ---- */}
      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate plan v{plan.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              This becomes the governing plan for &ldquo;{plan.episode.title}&rdquo;. Any other active or
              under-review version of this episode will be marked revised, and the episode moves to active treatment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-navy-800 hover:bg-navy-900"
              disabled={activateMutation.isPending}
              onClick={(e) => { e.preventDefault(); activateMutation.mutate(); }}
            >
              {activateMutation.isPending ? "Activating…" : "Activate plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- discontinue with reason ---- */}
      <AlertDialog open={discontinueOpen} onOpenChange={setDiscontinueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue plan v{plan.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan is retired. If no other governing plan remains for this episode it falls back to
              &ldquo;awaiting plan&rdquo;. This action is logged for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={discontinueReason}
            onChange={(e) => setDiscontinueReason(e.target.value)}
            placeholder="Reason for discontinuing (required)…"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={discontinueMutation.isPending || !discontinueReason.trim()}
              onClick={(e) => { e.preventDefault(); discontinueMutation.mutate(discontinueReason.trim()); }}
            >
              {discontinueMutation.isPending ? "Discontinuing…" : "Discontinue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
