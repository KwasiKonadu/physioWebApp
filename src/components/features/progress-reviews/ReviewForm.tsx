"use client";
// FEATURE: full-page progress review form — baseline context (A), updated assessment (B),
// baseline comparison (C), objective evaluation (D), summary (E), decision (F), sign & complete (G).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { apiFetch } from "@/lib/api-client";
import { formatDate, fullName } from "@/lib/format";
import { REVIEW_DECISIONS, REVIEW_RESULT_STATUSES, labelize, PERMS } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore } from "@/stores/app-store";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
function BaselineSection({ baseline }: { baseline: ClinicalBaseline }) {
  const a = baseline.assessment;
  const plan = baseline.plan;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Initial assessment summary" icon="ClipboardList" description={a ? formatDate(a.assessmentDate) : "No completed assessment yet"}>
          {a ? (
            <div className="space-y-1">
              <DetailRow label="Primary complaint" value={a.primaryComplaint} />
              <DetailRow label="Body part / side" value={[a.bodyPart, a.affectedSide && labelize(a.affectedSide)].filter(Boolean).join(" · ") || "—"} />
              <DetailRow label="Duration / onset" value={[a.duration, labelize(a.onset)].filter(Boolean).join(" · ") || "—"} />
              <DetailRow label="Cause" value={a.cause} />
              <DetailRow label="Aggravating / relieving" value={[a.aggravating, a.relieving].filter(Boolean).join("  |  ") || "—"} />
              <DetailRow label="Pain (current / worst / lowest)" value={[a.pain.current, a.pain.worst, a.pain.lowest].map((v) => (v === null || v === undefined ? "—" : `${v}/10`)).join(" / ")} />
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

      <SectionCard title="Baseline measurements" icon="Ruler" description={a ? "From the initial assessment — compare against current values in section C" : undefined}>
        {a ? (
          <div className="grid gap-4 lg:grid-cols-3">
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

  const decision = form.watch("decision");
  const watchedComparison = form.watch("comparison");
  const watchedResults = form.watch("objectiveResults");

  const handleSubmitComplete = () => {
    const values = form.getValues();
    if (!values.decision) { toast.error("Select a review decision (section F) before completing"); return; }
    if (!values.therapistSignature || values.therapistSignature.trim().length < 2) { toast.error("Enter your signature (section G) before completing"); return; }
    complete.mutate(values);
  };

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
      <PageHeader
        title={`Progress review — ${fullName(review.episode.patient)}`}
        description={`${review.episode.title} · ${review.episode.patient.patientCode} · after ${review.triggerSessions} sessions${review.episode.therapist ? ` · therapist ${review.episode.therapist.firstName} ${review.episode.therapist.lastName}` : ""}`}
        icon="TrendingUp"
        actions={
          <>
            <Button variant="ghost" onClick={onBack}><span>← Back</span></Button>
            {isCompleted ? (
              <>
                {decisionBadge}
                <StatusBadge status={review.status} />
              </>
            ) : (
              <>
                <StatusBadge status={review.status} />
                {canManage ? (
                  <>
                    <Button variant="outline" onClick={() => saveDraft.mutate(form.getValues())} disabled={saveDraft.isPending}>Save draft</Button>
                    <Button onClick={() => setConfirmOpen(true)} disabled={complete.isPending}>Sign &amp; complete</Button>
                  </>
                ) : null}
              </>
            )}
          </>
        }
      />

      {!isCompleted && review.episode.reviewDue ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertTitle>Threshold review due</AlertTitle>
          <AlertDescription>
            This episode has reached {review.episode.sessionsSinceReview}/{review.episode.reviewThreshold} sessions since the last review. Completing this review resets the counter to 0.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A — Previous clinical info (read-only) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">A · Previous clinical information</h2>
        <BaselineSection baseline={baseline} />
      </section>

      {/* B — Updated clinical assessment */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">B · Updated clinical assessment</h2>
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
              <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="grid gap-4 lg:grid-cols-2">
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

      {/* C — Baseline comparison */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">C · Baseline comparison</h2>
        <SectionCard title="Baseline vs current" icon="GitCompareArrows" description="Prefilled from the initial assessment (and chained from the previous review) — record the current value of each metric">
          {comparisonArray.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comparison metrics — complete an initial assessment to prefill this table.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Metric</TableHead>
                    <TableHead className="w-32">Baseline</TableHead>
                    <TableHead className="w-36">{isCompleted ? "Current" : "Current (edit)"}</TableHead>
                    <TableHead className="w-36">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonArray.fields.map((f, idx) => {
                    const row = watchedComparison?.[idx];
                    const change = changeFor(row);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{row?.metric}</TableCell>
                        <TableCell>{row?.baseline}</TableCell>
                        <TableCell>
                          {isCompleted ? (
                            row?.current || "—"
                          ) : (
                            <Input placeholder="e.g. 90°" {...form.register(`comparison.${idx}.current` as const)} />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={change.tone === "success" ? "text-xs font-medium text-emerald-600" : change.tone === "danger" ? "text-xs font-medium text-rose-600" : "text-xs text-muted-foreground"}>
                            {change.text}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </section>

      {/* D — Objective & milestone evaluation */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">D · Objective &amp; milestone evaluation</h2>
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
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                                <SelectTrigger><SelectValue /></SelectTrigger>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">E · Therapist summary</h2>
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
            <div className="grid gap-4 lg:grid-cols-2">
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

      {/* F — Review decision */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">F · Review decision</h2>
        <SectionCard title="Decision" icon="Scale">
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Decision" value={decisionBadge} />
              <DetailRow label="Decision notes" value={review.decisionNotes} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="decision"
                  render={({ field }) => (
                    <div className="space-y-1.5">
                      <Label>Decision</Label>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select a decision…" /></SelectTrigger>
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

      {/* G — Sign & complete */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">G · Sign &amp; complete</h2>
        <SectionCard title="Therapist sign-off" icon="Signature" description={isCompleted ? `Completed ${formatDate(review.completedAt)}` : "Completing the review is final and resets the episode review counter"}>
          {isCompleted ? (
            <div className="space-y-1">
              <DetailRow label="Signature" value={review.therapistSignature} />
              <DetailRow label="Completed at" value={formatDate(review.completedAt)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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
