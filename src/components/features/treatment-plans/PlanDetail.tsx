"use client";
// FEATURE: Treatment plan detail — header actions + schedule/objectives/milestones/interventions/precautions/versions
import { useMemo, useState } from "react";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
import type { PlanObjectiveDto, PlanVersionDto } from "./types";

const PRIORITY_TONE: Record<string, string> = {
  HIGH: "bg-rose-50 text-rose-700 border-rose-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

function ObjectiveRow({ objective }: { objective: PlanObjectiveDto }) {
  const hasMeasure = objective.baseline || objective.target;
  return (
    <div className="rounded-lg border bg-white/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{objective.description}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {objective.priority ? (
            <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${PRIORITY_TONE[objective.priority] || ""}`}>
              {objective.priority}
            </Badge>
          ) : null}
          <StatusBadge status={objective.status} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {hasMeasure ? (
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-slate-500">{objective.baseline || "—"}</span>
            <AtomIcon name="ArrowRight" className="h-3 w-3" />
            <span className="font-semibold text-teal-700">{objective.target || "—"}</span>
            {objective.unit ? <span className="text-slate-400">{objective.unit}</span> : null}
          </span>
        ) : null}
        {objective.expectedDate ? (
          <span className="inline-flex items-center gap-1">
            <AtomIcon name="CalendarDays" className="h-3 w-3" /> due {formatDate(objective.expectedDate)}
          </span>
        ) : null}
      </div>
      {objective.notes ? <p className="mt-1.5 text-xs text-muted-foreground italic">{objective.notes}</p> : null}
    </div>
  );
}

function VersionHistory({ versions, currentId, onOpen }: {
  versions: PlanVersionDto[];
  currentId: string;
  onOpen: (id: string) => void;
}) {
  const ordered = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions]);
  const versionLabel = (id: string) => {
    const v = versions.find((x) => x.id === id);
    return v ? `v${v.version}` : "earlier version";
  };
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {ordered.map((v) => {
        const isCurrent = v.id === currentId;
        return (
          <li key={v.id} className="relative">
            <span
              className={`absolute -left-[26px] top-2 h-2.5 w-2.5 rounded-full border-2 ${
                isCurrent ? "border-teal-600 bg-teal-500" : "border-slate-300 bg-white"
              }`}
            />
            <button
              type="button"
              onClick={() => onOpen(v.id)}
              className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                isCurrent ? "border-teal-200 bg-teal-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className="text-sm font-semibold text-foreground">v{v.version}</span>
              <StatusBadge status={v.status} />
              {isCurrent ? <Badge className="bg-teal-600 text-[10px] text-white">Viewing</Badge> : null}
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
              {v.activatedAt ? (
                <span className="w-full text-xs text-muted-foreground">
                  <AtomIcon name="Zap" className="mr-1 inline h-3 w-3 text-amber-500" />
                  activated {relativeTime(v.activatedAt)}
                </span>
              ) : null}
              {v.revisedFromId ? (
                <span className="w-full text-xs text-slate-500">
                  <AtomIcon name="GitBranch" className="mr-1 inline h-3 w-3" />
                  revised from {versionLabel(v.revisedFromId)}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

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
      {/* ---- header ---- */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={onBack} aria-label="Back to plans">
              <AtomIcon name="ArrowLeft" className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {fullName(plan.episode.patient)}
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
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => setActivateOpen(true)}
                disabled={activateMutation.isPending}
              >
                <AtomIcon name="Zap" className="mr-1.5 h-4 w-4" /> Activate
              </Button>
            ) : null}
            {canRevise ? (
              <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={onRevise}>
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
          {plan.interventions.length === 0 ? (
            <EmptyStateCompact message="No interventions defined" />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Intervention</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="hidden lg:table-cell">Instructions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.interventions.map((iv) => (
                    <TableRow key={iv.id}>
                      <TableCell className="font-medium text-foreground">{iv.name}</TableCell>
                      <TableCell className="hidden max-w-[260px] truncate md:table-cell" title={iv.description || ""}>
                        {iv.description || "—"}
                      </TableCell>
                      <TableCell>{iv.frequency || "—"}</TableCell>
                      <TableCell>{iv.duration || "—"}</TableCell>
                      <TableCell className="hidden max-w-[280px] lg:table-cell" title={iv.instructions || ""}>
                        {iv.instructions || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
              className="bg-teal-600 hover:bg-teal-700"
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
