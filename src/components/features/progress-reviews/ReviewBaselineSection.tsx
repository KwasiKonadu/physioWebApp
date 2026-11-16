"use client";
// Read-only baseline (previous clinical information) panel of the review form.

import { formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { DECISION_TONE } from "./types";
import type { ClinicalBaseline } from "./types";

// Colour-codes a 0–10 pain score: green (none/mild) → amber (moderate) → red (severe)
export function painTone(v: number | null | undefined): { box: string; text: string; label: string } {
  if (v === null || v === undefined) return { box: "border-slate-200 bg-slate-50", text: "text-slate-500", label: "Not recorded" };
  if (v === 0) return { box: "border-emerald-200 bg-emerald-50", text: "text-emerald-700", label: "No pain" };
  if (v <= 3) return { box: "border-lime-200 bg-lime-50", text: "text-lime-700", label: "Mild" };
  if (v <= 6) return { box: "border-amber-200 bg-amber-50", text: "text-amber-700", label: "Moderate" };
  if (v <= 8) return { box: "border-orange-200 bg-orange-50", text: "text-orange-700", label: "Severe" };
  return { box: "border-red-200 bg-red-50", text: "text-red-700", label: "Very severe" };
}
export function PainChip({ label, value }: { label: string; value: number | null | undefined }) {
  const t = painTone(value);
  return (
    <span title={t.label} className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className={`font-semibold ${t.text}`}>{value === null || value === undefined ? "—" : `${value}/10`}</span>
    </span>
  );
}

export function BaselineSection({ baseline }: { baseline: ClinicalBaseline }) {
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
