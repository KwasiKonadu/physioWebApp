"use client";
// Wizard steps of the treatment plan form (each receives the form and what it edits).
import { Controller, type UseFormReturn } from "react-hook-form";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/molecules/section-card";





import { AtomIcon } from "@/components/atoms/icon";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { MILESTONE_STATUSES } from "@/lib/constants";

import { OBJECTIVE_PRIORITIES, FormValues, intOrNull } from "./plan-form-schema";
import { InterventionNameInput, RowShell, ErrText } from "./PlanFormParts";

type Form = UseFormReturn<FormValues>;

export function ObjectivesStep({ form, fields, onAdd, onRemove }: { form: Form; fields: { id: string }[]; onAdd: () => void; onRemove: (i: number) => void }) {
  return (
      <SectionCard
        title="Treatment objectives"
        icon="Target"
        description="SMART objectives with measurable baseline → target (used by progress reviews)"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
            <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add objective
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <RowShell key={field.id} index={idx} label="Objective" onRemove={() => onRemove(idx)}>
              <div className="grid gap-2 sm:grid-cols-12 *:min-w-0">
                <div className="sm:col-span-6">
                  <Input placeholder="e.g. Reduce pain from 7/10 to 3/10" {...form.register(`objectives.${idx}.description` as never)} />
                  <ErrText form={form} name={`objectives.${idx}.description`} />
                </div>
                <Input className="sm:col-span-2" placeholder="Baseline" {...form.register(`objectives.${idx}.baseline` as never)} />
                <Input className="sm:col-span-2" placeholder="Target" {...form.register(`objectives.${idx}.target` as never)} />
                <Input className="sm:col-span-2" placeholder="Unit" {...form.register(`objectives.${idx}.unit` as never)} />
                <div className="sm:col-span-4">
                  <Controller
                    control={form.control}
                    name={`objectives.${idx}.priority` as never}
                    render={({ field }) => (
                      <Select value={field.value || ""} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Priority (optional)" /></SelectTrigger>
                        <SelectContent>
                          {OBJECTIVE_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Input className="sm:col-span-4" type="date" title="Expected date" {...form.register(`objectives.${idx}.expectedDate` as never)} />
              </div>
            </RowShell>
          ))}
          {fields.length === 0 ? (
            <EmptyStateCompact message="No objectives yet — add at least one measurable objective" />
          ) : null}
        </div>
      </SectionCard>
  );
}

