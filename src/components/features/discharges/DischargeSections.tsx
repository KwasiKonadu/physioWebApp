"use client";
// Discharge form sections: final assessment, baseline comparison, objective outcomes, limitations, follow-up.
import { DataTable } from "@/components/molecules/data-table";
import { Controller } from "react-hook-form";
import { FOLLOW_UP_TYPES, labelize } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { changeFor } from "../progress-reviews/types";
import type { DischargeDetailResponse } from "../progress-reviews/types";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { DischargeFormValues, objectiveSummary } from "./discharge-form-model";

type Discharge = DischargeDetailResponse["discharge"];
type Baseline = DischargeDetailResponse["baseline"];

export function FinalAssessmentSection({ form, discharge, isCompleted }: { form: UseFormReturn<DischargeFormValues>; discharge: Discharge; isCompleted: boolean }) {
  return (
    <>
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
    </>
  );
}

export function BaselineComparisonSection({ form, baseline, isCompleted, comparisonArray, watchedComparison }: { form: UseFormReturn<DischargeFormValues>; baseline: Baseline; isCompleted: boolean; comparisonArray: UseFieldArrayReturn<DischargeFormValues, "baselineComparison">; watchedComparison: DischargeFormValues["baselineComparison"] }) {
  return (
    <>
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
    </>
  );
}

export function ObjectiveOutcomesSection({ form, baseline, discharge, isCompleted }: { form: UseFormReturn<DischargeFormValues>; baseline: Baseline; discharge: Discharge; isCompleted: boolean }) {
  return (
    <>
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
    </>
  );
}

export function LimitationsSection({ form, discharge, isCompleted }: { form: UseFormReturn<DischargeFormValues>; discharge: Discharge; isCompleted: boolean }) {
  return (
    <>
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
    </>
  );
}

export function FollowUpSection({ form, discharge, isCompleted }: { form: UseFormReturn<DischargeFormValues>; discharge: Discharge; isCompleted: boolean }) {
  return (
    <>
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
    </>
  );
}
