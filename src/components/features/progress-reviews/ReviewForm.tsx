"use client";
// FEATURE: full-page progress review form — baseline context (A), updated assessment (B),
// baseline comparison (C), objective evaluation (D), summary (E), decision (F), sign & complete (G).
import { DataTable } from "@/components/molecules/data-table";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Controller, useForm, useFieldArray, useWatch } from "react-hook-form";
import { apiFetch } from "@/lib/api-client";
import { formatDate, fullName, initials } from "@/lib/format";
import { REVIEW_DECISIONS, REVIEW_RESULT_STATUSES, labelize, PERMS } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore, setNavGuard } from "@/stores/app-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { EmptyState } from "@/components/molecules/empty-state";
import { DECISION_TONE, changeFor } from "./types";
import type { ClinicalBaseline, ComparisonRow, ObjectiveResultDto, ReviewDetailResponse } from "./types";

interface ObjectiveResultRow {
  objectiveId: string;
  objectiveDescription: string;
  baseline: string;
  target: string;
  current: string;
  result: string;
  notes: string;
}

interface ReviewFormValues {
  painCurrent: number | null;
  painWorst: number | null;
  romSummary: string;
  strengthSummary: string;
  functionalSummary: string;
  vitals: string;
  newFindings: string;
  comparison: ComparisonRow[];
  improvements: string;
  deterioration: string;
  patientResponse: string;
  observations: string;
  recommendations: string;
  decision: string;
  decisionNotes: string;
  therapistSignature: string;
  objectiveResults: ObjectiveResultRow[];
}

function defaultResultFor(objectiveStatus: string): string {
  if (objectiveStatus === "ACHIEVED") return "ACHIEVED";
  if (objectiveStatus === "NLA") return "NLA";
  if (objectiveStatus === "IN_PROGRESS") return "PARTIALLY_ACHIEVED";
  return "NOT_ACHIEVED";
}

function buildDefaults(data: ReviewDetailResponse, signatureFallback: string): ReviewFormValues {
  const { review, baseline } = data;
  const savedResults = review.objectiveResults || [];
  const objectiveResults: ObjectiveResultRow[] = (baseline.plan?.objectives || []).map((o) => {
    const saved = savedResults.find((r) => r.objectiveId === o.id);
    return saved
      ? {
          objectiveId: saved.objectiveId,
          objectiveDescription: saved.objectiveDescription,
          baseline: saved.baseline || "",
          target: saved.target || "",
          current: saved.current || "",
          result: saved.result,
          notes: saved.notes || "",
        }
      : {
          objectiveId: o.id,
          objectiveDescription: o.description,
          baseline: o.baseline || "",
          target: o.target || "",
          current: "",
          result: defaultResultFor(o.status),
          notes: "",
        };
  });
  return {
    painCurrent: review.painCurrent,
    painWorst: review.painWorst,
    romSummary: review.romSummary || "",
    strengthSummary: review.strengthSummary || "",
    functionalSummary: review.functionalSummary || "",
    vitals: review.vitals || "",
    newFindings: review.newFindings || "",
    comparison: (review.comparison?.length ? review.comparison : baseline.comparison) as ComparisonRow[],
    improvements: review.improvements || "",
    deterioration: review.deterioration || "",
    patientResponse: review.patientResponse || "",
    observations: review.observations || "",
    recommendations: review.recommendations || "",
    decision: review.decision || "",
    decisionNotes: review.decisionNotes || "",
    therapistSignature: review.therapistSignature || signatureFallback,
    objectiveResults,
  };
}

// ---------- Read-only section A: previous clinical info ----------
// Colour-codes a 0–10 pain score: green (none/mild) → amber (moderate) → red (severe)
function painTone(v: number | null | undefined): { box: string; text: string; label: string } {
  if (v === null || v === undefined) return { box: "border-slate-200 bg-slate-50", text: "text-slate-500", label: "Not recorded" };
  if (v === 0) return { box: "border-emerald-200 bg-emerald-50", text: "text-emerald-700", label: "No pain" };
  if (v <= 3) return { box: "border-lime-200 bg-lime-50", text: "text-lime-700", label: "Mild" };
  if (v <= 6) return { box: "border-amber-200 bg-amber-50", text: "text-amber-700", label: "Moderate" };
  if (v <= 8) return { box: "border-orange-200 bg-orange-50", text: "text-orange-700", label: "Severe" };
  return { box: "border-red-200 bg-red-50", text: "text-red-700", label: "Very severe" };
}
function PainChip({ label, value }: { label: string; value: number | null | undefined }) {
  const t = painTone(value);
  return (
    <span title={t.label} className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className={`font-semibold ${t.text}`}>{value === null || value === undefined ? "—" : `${value}/10`}</span>
    </span>
  );
}

