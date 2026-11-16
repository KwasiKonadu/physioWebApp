"use client";
// Sections of the progress review form (decision, comparison, objectives, summary, assessment, sign-off).
import { DataTable } from "@/components/molecules/data-table";
import { Controller } from "react-hook-form";
import { formatDate } from "@/lib/format";
import { REVIEW_DECISIONS, REVIEW_RESULT_STATUSES, labelize } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { changeFor } from "./types";
import type { ClinicalBaseline, ReviewDetailResponse } from "./types";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import type { ReviewFormValues } from "./review-form-model";

type Review = ReviewDetailResponse["review"];

export function DecisionSection({ form, review, isCompleted, decision, decisionBadge }: { form: UseFormReturn<ReviewFormValues>; review: Review; isCompleted: boolean; decision: string; decisionBadge: React.ReactNode }) {
  return (
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
  );
}

export function ComparisonSection({ form, review, baseline, isCompleted, comparisonArray, watchedComparison }: { form: UseFormReturn<ReviewFormValues>; review: Review; baseline: ClinicalBaseline; isCompleted: boolean; comparisonArray: UseFieldArrayReturn<ReviewFormValues, "comparison">; watchedComparison: ReviewFormValues["comparison"] }) {
  return (
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
  );
}

export function ObjectivesSection({ form, review, baseline, isCompleted, resultsArray, watchedResults }: { form: UseFormReturn<ReviewFormValues>; review: Review; baseline: ClinicalBaseline; isCompleted: boolean; resultsArray: UseFieldArrayReturn<ReviewFormValues, "objectiveResults">; watchedResults: ReviewFormValues["objectiveResults"] }) {
  return (
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
  );
}

export function SummarySection({ form, review, isCompleted }: { form: UseFormReturn<ReviewFormValues>; review: Review; isCompleted: boolean }) {
  return (
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
  );
}

export function UpdatedAssessmentSection({ form, review, baseline, isCompleted }: { form: UseFormReturn<ReviewFormValues>; review: Review; baseline: ClinicalBaseline; isCompleted: boolean }) {
  return (
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
  );
}

export function SignSection({ form, review, isCompleted, sessionPct }: { form: UseFormReturn<ReviewFormValues>; review: Review; isCompleted: boolean; sessionPct: number }) {
  return (
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
  );
}
