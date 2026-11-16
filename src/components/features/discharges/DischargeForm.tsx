"use client";
// FEATURE: full-page discharge form — final assessment, baseline comparison, objective outcomes,
// home exercise recommendations, follow-up, outstanding balance info, sign-off workflow
// (draft → pending sign-off → complete/closing the episode).
import { DataTable } from "@/components/molecules/data-table";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney, fullName, initials } from "@/lib/format";
import { DISCHARGE_REASONS, FOLLOW_UP_TYPES, PERMS, labelize } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore, setNavGuard } from "@/stores/app-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { EmptyState } from "@/components/molecules/empty-state";
import { AtomIcon } from "@/components/atoms/icon";
import { changeFor } from "../progress-reviews/types";
import type { ComparisonRow, DischargeDetailResponse } from "../progress-reviews/types";

interface RecommendationRow {
  exerciseName: string;
  instructions: string;
  frequency: string;
  duration: string;
  repetitions: string;
  precautions: string;
  notes: string;
}

interface DischargeFormValues {
  dischargeDate: string;
  reason: string;
  finalAssessment: string;
  baselineComparison: ComparisonRow[];
  objectiveOutcomes: string;
  remainingLimitations: string;
  summary: string;
  followUpType: string;
  followUpDetails: string;
  recommendations: RecommendationRow[];
  therapistSignature: string;
}

const emptyRow: RecommendationRow = { exerciseName: "", instructions: "", frequency: "", duration: "", repetitions: "", precautions: "", notes: "" };

function buildDefaults(data: DischargeDetailResponse, signatureFallback: string): DischargeFormValues {
  const { discharge, baseline } = data;
  return {
    dischargeDate: discharge.dischargeDate ? discharge.dischargeDate.slice(0, 10) : "",
    reason: discharge.reason || "",
    finalAssessment: discharge.finalAssessment || "",
    baselineComparison: (discharge.baselineComparison?.length ? discharge.baselineComparison : baseline.comparison) as ComparisonRow[],
    objectiveOutcomes: discharge.objectiveOutcomes || "",
    remainingLimitations: discharge.remainingLimitations || "",
    summary: discharge.summary || "",
    followUpType: discharge.followUpType || "",
    followUpDetails: discharge.followUpDetails || "",
    recommendations: discharge.recommendations?.length
      ? discharge.recommendations.map((r) => ({
          exerciseName: r.exerciseName || "",
          instructions: r.instructions || "",
          frequency: r.frequency || "",
          duration: r.duration || "",
          repetitions: r.repetitions || "",
          precautions: r.precautions || "",
          notes: r.notes || "",
        }))
      : [],
    therapistSignature: discharge.therapistSignature || signatureFallback,
  };
}

function objectiveSummary(baseline: DischargeDetailResponse["baseline"]): string {
  const objectives = baseline.plan?.objectives || [];
  if (objectives.length === 0) return "No plan objectives were defined for this episode.";
  const achieved = objectives.filter((o) => o.status === "ACHIEVED").length;
  const nla = objectives.filter((o) => o.status === "NLA").length;
  const notAchieved = objectives.filter((o) => o.status === "NOT_ACHIEVED").length;
  const rest = objectives.length - achieved - nla - notAchieved;
  return `${objectives.length} objective${objectives.length === 1 ? "" : "s"} on plan v${baseline.plan?.version}: ${achieved} achieved${notAchieved ? `, ${notAchieved} not achieved` : ""}${nla ? `, ${nla} no longer applicable` : ""}${rest ? `, ${rest} in progress/pending` : ""}.`;
}