export function MilestonesStep({ form, fields, onAdd, onRemove, objectives }: { form: Form; fields: { id: string }[]; onAdd: () => void; onRemove: (i: number) => void; objectives: FormValues["objectives"] | undefined }) {
  return (
      <SectionCard
        title="Rehabilitation milestones"
        icon="Flag"
        description="Optional checkpoints on the way to the objectives"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
            <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add milestone
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <RowShell key={field.id} index={idx} label="Milestone" onRemove={() => onRemove(idx)}>
              <div className="grid gap-2 sm:grid-cols-12 *:min-w-0">
                <div className="sm:col-span-6">
                  <Input placeholder="e.g. Pain below 5/10 with daily activities" {...form.register(`milestones.${idx}.description` as never)} />
                  <ErrText form={form} name={`milestones.${idx}.description`} />
                </div>
                <div className="sm:col-span-3">
                  <Controller
                    control={form.control}
                    name={`milestones.${idx}.objectiveIdx` as never}
                    render={({ field }) => (
                      <Select value={field.value || ""} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Linked objective" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not linked</SelectItem>
                          {(objectives || []).map((o, oi) => (
                            o?.description ? <SelectItem key={oi} value={String(oi)}>Objective {oi + 1}: {o.description.slice(0, 44)}</SelectItem> : null
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Input className="sm:col-span-2" type="date" title="Expected date" {...form.register(`milestones.${idx}.expectedDate` as never)} />
                <div className="sm:col-span-1">
                  <Controller
                    control={form.control}
                    name={`milestones.${idx}.status` as never}
                    render={({ field }) => (
                      <Select value={field.value || "PENDING"} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="px-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </RowShell>
          ))}
          {fields.length === 0 ? (
            <EmptyStateCompact message="No milestones — this section is optional" />
          ) : null}
        </div>
      </SectionCard>
  );
}

export function InterventionsStep({ form, fields, onAdd, onRemove }: { form: Form; fields: { id: string }[]; onAdd: () => void; onRemove: (i: number) => void }) {
  return (
      <SectionCard
        title="Interventions"
        icon="ClipboardList"
        description="Techniques and modalities with frequency and dosage"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
            <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add intervention
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <RowShell key={field.id} index={idx} label="Intervention" onRemove={() => onRemove(idx)}>
              <div className="grid gap-2 sm:grid-cols-12 *:min-w-0">
                <div className="sm:col-span-4">
                  <Controller
                    control={form.control}
                    name={`interventions.${idx}.name` as never}
                    render={({ field }) => (
                      <InterventionNameInput value={field.value} onChange={(v2) => field.onChange(v2)} />
                    )}
                  />
                  <ErrText form={form} name={`interventions.${idx}.name`} />
                </div>
                <Input className="sm:col-span-4" placeholder="Description / dosage details" {...form.register(`interventions.${idx}.description` as never)} />
                <Input className="sm:col-span-2" placeholder="Frequency (e.g. 2x/week)" {...form.register(`interventions.${idx}.frequency` as never)} />
                <Input className="sm:col-span-2" placeholder="Duration (e.g. 4 weeks)" {...form.register(`interventions.${idx}.duration` as never)} />
                <Input className="sm:col-span-7" placeholder="Instructions (technique, parameters…)" {...form.register(`interventions.${idx}.instructions` as never)} />
                <Input className="sm:col-span-5" placeholder="Notes (optional)" {...form.register(`interventions.${idx}.notes` as never)} />
              </div>
            </RowShell>
          ))}
          {fields.length === 0 ? (
            <EmptyStateCompact message="No interventions yet — add at least one" />
          ) : null}
        </div>
      </SectionCard>
  );
}

export function ScheduleStep({ form }: { form: Form }) {
  return (
      <SectionCard title="Session schedule" icon="CalendarClock" description="Planned frequency, volume and review cadence">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 *:min-w-0">
          <div className="space-y-1.5">
            <Label>Sessions per week</Label>
            <Input type="number" min="1" placeholder="e.g. 3" {...form.register("sessionsPerWeek")} />
          </div>
          <div className="space-y-1.5">
            <Label>Expected total sessions</Label>
            <Input type="number" min="1" placeholder="e.g. 24" {...form.register("expectedTotalSessions")} />
          </div>
          <div className="space-y-1.5">
            <Label>Session duration (minutes)</Label>
            <Input type="number" min="1" placeholder="e.g. 45" {...form.register("sessionDurationMin")} />
          </div>
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" {...form.register("startDate")} />
          </div>
          <div className="space-y-1.5">
            <Label>End date (expected)</Label>
            <Input type="date" {...form.register("endDate")} />
          </div>
          <div className="space-y-1.5">
            <Label>Review threshold (sessions)</Label>
            <Input type="number" min="1" placeholder="Clinic default (15)" {...form.register("reviewThresholdSessions")} />
            <p className="text-xs text-muted-foreground">Leave empty to use the clinic setting (15).</p>
          </div>
        </div>
      </SectionCard>
  );
}

export function PrecautionsStep({ form }: { form: Form }) {
  return (
      <SectionCard title="Precautions & recommendations" icon="ShieldAlert" description="Safety information copied to every session and the discharge summary">
        <div className="grid gap-3 md:grid-cols-2 *:min-w-0">
          {([
            ["contraindications", "Contraindications"],
            ["restrictions", "Restrictions"],
            ["activitiesToAvoid", "Activities to avoid"],
            ["specialPrecautions", "Special precautions"],
            ["patientRecommendations", "Patient recommendations"],
            ["referralInstructions", "Referral instructions"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea rows={2} placeholder="Optional" {...form.register(key as never)} />
            </div>
          ))}
        </div>
      </SectionCard>
  );
}

export function ReviewStep({ form, mode, objectives, milestones, interventions, perWeek, total, duration, start, end, episodeLabel }: {
  form: Form; mode: "create" | "edit" | "revise";
  objectives: FormValues["objectives"] | undefined; milestones: FormValues["milestones"] | undefined; interventions: FormValues["interventions"] | undefined;
  perWeek: string; total: string; duration: string; start: string; end: string; episodeLabel: string;
}) {
  return (
      <SectionCard title="Review & save" icon="CheckCircle2" description="Confirm the plan before saving">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-navy-50 text-navy-800">{objectives?.length ?? 0} objectives</Badge>
            <Badge variant="outline" className="bg-navy-50 text-navy-800">{milestones?.length ?? 0} milestones</Badge>
            <Badge variant="outline" className="bg-navy-50 text-navy-800">{interventions?.length ?? 0} interventions</Badge>
            {intOrNull(perWeek) ? <Badge variant="outline">{intOrNull(perWeek)} sessions/week</Badge> : null}
            {intOrNull(total) ? <Badge variant="outline">{intOrNull(total)} total sessions</Badge> : null}
            {intOrNull(duration) ? <Badge variant="outline">{intOrNull(duration)} min each</Badge> : null}
            {start ? <Badge variant="outline">from {start}</Badge> : null}
            {end ? <Badge variant="outline">to {end}</Badge> : null}
          </div>
          {mode === "create" ? (
            <p className="text-sm text-muted-foreground">
              Episode: <span className="font-medium text-foreground">{episodeLabel}</span>
            </p>
          ) : null}
          {(objectives || []).length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objectives</p>
              <ul className="space-y-1">
                {(objectives || []).map((o, i) => (
                  <li key={i} className="text-sm text-foreground">• {o?.description}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {(interventions || []).length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interventions</p>
              <div className="flex flex-wrap gap-1.5">
                {(interventions || []).map((iv, i) => (
                  iv?.name ? <Badge key={i} variant="outline">{iv.name}{iv.frequency ? ` · ${iv.frequency}` : ""}</Badge> : null
                ))}
              </div>
            </div>
          ) : null}
          {mode === "revise" ? (
            <div className="space-y-1.5">
              <Label>Change reason <span className="text-rose-500">*</span></Label>
              <Textarea
                rows={3}
                placeholder="Why is this revision needed? (recorded in the audit trail)"
                {...form.register("changeReason")}
              />
              <ErrText form={form} name="changeReason" />
            </div>
          ) : null}
        </div>
      </SectionCard>
  );
}
