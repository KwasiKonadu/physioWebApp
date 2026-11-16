"use client";
// Wizard steps of the assessment form (each receives the form and what it edits).

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailGrid } from "@/components/molecules/detail-row";
import { AtomIcon } from "@/components/atoms/icon";
import { BODY_PARTS, SIDES, FUNCTIONAL_ACTIVITIES, FUNCTIONAL_DIFFICULTY_LABELS, labelize } from "@/lib/constants";
import { cn } from "@/lib/utils";
import * as API from "./assessments-api";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { FormValues, ROM_PRESETS, MRC_GRADES, MRC_LABELS, validateForComplete } from "./assessment-form-model";
import { Field, DRow, PainSlider, MeasurementTable } from "./AssessmentFormParts";

export function ComplaintStep({ form, values }: { form: UseFormReturn<FormValues>; values: FormValues }) {
  return (
    <SectionCard title="Presenting complaint" icon="MessageSquareText">
      <div className="space-y-4">
        <Field label="Primary complaint">
          <Textarea rows={3} placeholder="e.g. Persistent lower back pain radiating to the left buttock" {...form.register("primaryComplaint")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Body part">
            <Select value={values.bodyPart || undefined} onValueChange={(v) => form.setValue("bodyPart", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select body part…" /></SelectTrigger>
              <SelectContent>
                {[...BODY_PARTS, "Other"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Affected side">
            <Select value={values.affectedSide || undefined} onValueChange={(v) => form.setValue("affectedSide", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select side…" /></SelectTrigger>
              <SelectContent>
                {SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {values.bodyPart === "Other" ? (
          <Field label="Custom body part">
            <Input placeholder="Describe the affected region" {...form.register("bodyPartCustom")} />
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Duration">
            <Input placeholder="e.g. 4 months" {...form.register("duration")} />
          </Field>
          <Field label="Onset">
            <Select value={values.onset || undefined} onValueChange={(v) => form.setValue("onset", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select onset…" /></SelectTrigger>
              <SelectContent>
                {["SUDDEN", "GRADUAL", "INSIDIOUS"].map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Cause / mechanism of injury">
          <Textarea rows={2} placeholder="e.g. Prolonged sitting and frequent heavy lifting at work" {...form.register("cause")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Aggravating factors">
            <Textarea rows={2} placeholder="e.g. Sitting, bending, lifting" {...form.register("aggravating")} />
          </Field>
          <Field label="Relieving factors">
            <Textarea rows={2} placeholder="e.g. Rest, heat, lying down" {...form.register("relieving")} />
          </Field>
        </div>
        <Field label="Previous treatment">
          <Textarea rows={2} placeholder="Prior physiotherapy, medication, imaging…" {...form.register("previousTreatment")} />
        </Field>
        <Field label="Additional history">
          <Textarea rows={2} placeholder="Relevant medical history, red flags…" {...form.register("additionalHistory")} />
        </Field>
      </div>
    </SectionCard>
  );
}

export function PainStep({ form, values }: { form: UseFormReturn<FormValues>; values: FormValues }) {
  return (
    <SectionCard title="Pain assessment" description="Rate each on a 0–10 scale" icon="Activity">
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-3 *:min-w-0">
          <PainSlider label="Current pain" value={values.painCurrent} onChange={(v) => form.setValue("painCurrent", v)} />
          <PainSlider label="Worst pain" value={values.painWorst} onChange={(v) => form.setValue("painWorst", v)} />
          <PainSlider label="Lowest pain" value={values.painLowest} onChange={(v) => form.setValue("painLowest", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Pain location">
            <Input placeholder="e.g. Left lumbar region radiating to buttock" {...form.register("painLocation")} />
          </Field>
          <Field label="Pain type">
            <Input placeholder="e.g. Aching, sharp, burning" {...form.register("painType")} />
          </Field>
        </div>
        <Field label="Pain frequency">
          <Input placeholder="e.g. Daily, intermittent, constant at night" {...form.register("painFrequency")} />
        </Field>
        <Field label="Pain notes">
          <Textarea rows={2} {...form.register("painNotes")} />
        </Field>
      </div>
    </SectionCard>
  );
}

export function ExaminationStep({ form, values, romArr, strengthArr }: { form: UseFormReturn<FormValues>; values: FormValues; romArr: UseFieldArrayReturn<FormValues, "rom">; strengthArr: UseFieldArrayReturn<FormValues, "strength"> }) {
  return (
    <div className="space-y-5">
      <SectionCard title="Observation" icon="Eye">
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Posture"><Input {...form.register("posture")} /></Field>
          <Field label="Swelling"><Input {...form.register("swelling")} /></Field>
          <Field label="Deformity"><Input {...form.register("deformity")} /></Field>
          <Field label="Skin condition"><Input {...form.register("skinCondition")} /></Field>
          <Field label="Muscle wasting"><Input {...form.register("muscleWasting")} /></Field>
          <Field label="Gait"><Input {...form.register("gait")} /></Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Range of motion"
        icon="Move3d"
        description="Record degrees for active / passive / normal values"
        actions={(
          <div className="flex items-center gap-2">
            <Select
              value=""
              onValueChange={(bp) => {
                const rows = ROM_PRESETS[bp] || [];
                const existing = new Set((values.rom || []).filter((r) => r.bodyPart === bp).map((r) => r.movement));
                // one row per movement for each side (left & right); movements already listed are skipped
                rows.forEach(([movement, normal]) => {
                  if (existing.has(movement)) return;
                  (["LEFT", "RIGHT"] as const).forEach((side) =>
                    romArr.append({ bodyPart: bp, movement, side, activeRom: "", passiveRom: "", normalValue: String(normal), notes: "" }));
                });
              }}
            >
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Add standard set…" /></SelectTrigger>
              <SelectContent>{Object.keys(ROM_PRESETS).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => romArr.append({ bodyPart: "", movement: "", side: "", activeRom: "", passiveRom: "", normalValue: "", notes: "" })}>
              <AtomIcon name="Plus" className="h-4 w-4" />Add row
            </Button>
          </div>
        )}
      >
        {romArr.fields.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No ROM measurements yet — add a row to begin.</p>
        ) : (
          <div className="space-y-3">
            {romArr.fields.map((f, idx) => (
              <div key={f.id} className="rounded-lg border bg-muted/10 p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 *:min-w-0">
                  <Field label="Body part">
                    <Select value={values.rom?.[idx]?.bodyPart || undefined} onValueChange={(v) => form.setValue(`rom.${idx}.bodyPart`, v)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Body part…" /></SelectTrigger>
                      <SelectContent>{[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Movement">
                    <Input
                      placeholder="e.g. Flexion"
                      {...form.register(`rom.${idx}.movement`, {
                        onBlur: (e) => {
                          const bp = form.getValues(`rom.${idx}.bodyPart`);
                          const hit = ROM_PRESETS[bp]?.find(([m]) => m.toLowerCase() === String(e.target.value).trim().toLowerCase());
                          if (hit && !form.getValues(`rom.${idx}.normalValue`)) form.setValue(`rom.${idx}.normalValue`, String(hit[1]));
                        },
                      })}
                    />
                  </Field>
                  <Field label="Side">
                    <Select value={values.rom?.[idx]?.side || undefined} onValueChange={(v) => form.setValue(`rom.${idx}.side`, v)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Side…" /></SelectTrigger>
                      <SelectContent>{SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => romArr.remove(idx)}>
                      <AtomIcon name="Trash2" className="h-4 w-4" />Remove
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Field label="Active ROM (°)"><Input type="number" inputMode="decimal" {...form.register(`rom.${idx}.activeRom`)} /></Field>
                  <Field label="Passive ROM (°)"><Input type="number" inputMode="decimal" {...form.register(`rom.${idx}.passiveRom`)} /></Field>
                  <Field label="Normal value (°)"><Input type="number" inputMode="decimal" {...form.register(`rom.${idx}.normalValue`)} /></Field>
                </div>
                <Field label="Notes" className="mt-2"><Input {...form.register(`rom.${idx}.notes`)} /></Field>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Muscle strength"
        icon="Dumbbell"
        description="MRC grading scale (0–5)"
        actions={(
          <Button type="button" variant="outline" size="sm" onClick={() => strengthArr.append({ bodyPart: "", muscleGroup: "", side: "", grade: "3", notes: "" })}>
            <AtomIcon name="Plus" className="h-4 w-4" />Add row
          </Button>
        )}
      >
        {strengthArr.fields.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No strength measurements yet — add a row to begin.</p>
        ) : (
          <div className="space-y-3">
            {strengthArr.fields.map((f, idx) => (
              <div key={f.id} className="rounded-lg border bg-muted/10 p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 *:min-w-0">
                  <Field label="Body part">
                    <Select value={values.strength?.[idx]?.bodyPart || undefined} onValueChange={(v) => form.setValue(`strength.${idx}.bodyPart`, v)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Body part…" /></SelectTrigger>
                      <SelectContent>{[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Muscle group">
                    <Input placeholder="e.g. Quadriceps" {...form.register(`strength.${idx}.muscleGroup`)} />
                  </Field>
                  <Field label="Side">
                    <Select value={values.strength?.[idx]?.side || undefined} onValueChange={(v) => form.setValue(`strength.${idx}.side`, v)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Side…" /></SelectTrigger>
                      <SelectContent>{SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="MRC grade">
                    <div className="flex gap-1" role="radiogroup" aria-label="MRC grade">
                      {MRC_GRADES.map((g) => {
                        const on = values.strength?.[idx]?.grade === g;
                        const tone = ["bg-red-600", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500", "bg-emerald-600"][Number(g)];
                        return (
                          <button
                            key={g}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            title={MRC_LABELS[g]}
                            onClick={() => form.setValue(`strength.${idx}.grade`, g)}
                            className={cn("h-9 flex-1 rounded-md text-xs font-semibold transition-all", on ? cn(tone, "text-white shadow-sm") : "border bg-white text-slate-600 hover:bg-slate-100")}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => strengthArr.remove(idx)}>
                      <AtomIcon name="Trash2" className="h-4 w-4" />Remove
                    </Button>
                  </div>
                </div>
                <Field label="Notes" className="mt-2"><Input {...form.register(`strength.${idx}.notes`)} /></Field>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function FunctionalStep({ form, values, fnArr, activityOptions, customActivity, setCustomActivity }: { form: UseFormReturn<FormValues>; values: FormValues; fnArr: UseFieldArrayReturn<FormValues, "functional">; activityOptions: string[]; customActivity: string; setCustomActivity: (v: string) => void }) {
  return (
    <SectionCard
      title="Functional assessment"
      icon="Accessibility"
      description="Difficulty performing daily activities (0 — no difficulty … 4 — unable)"
      actions={(
        <Button type="button" variant="outline" size="sm" onClick={() => fnArr.append({ activity: FUNCTIONAL_ACTIVITIES[0], difficulty: "0", notes: "" })}>
          <AtomIcon name="Plus" className="h-4 w-4" />Add activity
        </Button>
      )}
    >
      <div className="mb-4 flex gap-2">
        <Input
          value={customActivity}
          onChange={(e) => setCustomActivity(e.target.value)}
          placeholder="Add a custom activity (e.g. Squatting)…"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && customActivity.trim()) {
              e.preventDefault();
              fnArr.append({ activity: customActivity.trim(), difficulty: "0", notes: "" });
              setCustomActivity("");
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!customActivity.trim()}
          onClick={() => { fnArr.append({ activity: customActivity.trim(), difficulty: "0", notes: "" }); setCustomActivity(""); }}
        >
          <AtomIcon name="Plus" className="h-4 w-4" />Add
        </Button>
      </div>
      {fnArr.fields.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No activities recorded yet — add one above or use “Add activity”.</p>
      ) : (
        <div className="space-y-2">
          {fnArr.fields.map((f, idx) => (
            <div key={f.id} className="grid items-end gap-2 rounded-lg border bg-muted/10 p-3 sm:grid-cols-[1fr_220px_1fr_auto]">
              <Field label="Activity">
                <Select value={values.functional?.[idx]?.activity || undefined} onValueChange={(v) => form.setValue(`functional.${idx}.activity`, v)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Activity…" /></SelectTrigger>
                  <SelectContent>
                    {activityOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Difficulty">
                <Select value={values.functional?.[idx]?.difficulty || undefined} onValueChange={(v) => form.setValue(`functional.${idx}.difficulty`, v)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Difficulty…" /></SelectTrigger>
                  <SelectContent>
                    {FUNCTIONAL_DIFFICULTY_LABELS.map((l, di) => <SelectItem key={di} value={String(di)}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes"><Input className="h-9" {...form.register(`functional.${idx}.notes`)} /></Field>
              <Button type="button" variant="ghost" size="icon" className="text-rose-600 hover:text-rose-700" onClick={() => fnArr.remove(idx)} aria-label="Remove row">
                <AtomIcon name="Trash2" className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function VitalsStep({ form }: { form: UseFormReturn<FormValues> }) {
  return (
    <SectionCard title="Vital signs" description="None of these are mandatory" icon="HeartPulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 *:min-w-0">
        <Field label="Blood pressure"><Input placeholder="120/80" {...form.register("bloodPressure")} /></Field>
        <Field label="Heart rate (bpm)"><Input type="number" inputMode="numeric" {...form.register("heartRate")} /></Field>
        <Field label="Respiratory rate"><Input type="number" inputMode="numeric" {...form.register("respiratoryRate")} /></Field>
        <Field label="Temperature (°C)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("temperature")} /></Field>
        <Field label="SpO₂ (%)"><Input type="number" inputMode="numeric" {...form.register("oxygenSaturation")} /></Field>
        <Field label="Weight (kg)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("weightKg")} /></Field>
        <Field label="Height (cm)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("heightCm")} /></Field>
      </div>
    </SectionCard>
  );
}

export function FindingsStep({ form }: { form: UseFormReturn<FormValues> }) {
  return (
    <SectionCard title="Clinical findings" icon="ClipboardCheck">
      <div className="space-y-4">
        <Field label="Clinical findings">
          <Textarea rows={3} {...form.register("clinicalFindings")} />
        </Field>
        <Field label="Impairments">
          <Textarea rows={2} {...form.register("impairments")} />
        </Field>
        <Field label="Functional limitations">
          <Textarea rows={2} {...form.register("functionalLimitations")} />
        </Field>
        <Field label="Clinical impression">
          <Textarea rows={3} {...form.register("clinicalImpression")} />
        </Field>
        <Field label="Precautions">
          <Textarea rows={2} {...form.register("precautions")} />
        </Field>
        <Field label="Additional notes">
          <Textarea rows={2} {...form.register("additionalNotes")} />
        </Field>
        <Field label="Therapist signature" hint="Typed signature recorded with this assessment">
          <Input placeholder="e.g. A. Frimpong, PT" {...form.register("therapistSignature")} />
        </Field>
      </div>
    </SectionCard>
  );
}

export function ReviewStep({ values, problem, episode, goTo, complete }: { values: FormValues; problem: ReturnType<typeof validateForComplete>; episode: API.EpisodeLite | null; goTo: (i: number) => void; complete: () => void }) {
  return (
    <SectionCard title="Review" description="Verify all captured information, then complete the assessment" icon="ListChecks">
      <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2 *:min-w-0">
        {problem ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 xl:col-span-2">
            <p className="flex items-center gap-2 text-sm text-rose-800"><AtomIcon name="AlertCircle" className="h-4 w-4 shrink-0" />{problem.message}</p>
            <Button size="sm" variant="outline" className="shrink-0 bg-white" onClick={() => goTo(problem.section)}>Fix now</Button>
          </div>
        ) : null}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Presenting complaint</h4>
          <DetailGrid cols={2}>
            <DRow label="Primary complaint" value={values.primaryComplaint} />
            <DRow label="Body part" value={values.bodyPart === "Other" ? values.bodyPartCustom : values.bodyPart} />
            <DRow label="Affected side" value={values.affectedSide ? labelize(values.affectedSide) : ""} />
            <DRow label="Duration" value={values.duration} />
            <DRow label="Onset" value={values.onset ? labelize(values.onset) : ""} />
            <DRow label="Cause" value={values.cause} />
            <DRow label="Aggravating" value={values.aggravating} />
            <DRow label="Relieving" value={values.relieving} />
            <DRow label="Previous treatment" value={values.previousTreatment} />
          </DetailGrid>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Pain</h4>
          <DetailGrid cols={3}>
            <DRow label="Current" value={values.painCurrent !== undefined ? `${values.painCurrent}/10` : ""} />
            <DRow label="Worst" value={values.painWorst !== undefined ? `${values.painWorst}/10` : ""} />
            <DRow label="Lowest" value={values.painLowest !== undefined ? `${values.painLowest}/10` : ""} />
            <DRow label="Location" value={values.painLocation} />
            <DRow label="Type" value={values.painType} />
            <DRow label="Frequency" value={values.painFrequency} />
          </DetailGrid>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            Examination — {values.rom?.length || 0} ROM · {values.strength?.length || 0} strength measurements
          </h4>
          {(values.rom?.length || 0) > 0 ? (
            <MeasurementTable rows={values.rom || []} columns={[
              ["Body part", (r) => r.bodyPart || "—"], ["Movement", (r) => r.movement || "—"],
              ["Side", (r) => (r.side ? labelize(r.side) : "—")], ["Active", (r) => r.activeRom || "—"],
              ["Passive", (r) => r.passiveRom || "—"], ["Normal", (r) => r.normalValue || "—"],
            ]} />
          ) : null}
          {(values.strength?.length || 0) > 0 ? (
            <MeasurementTable rows={values.strength || []} columns={[
              ["Body part", (r) => r.bodyPart || "—"], ["Muscle group", (r) => r.muscleGroup || "—"],
              ["Side", (r) => (r.side ? labelize(r.side) : "—")], ["Grade", (r) => `${r.grade}/5`],
            ]} />
          ) : null}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Functional — {values.functional?.length || 0} activities</h4>
          {(values.functional?.length || 0) > 0 ? (
            <MeasurementTable rows={values.functional || []} columns={[
              ["Activity", (r) => r.activity], ["Difficulty", (r) => FUNCTIONAL_DIFFICULTY_LABELS[Number(r.difficulty || 0)]],
              ["Notes", (r) => r.notes || "—"],
            ]} />
          ) : null}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Vitals & findings</h4>
          <DetailGrid cols={2}>
            <DRow label="Blood pressure" value={values.bloodPressure} />
            <DRow label="Heart rate" value={values.heartRate ? `${values.heartRate} bpm` : ""} />
            <DRow label="Respiratory rate" value={values.respiratoryRate} />
            <DRow label="Temperature" value={values.temperature ? `${values.temperature} °C` : ""} />
            <DRow label="SpO₂" value={values.oxygenSaturation ? `${values.oxygenSaturation}%` : ""} />
            <DRow label="Weight / Height" value={[values.weightKg ? `${values.weightKg} kg` : "", values.heightCm ? `${values.heightCm} cm` : ""].filter(Boolean).join(" · ")} />
            <DRow label="Clinical impression" value={values.clinicalImpression} />
            <DRow label="Precautions" value={values.precautions} />
          </DetailGrid>
        </div>
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800 xl:col-span-2">
          Completing the assessment marks the episode <strong>awaiting plan</strong> and locks this record. Corrections create a new draft linked in the audit trail.
        </p>
      </div>
    </SectionCard>
  );
}