function BaselineSection({ baseline }: { baseline: ClinicalBaseline }) {
  const a = baseline.assessment;
  const plan = baseline.plan;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 *:min-w-0">
        <SectionCard title="Initial assessment summary" icon="ClipboardList" description={a ? formatDate(a.assessmentDate) : "No completed assessment yet"}>
          {a ? (
            <div className="space-y-1">
              <DetailRow label="Primary complaint" value={a.primaryComplaint} />
              <DetailRow label="Body part / side" value={[a.bodyPart, a.affectedSide && labelize(a.affectedSide)].filter(Boolean).join(" · ") || "—"} />
              <DetailRow label="Duration / onset" value={[a.duration, labelize(a.onset)].filter(Boolean).join(" · ") || "—"} />
              <DetailRow label="Cause" value={a.cause} />
              <DetailRow label="Aggravating / relieving" value={[a.aggravating, a.relieving].filter(Boolean).join("  |  ") || "—"} />
              <DetailRow
                label="Pain"
                value={
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <PainChip label="Current" value={a.pain.current} />
                    <PainChip label="Worst" value={a.pain.worst} />
                    <PainChip label="Lowest" value={a.pain.lowest} />
                  </span>
                }
              />
              <DetailRow label="Vitals" value={[
                a.vitals.bloodPressure, a.vitals.heartRate && `${a.vitals.heartRate} bpm`, a.vitals.weightKg && `${a.vitals.weightKg} kg`, a.vitals.heightCm && `${a.vitals.heightCm} cm`,
              ].filter(Boolean).join(" · ") || "—"} />
              <DetailRow label="Clinical findings" value={a.clinicalFindings} />
              <DetailRow label="Clinical impression" value={a.clinicalImpression} />
              <DetailRow label="Impairments" value={a.impairments} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">The review can proceed without an initial assessment baseline.</p>
          )}
        </SectionCard>

        <SectionCard title="Diagnosis" icon="Stethoscope">
          {baseline.diagnoses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active diagnoses recorded.</p>
          ) : (
            <div className="space-y-3">
              {baseline.diagnoses.map((d) => (
                <div key={d.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{d.title}</p>
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-xs">{labelize(d.category)}</Badge>
                      {d.severity ? <StatusBadge status={d.severity} /> : null}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{[d.bodyPart, d.affectedSide && labelize(d.affectedSide)].filter(Boolean).join(" · ")}</p>
                  {d.explanation ? <p className="mt-1.5 text-xs text-foreground/80">{d.explanation}</p> : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Baseline measurements" icon="Ruler" description={a ? "From the initial assessment — compare against current values in Baseline vs current" : undefined}>
        {a ? (
          <div className="grid gap-4 lg:grid-cols-3 *:min-w-0">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ROM</p>
              {a.rom.length === 0 ? <p className="text-xs text-muted-foreground">None recorded</p> : (
                <ul className="space-y-1.5">
                  {a.rom.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{r.bodyPart} {r.movement} ({labelize(r.side)})</span>
                      <span className="shrink-0 font-medium">A: {r.active ?? "—"}° · P: {r.passive ?? "—"}°</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strength (MRC)</p>
              {a.strength.length === 0 ? <p className="text-xs text-muted-foreground">None recorded</p> : (
                <ul className="space-y-1.5">
                  {a.strength.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{s.muscleGroup} ({labelize(s.side)})</span>
                      <span className="shrink-0 font-medium">Grade {s.grade}/5</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Function</p>
              {a.functional.length === 0 ? <p className="text-xs text-muted-foreground">None recorded</p> : (
                <ul className="space-y-1.5">
                  {a.functional.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span>{f.activity}</span>
                      <span className="font-medium">{f.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No measurements recorded on the initial assessment.</p>
        )}
      </SectionCard>

      <SectionCard
        title={`Current treatment plan${plan ? ` — v${plan.version}` : ""}`}
        icon="Map"
        description={plan ? `${labelize(plan.status)} · ${plan.sessionsPerWeek ?? "—"}x/week · ${plan.expectedTotalSessions ?? "—"} expected sessions` : "No plan on this episode"}
      >
        {plan ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objectives (baseline → target)</p>
              {plan.objectives.length === 0 ? <p className="text-xs text-muted-foreground">No objectives defined.</p> : (
                <ul className="space-y-1.5">
                  {plan.objectives.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                      <span className="font-medium">{o.description}</span>
                      <span className="text-muted-foreground">{o.baseline || "—"} → {o.target || "—"} {o.unit || ""}</span>
                      <StatusBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {plan.milestones.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Milestones</p>
                <ul className="space-y-1.5">
                  {plan.milestones.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                      <span className="font-medium">{m.description}</span>
                      <span className="text-muted-foreground">Expected {formatDate(m.expectedDate)}</span>
                      <StatusBadge status={m.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {baseline.previousReviews.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous reviews</p>
                <ul className="space-y-1.5">
                  {baseline.previousReviews.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                      <span>{formatDate(r.reviewDate)} · after {r.triggerSessions} sessions</span>
                      {r.decision ? <Badge variant="outline" className={DECISION_TONE[r.decision]}>{labelize(r.decision)}</Badge> : <StatusBadge status={r.status} />}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No treatment plan has been created for this episode yet.</p>
        )}
      </SectionCard>
    </div>
  );
}

export default function ReviewForm({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const detailQuery = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => apiFetch<ReviewDetailResponse>(`/api/reviews/${reviewId}`),
  });

  const form = useForm<ReviewFormValues>({
    defaultValues: {
      painCurrent: null, painWorst: null, romSummary: "", strengthSummary: "", functionalSummary: "",
      vitals: "", newFindings: "", comparison: [], improvements: "", deterioration: "", patientResponse: "",
      observations: "", recommendations: "", decision: "", decisionNotes: "", therapistSignature: user?.name || "", objectiveResults: [],
    },
  });

  const data = detailQuery.data;
  useEffect(() => {
    if (data) form.reset(buildDefaults(data, user?.name || ""));
  }, [data]);

  const comparisonArray = useFieldArray({ control: form.control, name: "comparison" });
  const resultsArray = useFieldArray({ control: form.control, name: "objectiveResults" });

  const { review, baseline } = data || {};
  const isCompleted = review?.status === "COMPLETED";

  const saveDraft = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      apiFetch(`/api/reviews/${reviewId}`, {
        method: "PATCH",
        json: {
          painCurrent: values.painCurrent,
          painWorst: values.painWorst,
          romSummary: values.romSummary || null,
          strengthSummary: values.strengthSummary || null,
          functionalSummary: values.functionalSummary || null,
          vitals: values.vitals || null,
          newFindings: values.newFindings || null,
          comparison: values.comparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          improvements: values.improvements || null,
          deterioration: values.deterioration || null,
          patientResponse: values.patientResponse || null,
          observations: values.observations || null,
          recommendations: values.recommendations || null,
          decision: values.decision || null,
          decisionNotes: values.decisionNotes || null,
          objectiveResults: values.objectiveResults.map((r) => ({
            objectiveId: r.objectiveId,
            objectiveDescription: r.objectiveDescription,
            baseline: r.baseline || null,
            target: r.target || null,
            current: r.current || null,
            result: r.result,
            notes: r.notes || null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["review", reviewId] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not save draft"),
  });

  const complete = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      apiFetch(`/api/reviews/${reviewId}/complete`, {
        method: "POST",
        json: {
          painCurrent: values.painCurrent,
          painWorst: values.painWorst,
          romSummary: values.romSummary || null,
          strengthSummary: values.strengthSummary || null,
          functionalSummary: values.functionalSummary || null,
          vitals: values.vitals || null,
          newFindings: values.newFindings || null,
          comparison: values.comparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          improvements: values.improvements || null,
          deterioration: values.deterioration || null,
          patientResponse: values.patientResponse || null,
          observations: values.observations || null,
          recommendations: values.recommendations || null,
          decision: values.decision,
          decisionNotes: values.decisionNotes || null,
          therapistSignature: values.therapistSignature,
          objectiveResults: values.objectiveResults.map((r) => ({
            objectiveId: r.objectiveId,
            objectiveDescription: r.objectiveDescription,
            baseline: r.baseline || null,
            target: r.target || null,
            current: r.current || null,
            result: r.result,
            notes: r.notes || null,
          })),
        },
      }),
    onSuccess: (_data, values) => {
      toast.success("Review completed — review counter reset");
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review", reviewId] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
      setNavGuard(null);
      const episodeId = review?.episodeId;
      if (values.decision === "REVISE_PLAN" && episodeId) {
        navigate("treatment-plans", { episodeId, focusTab: "revise" });
      } else if (values.decision === "DISCHARGE" && episodeId) {
        navigate("discharges", { episodeId });
      } else {
        onBack();
      }
    },
    onError: (err: Error) => toast.error(err.message || "Could not complete review"),
  });

  const decision = useWatch({ control: form.control, name: "decision" });
  const watchedComparison = useWatch({ control: form.control, name: "comparison" });
  const watchedResults = useWatch({ control: form.control, name: "objectiveResults" });

  const handleSubmitComplete = () => {
    const values = form.getValues();
    if (!values.decision) { toast.error("Select a review decision before completing"); return; }
    if (!values.therapistSignature || values.therapistSignature.trim().length < 2) { toast.error("Enter your signature before completing"); return; }
    complete.mutate(values);
  };

  // ---- unsaved-changes protection (back button, breadcrumb, sidebar, tab close) ----
  const dirty = form.formState.isDirty && data?.review?.status !== "COMPLETED";
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

  const sessionPct = useMemo(() => {
    if (!review) return 0;
    const threshold = review.episode.reviewThreshold || 15;
    return Math.min(100, Math.round((review.episode.sessionsSinceReview / threshold) * 100));
  }, [review]);

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !data || !review || !baseline) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Review not found"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : "This progress review could not be loaded."}
        action={<Button variant="outline" onClick={onBack}>Back to reviews</Button>}
      />
    );
  }

  const decisionBadge = review.decision ? (
    <Badge variant="outline" className={DECISION_TONE[review.decision]}>{labelize(review.decision)}</Badge>
  ) : null;

  return (
    <div className="space-y-5">
      <PageBreadcrumb items={[{ label: "Progress Reviews", onClick: requestLeave }, { label: `Review — ${fullName(review.episode.patient)}` }]} />
      <PageHeader
        title="Progress review"
        description="Re-assessment, objective evaluation and review decision"
        icon="TrendingUp"
      />

      {/* Summary card */}
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(fullName(review.episode.patient))}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0"><button type="button" title="Open patient profile" className="truncate text-left text-lg font-semibold tracking-tight transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: review.episode.patient.id })}>{fullName(review.episode.patient)}</button></h2>
                <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{review.episode.patient.patientCode}</span>
                <StatusBadge status={review.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{review.episode.title}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
            {[
              { l: "Trigger", v: `After ${review.triggerSessions} sessions` },
              { l: "Since last review", v: `${review.episode.sessionsSinceReview}/${review.episode.reviewThreshold}` },
              { l: "Therapist", v: review.episode.therapist ? fullName(review.episode.therapist) : "—" },
              { l: "Decision", v: review.decision ? labelize(review.decision) : "Pending" },
            ].map((x) => (
              <div key={x.l} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.l}</dt>
                <dd className="truncate text-sm font-semibold">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {!isCompleted && review.episode.reviewDue ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertTitle>Threshold review due</AlertTitle>
          <AlertDescription>
            This episode has reached {review.episode.sessionsSinceReview}/{review.episode.reviewThreshold} sessions since the last review. Completing this review resets the counter to 0.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
      {/* A — Previous clinical info (read-only) */}
      <section className="space-y-2">
        <BaselineSection baseline={baseline} />
      </section>

      {/* F — Review decision */}
      <section className="space-y-2">
        <SectionCard title="Decision" icon="Scale">
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Decision" value={decisionBadge} />
              <DetailRow label="Decision notes" value={review.decisionNotes} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
                <Controller
                  control={form.control}
                  name="decision"
                  render={({ field }) => (
                    <div className="space-y-1.5">
                      <Label>Decision</Label>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a decision…" /></SelectTrigger>
                        <SelectContent>
                          {REVIEW_DECISIONS.map((d) => <SelectItem key={d} value={d}>{labelize(d)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="decisionNotes">Decision notes</Label>
                  <Input id="decisionNotes" placeholder="Optional notes supporting this decision…" {...form.register("decisionNotes")} />
                </div>
              </div>
              {decision === "REVISE_PLAN" ? (
                <Alert className="border-sky-200 bg-sky-50 text-sky-800">
                  <AlertTitle>Plan revision expected</AlertTitle>
                  <AlertDescription>After completing, you will be taken to Treatment Plans to create the revised plan for this episode.</AlertDescription>
                </Alert>
              ) : null}
              {decision === "DISCHARGE" ? (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800">
                  <AlertTitle>Discharge workflow next</AlertTitle>
                  <AlertDescription>After completing, you will be taken to Discharges to start the discharge record for this episode.</AlertDescription>
                </Alert>
              ) : null}
              {decision === "REFER" ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                  <AlertTitle>Referral</AlertTitle>
                  <AlertDescription>Record the referral details in the decision notes and recommendations above.</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </SectionCard>
      </section>

      {/* C — Baseline comparison */}
      <section className="flex flex-1 flex-col">
        <SectionCard className="flex-1" title="Baseline vs current" icon="GitCompareArrows" description="Prefilled from the initial assessment (and chained from the previous review) — record the current value of each metric">
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
                  id: "current", header: isCompleted ? "Current" : "Current (edit)", className: "w-36",
                  cell: (_f, idx) => isCompleted ? watchedComparison?.[idx]?.current || "—" : <Input placeholder="e.g. 90°" {...form.register(`comparison.${idx}.current` as const)} />,
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

        </div>
        <div className="flex min-w-0 flex-col gap-4">
      {/* D — Objective & milestone evaluation */}
      <section className="flex flex-col gap-4">
        <SectionCard title="Objective evaluation" icon="Target" description="Record current value and result per plan objective — completing the review updates objective statuses on the plan">
          {resultsArray.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plan objectives to evaluate.</p>
          ) : (
            <div className="space-y-3">
              {resultsArray.fields.map((f, idx) => {
                const row = watchedResults?.[idx];
                return (
                  <div key={f.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row?.objectiveDescription}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Baseline: {row?.baseline || "—"} → Target: {row?.target || "—"}</p>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    {isCompleted ? (
                      <DetailGrid cols={3}>
                        <DetailRow label="Current" value={row?.current || "—"} />
                        <DetailRow label="Result" value={<StatusBadge status={row?.result} />} />
                        <DetailRow label="Notes" value={row?.notes || "—"} />
                      </DetailGrid>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 *:min-w-0">
                        <div className="space-y-1.5">
                          <Label>Current value</Label>
                          <Input placeholder="e.g. 120°" {...form.register(`objectiveResults.${idx}.current` as const)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Result</Label>
                          <Controller
                            control={form.control}
                            name={`objectiveResults.${idx}.result` as const}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {REVIEW_RESULT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Notes</Label>
                          <Input placeholder="Optional notes…" {...form.register(`objectiveResults.${idx}.notes` as const)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
        {baseline.plan && baseline.plan.milestones.length > 0 ? (
          <SectionCard title="Milestone quick status" icon="Flag" description="Current milestone statuses on the active plan">
            <ul className="space-y-1.5">
              {baseline.plan.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{m.description}</span>
                  <span className="text-xs text-muted-foreground">Expected {formatDate(m.expectedDate)}</span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </section>

      {/* E — Therapist summary */}
      <section className="space-y-2">
        <SectionCard title="Clinical summary" icon="NotebookPen">
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Improvements" value={review.improvements} />
              <DetailRow label="Deterioration" value={review.deterioration} />
              <DetailRow label="Patient response" value={review.patientResponse} />
              <DetailRow label="Observations" value={review.observations} />
              <DetailRow label="Recommendations" value={review.recommendations} />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 *:min-w-0">
              <div className="space-y-1.5">
                <Label htmlFor="improvements">Improvements</Label>
                <Textarea id="improvements" rows={3} {...form.register("improvements")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deterioration">Deterioration / regressions</Label>
                <Textarea id="deterioration" rows={3} {...form.register("deterioration")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patientResponse">Patient response to treatment</Label>
                <Textarea id="patientResponse" rows={3} {...form.register("patientResponse")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="observations">Observations</Label>
                <Textarea id="observations" rows={3} {...form.register("observations")} />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="recommendations">Recommendations</Label>
                <Textarea id="recommendations" rows={3} {...form.register("recommendations")} />
              </div>
            </div>
          )}
        </SectionCard>
      </section>

      {/* B — Updated clinical assessment */}
      <section className="space-y-2">
        <SectionCard title="Re-assessment" icon="Activity" description="Current subjective and objective findings at review">
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Pain (current / worst)" value={[review.painCurrent, review.painWorst].map((v) => (v === null || v === undefined ? "—" : `${v}/10`)).join(" / ")} />
              <DetailRow label="ROM summary" value={review.romSummary} />
              <DetailRow label="Strength summary" value={review.strengthSummary} />
              <DetailRow label="Functional summary" value={review.functionalSummary} />
              <DetailRow label="Vitals" value={review.vitals} />
              <DetailRow label="New findings" value={review.newFindings} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
                <Controller
                  control={form.control}
                  name="painCurrent"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>Pain now (0–10)</Label>
                      <div className="flex items-center gap-3">
                        <Slider min={0} max={10} step={1} value={[field.value ?? 0]} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
                        <span className="w-12 text-center text-sm font-semibold tabular-nums">{field.value ?? 0}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Baseline: {baseline.assessment?.pain.current ?? "—"}{baseline.assessment?.pain.current !== null && baseline.assessment?.pain.current !== undefined ? "/10" : ""}</p>
                    </div>
                  )}
                />
                <Controller
                  control={form.control}
                  name="painWorst"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>Pain at worst since last review (0–10)</Label>
                      <div className="flex items-center gap-3">
                        <Slider min={0} max={10} step={1} value={[field.value ?? 0]} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
                        <span className="w-12 text-center text-sm font-semibold tabular-nums">{field.value ?? 0}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Baseline: {baseline.assessment?.pain.worst ?? "—"}{baseline.assessment?.pain.worst !== null && baseline.assessment?.pain.worst !== undefined ? "/10" : ""}</p>
                    </div>
                  )}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2 *:min-w-0">
                <div className="space-y-1.5">
                  <Label htmlFor="romSummary">ROM summary</Label>
                  <Textarea id="romSummary" rows={3} placeholder="e.g. Knee flexion (L) improved from 100° to 115° active…" {...form.register("romSummary")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="strengthSummary">Strength summary</Label>
                  <Textarea id="strengthSummary" rows={3} placeholder="e.g. Quadriceps (L) grade 3 → 4 MRC…" {...form.register("strengthSummary")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="functionalSummary">Functional summary</Label>
                  <Textarea id="functionalSummary" rows={3} placeholder="e.g. Walking 30m with quad stick; dressing with minimal help…" {...form.register("functionalSummary")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vitals">Vitals</Label>
                  <Input id="vitals" placeholder="BP, HR, SpO₂, weight…" {...form.register("vitals")} />
                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="newFindings">New findings</Label>
                    <Textarea id="newFindings" rows={2} placeholder="Any new observations since last review…" {...form.register("newFindings")} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </section>

      {/* G — Sign & complete */}
      <section className="flex flex-1 flex-col">
        <SectionCard className="flex-1" title="Therapist sign-off" icon="Signature" description={isCompleted ? `Completed ${formatDate(review.completedAt)}` : "Completing the review is final and resets the episode review counter"}>
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Signature" value={review.therapistSignature} />
              <DetailRow label="Completed at" value={formatDate(review.completedAt)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
              <div className="space-y-1.5">
                <Label htmlFor="therapistSignature">Therapist signature</Label>
                <Input id="therapistSignature" placeholder="Type your full name to sign" {...form.register("therapistSignature")} />
              </div>
              <div className="space-y-1.5">
                <Label>Review cycle</Label>
                <div className="flex items-center gap-3">
                  <Progress value={sessionPct} className="flex-1" />
                  <span className="text-xs font-medium text-muted-foreground">{review.episode.sessionsSinceReview}/{review.episode.reviewThreshold} sessions</span>
                </div>
                <p className="text-xs text-muted-foreground">Completing resets the counter to 0/{review.episode.reviewThreshold}.</p>
              </div>
            </div>
          )}
        </SectionCard>
      </section>

        </div>
      </div>

      {!isCompleted && canManage ? (
        <div className="sticky bottom-0 z-10 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Completing the review is final and resets the episode review counter.</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => saveDraft.mutate(form.getValues())} disabled={saveDraft.isPending}>
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={complete.isPending}>Sign &amp; complete</Button>
            </div>
          </div>
        </div>
      ) : null}


      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this review?</DialogTitle>
            <DialogDescription>You have unsaved changes. Save a draft to keep them, or leave and discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
            {canManage ? (
              <Button disabled={saveDraft.isPending} onClick={() => saveDraft.mutate(form.getValues(), { onSuccess: finishLeave })}>
                {saveDraft.isPending ? "Saving…" : "Save draft & leave"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this progress review?</AlertDialogTitle>
            <AlertDialogDescription>
              The review will be signed and locked as a clinical record, objective results will update the treatment plan, and the episode&apos;s review counter will reset to 0/{review?.episode.reviewThreshold ?? 15}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitComplete} disabled={complete.isPending}>
              {complete.isPending ? "Completing…" : "Sign & complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