export default function DischargeForm({ dischargeId, onBack }: { dischargeId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const detailQuery = useQuery({
    queryKey: ["discharge", dischargeId],
    queryFn: () => apiFetch<DischargeDetailResponse>(`/api/discharges/${dischargeId}`),
  });

  const form = useForm<DischargeFormValues>({
    defaultValues: {
      dischargeDate: "", reason: "", finalAssessment: "", baselineComparison: [], objectiveOutcomes: "",
      remainingLimitations: "", summary: "", followUpType: "", followUpDetails: "", recommendations: [],
      therapistSignature: user?.name || "",
    },
  });

  const data = detailQuery.data;
  useEffect(() => {
    if (data) form.reset(buildDefaults(data, user?.name || ""));
  }, [data]);

  const watchedComparison = useWatch({ control: form.control, name: "baselineComparison" });
  const watchedRecommendations = useWatch({ control: form.control, name: "recommendations" });
  const comparisonArray = useFieldArray({ control: form.control, name: "baselineComparison" });
  const recommendationsArray = useFieldArray({ control: form.control, name: "recommendations" });

  const { discharge, baseline } = data || {};
  const isCompleted = discharge?.status === "COMPLETED";

  const patch = useMutation({
    mutationFn: (opts: { values: DischargeFormValues; action?: "submit" | "back_to_draft" }) =>
      apiFetch<{ discharge: { id: string; status: string } }>(`/api/discharges/${dischargeId}`, {
        method: "PATCH",
        json: {
          ...(opts.action ? { action: opts.action } : {}),
          dischargeDate: opts.values.dischargeDate || undefined,
          reason: opts.values.reason || undefined,
          finalAssessment: opts.values.finalAssessment || null,
          baselineComparison: opts.values.baselineComparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          objectiveOutcomes: opts.values.objectiveOutcomes || null,
          remainingLimitations: opts.values.remainingLimitations || null,
          summary: opts.values.summary || null,
          followUpType: opts.values.followUpType || null,
          followUpDetails: opts.values.followUpDetails || null,
          recommendations: opts.values.recommendations
            .filter((r) => r.exerciseName.trim())
            .map((r) => ({
              exerciseName: r.exerciseName,
              instructions: r.instructions || null,
              frequency: r.frequency || null,
              duration: r.duration || null,
              repetitions: r.repetitions || null,
              precautions: r.precautions || null,
              notes: r.notes || null,
            })),
        },
      }),
    onSuccess: (res, opts) => {
      toast.success(opts.action === "submit" ? "Submitted for sign-off" : opts.action === "back_to_draft" ? "Moved back to draft" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["discharge", dischargeId] });
      qc.invalidateQueries({ queryKey: ["discharges"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not save discharge"),
  });

  const complete = useMutation({
    mutationFn: (values: DischargeFormValues) =>
      apiFetch<{ discharge: { id: string; status: string }; episode: { id: string; status: string } }>(`/api/discharges/${dischargeId}/complete`, {
        method: "POST",
        json: {
          dischargeDate: values.dischargeDate || undefined,
          reason: values.reason || undefined,
          finalAssessment: values.finalAssessment || null,
          baselineComparison: values.baselineComparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          objectiveOutcomes: values.objectiveOutcomes || null,
          remainingLimitations: values.remainingLimitations || null,
          summary: values.summary || null,
          followUpType: values.followUpType || null,
          followUpDetails: values.followUpDetails || null,
          recommendations: values.recommendations
            .filter((r) => r.exerciseName.trim())
            .map((r) => ({
              exerciseName: r.exerciseName,
              instructions: r.instructions || null,
              frequency: r.frequency || null,
              duration: r.duration || null,
              repetitions: r.repetitions || null,
              precautions: r.precautions || null,
              notes: r.notes || null,
            })),
          therapistSignature: values.therapistSignature,
        },
      }),
    onSuccess: () => {
      toast.success("Discharge completed — treatment episode closed");
      qc.invalidateQueries({ queryKey: ["discharge", dischargeId] });
      qc.invalidateQueries({ queryKey: ["discharges"] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not complete discharge"),
  });

  // ---- unsaved-changes protection (back button, breadcrumb, sidebar, tab close) ----
  const dirty = form.formState.isDirty && !isCompleted;
  const requestLeave = () => { if (dirty) setLeaveOpen(true); else onBack(); };
  const finishLeave = () => {
    setLeaveOpen(false);
    setNavGuard(null);
    const go = pendingLeave.current;
    pendingLeave.current = null;
    if (go) go(); else onBack();
  };
  useEffect(() => {
    if (!dirty) return;
    setNavGuard((proceed) => { pendingLeave.current = proceed; setLeaveOpen(true); return true; });
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", h); };
  }, [dirty]);

  const handleComplete = () => {
    const values = form.getValues();
    if (!values.therapistSignature || values.therapistSignature.trim().length < 2) {
      toast.error("A therapist signature is required to complete the discharge");
      return;
    }
    complete.mutate(values);
  };

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !data || !discharge || !baseline) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Discharge record not found"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : "This discharge record could not be loaded."}
        action={<Button variant="outline" onClick={onBack}>Back to discharges</Button>}
      />
    );
  }

  const outstanding = baseline.outstanding;
  const editable = !isCompleted && canManage;

  return (
    <div className="space-y-5">
      <PageBreadcrumb items={[{ label: "Discharges", onClick: requestLeave }, { label: `Discharge — ${fullName(discharge.patient)}` }]} />
      <PageHeader
        title="Discharge"
        description="Final assessment, outcomes, home programme and episode closure"
        icon="LogOut"
      />

      {/* Summary card */}
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(fullName(discharge.patient))}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0"><button type="button" title="Open patient profile" className="truncate text-left text-lg font-semibold tracking-tight transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: discharge.patientId })}>{fullName(discharge.patient)}</button></h2>
                <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{discharge.patient.patientCode}</span>
                <StatusBadge status={discharge.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{discharge.episode.title}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
            {[
              { l: "Sessions", v: String(baseline.episode.totalCompletedSessions) },
              { l: "Discharge date", v: discharge.dischargeDate ? formatDate(discharge.dischargeDate) : "—" },
              { l: "Reason", v: discharge.reason || "—" },
              { l: "Episode", v: labelize(discharge.episode.status) },
            ].map((x) => (
              <div key={x.l} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.l}</dt>
                <dd className="truncate text-sm font-semibold">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {isCompleted ? (
          <div className="mt-4 flex justify-end border-t pt-3 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <AtomIcon name="Printer" className="mr-2 h-4 w-4" />Print record
            </Button>
          </div>
        ) : null}
      </div>

      {/* Outstanding balance — informational only (never blocks discharge) */}
      <div className={`rounded-lg border px-4 py-3 ${outstanding.outstandingCents > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AtomIcon name="Receipt" className="h-4 w-4" />
            Outstanding balance: {formatMoney(outstanding.outstandingCents)}
            {outstanding.invoiceCount > 0 ? ` (${outstanding.invoiceCount} unpaid/partial invoice${outstanding.invoiceCount === 1 ? "" : "s"})` : " — no outstanding invoices"}
          </p>
          <p className="text-xs">Outstanding payments do not block discharge — the balance remains collectable via billing.</p>
        </div>
        {outstanding.invoices.length > 0 ? (
          <p className="mt-1.5 text-xs opacity-80">
            {outstanding.invoices.map((i) => `${i.invoiceNumber}: ${formatMoney(Math.max(0, i.totalCents - i.paidCents))} due`).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
      {/* Final clinical assessment */}
      <section className="space-y-2">
        <SectionCard title="Final assessment" icon="ClipboardCheck">
          {isCompleted ? (
            <p className="whitespace-pre-line text-sm">{discharge.finalAssessment || "—"}</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="finalAssessment">Summary of final clinical status at discharge</Label>
              <Textarea id="finalAssessment" rows={4} placeholder="Final presenting status, response to the episode of care, discharge judgement…" {...form.register("finalAssessment")} />
            </div>
          )}
        </SectionCard>
      </section>

      {/* Baseline comparison */}
      <section className="space-y-2">
        <SectionCard title="Baseline vs final" icon="GitCompareArrows" description="Prefilled from the initial assessment — record the final value of each metric">
          {comparisonArray.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comparison metrics — complete an initial assessment to prefill this table.</p>
          ) : (
            <DataTable
              bare
              bordered
              maxHeight="max-h-96"
              minWidth="min-w-136"
              rows={comparisonArray.fields}
              rowKey={(f) => f.id}
              columns={[
                { id: "metric", header: "Metric", className: "min-w-56", cell: (_f, idx) => <span className="font-medium">{watchedComparison?.[idx]?.metric}</span> },
                { id: "baseline", header: "Baseline", className: "w-32", cell: (_f, idx) => watchedComparison?.[idx]?.baseline },
                {
                  id: "current", header: isCompleted ? "Final" : "Final (edit)", className: "w-36",
                  cell: (_f, idx) => isCompleted ? watchedComparison?.[idx]?.current || "—" : <Input placeholder="e.g. 120°" {...form.register(`baselineComparison.${idx}.current` as const)} />,
                },
                {
                  id: "change", header: "Change", className: "w-36",
                  cell: (_f, idx) => {
                    const change = changeFor(watchedComparison?.[idx]);
                    return (
                      <span className={change.tone === "success" ? "text-xs font-medium text-emerald-600" : change.tone === "danger" ? "text-xs font-medium text-rose-600" : "text-xs text-muted-foreground"}>
                        {change.text}
                      </span>
                    );
                  },
                },
              ]}
            />
          )}
        </SectionCard>
      </section>

      {/* Objective outcomes */}
      <section className="space-y-2">
        <SectionCard title="Objective outcomes" icon="Target" description={objectiveSummary(baseline)}>
          {baseline.plan && baseline.plan.objectives.length > 0 ? (
            <ul className="mb-3 space-y-1.5">
              {baseline.plan.objectives.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <span className="font-medium">{o.description}</span>
                  <span className="text-muted-foreground">{o.baseline || "—"} → {o.target || "—"} {o.unit || ""}</span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          ) : null}
          <Separator className="my-3" />
          {isCompleted ? (
            <p className="whitespace-pre-line text-sm">{discharge.objectiveOutcomes || "—"}</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="objectiveOutcomes">Outcome narrative</Label>
              <Textarea id="objectiveOutcomes" rows={3} placeholder="Describe to what extent each objective was achieved…" {...form.register("objectiveOutcomes")} />
            </div>
          )}
        </SectionCard>
      </section>

      {/* Home exercise recommendations */}
      <section className="flex flex-1 flex-col">
        <SectionCard
          className="flex-1"
          title="Home programme"
          icon="Dumbbell"
          description="Exercises and advice for the patient to continue at home"
          actions={
            editable ? (
              <Button variant="outline" size="sm" onClick={() => recommendationsArray.append({ ...emptyRow })}>
                <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" />
                Add exercise
              </Button>
            ) : undefined
          }
        >
          {recommendationsArray.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No home exercise recommendations recorded.</p>
          ) : (
            <div className="space-y-3">
              {recommendationsArray.fields.map((f, idx) => {
                const row = watchedRecommendations?.[idx];
                return (
                  <div key={f.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{idx + 1}. {row?.exerciseName || <span className="text-muted-foreground">Unnamed exercise</span>}</p>
                      {editable ? (
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => recommendationsArray.remove(idx)}>
                          <AtomIcon name="Trash2" className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {isCompleted ? (
                      <DetailGrid cols={3}>
                        <DetailRow label="Instructions" value={row?.instructions || "—"} />
                        <DetailRow label="Frequency" value={row?.frequency || "—"} />
                        <DetailRow label="Duration" value={row?.duration || "—"} />
                        <DetailRow label="Repetitions" value={row?.repetitions || "—"} />
                        <DetailRow label="Precautions" value={row?.precautions || "—"} />
                        <DetailRow label="Notes" value={row?.notes || "—"} />
                      </DetailGrid>
                    ) : (
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 *:min-w-0">
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                          <Label>Exercise name</Label>
                          <Input placeholder="e.g. Quad stick gait practice" {...form.register(`recommendations.${idx}.exerciseName` as const)} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Instructions</Label>
                          <Input placeholder="How to perform…" {...form.register(`recommendations.${idx}.instructions` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Frequency</Label>
                          <Input placeholder="e.g. Daily" {...form.register(`recommendations.${idx}.frequency` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Duration</Label>
                          <Input placeholder="e.g. 4 weeks" {...form.register(`recommendations.${idx}.duration` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Repetitions</Label>
                          <Input placeholder="e.g. 3 × 10" {...form.register(`recommendations.${idx}.repetitions` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Precautions</Label>
                          <Input placeholder="e.g. Stop if pain > 4/10" {...form.register(`recommendations.${idx}.precautions` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Input placeholder="Optional…" {...form.register(`recommendations.${idx}.notes` as const)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
      {/* Remaining limitations + summary */}
      <section className="space-y-2">
        <div className="grid gap-4 *:min-w-0">
          <SectionCard title="Remaining limitations" icon="AlertCircle">
            {isCompleted ? (
              <p className="whitespace-pre-line text-sm">{discharge.remainingLimitations || "—"}</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="remainingLimitations">Limitations remaining at discharge</Label>
                <Textarea id="remainingLimitations" rows={4} placeholder="e.g. End-range stiffness, occasional pain on stairs…" {...form.register("remainingLimitations")} />
              </div>
            )}
          </SectionCard>
          <SectionCard title="Discharge summary" icon="FileText">
            {isCompleted ? (
              <p className="whitespace-pre-line text-sm">{discharge.summary || "—"}</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="summary">Overall episode summary</Label>
                <Textarea id="summary" rows={4} placeholder="Course of treatment, interventions used, outcome and handover notes…" {...form.register("summary")} />
              </div>
            )}
          </SectionCard>
        </div>
      </section>
      {/* Follow-up */}
      <section>
        <SectionCard title="Follow-up plan" icon="PhoneCall" description="Optional — arrange a follow-up after discharge">
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Follow-up type" value={discharge.followUpType ? labelize(discharge.followUpType) : "None"} />
              <DetailRow label="Details" value={discharge.followUpDetails} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
              <Controller
                control={form.control}
                name="followUpType"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <Label>Follow-up type</Label>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
              <div className="space-y-1.5">
                <Label htmlFor="followUpDetails">Follow-up details</Label>
                <Input id="followUpDetails" placeholder="e.g. Clinic review in 6 weeks…" {...form.register("followUpDetails")} />
              </div>
            </div>
          )}
        </SectionCard>
      </section>
      {/* Sign-off */}
      <section className="flex flex-1 flex-col">
        <SectionCard className="flex-1" title="Therapist sign-off" icon="Signature" description={isCompleted ? `Completed ${formatDate(discharge.completedAt)}` : "Workflow: save draft → submit for sign-off → complete (closes the episode)"}>
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Signature" value={discharge.therapistSignature} />
              <DetailRow label="Completed at" value={formatDate(discharge.completedAt)} />
              <DetailRow label="Reason" value={<Badge variant="outline">{discharge.reason}</Badge>} />
              <DetailRow label="Episode status" value={<StatusBadge status={discharge.episode.status} />} />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
                <div className="space-y-1.5">
                  <Label htmlFor="reason">Discharge reason</Label>
                  <Controller
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={discharge.reason || "Select a reason…"} /></SelectTrigger>
                        <SelectContent>
                          {DISCHARGE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dischargeDate">Discharge date</Label>
                  <Input id="dischargeDate" type="date" {...form.register("dischargeDate")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="therapistSignature">Therapist signature (required to complete)</Label>
                  <Input id="therapistSignature" placeholder="Type your full name to sign" {...form.register("therapistSignature")} />
                </div>
              </div>
              {editable ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {discharge.status === "DRAFT" ? (
                    <>
                      <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues() })}>Save draft</Button>
                      <Button
                        variant="outline"
                        disabled={patch.isPending}
                        onClick={() => {
                          const values = form.getValues();
                          if (!values.reason) { toast.error("Select a discharge reason before submitting"); return; }
                          patch.mutate({ values, action: "submit" });
                        }}
                      >
                        Submit for sign-off
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues(), action: "back_to_draft" })}>Back to draft</Button>
                  )}
                  <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <Button onClick={() => setConfirmOpen(true)} disabled={complete.isPending}>Complete discharge</Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Complete this discharge?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will close the treatment episode ({discharge.episode.title}) and set the patient status to discharged. The record will be locked as final. Outstanding payments ({formatMoney(outstanding.outstandingCents)}) remain collectable and do not block this action.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleComplete} disabled={complete.isPending}>
                          {complete.isPending ? "Completing…" : "Complete discharge"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </>
          )}
        </SectionCard>
      </section>
        </div>
      </div>

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this discharge?</DialogTitle>
            <DialogDescription>You have unsaved changes. Save a draft to keep them, or leave and discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
            {discharge.status === "DRAFT" && editable ? (
              <Button disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues() }, { onSuccess: finishLeave })}>
                {patch.isPending ? "Saving…" : "Save draft & leave"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
