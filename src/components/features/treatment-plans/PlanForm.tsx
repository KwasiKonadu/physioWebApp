"use client";
// FEATURE: Treatment plan form wizard — create / edit draft / revise (objectives → milestones → interventions → schedule → precautions → review)
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/molecules/section-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { MILESTONE_STATUSES, PLAN_INTERVENTIONS } from "@/lib/constants";
import { fullName, ymd } from "@/lib/format";
import { plansApi, fetchPatientEpisodes, searchPatients } from "./plan-api";
import type { TreatmentPlanDto } from "./types";

const OBJECTIVE_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const CUSTOM_SENTINEL = "__custom__";

// ---------- schema ----------
const objectiveRowSchema = z.object({
  description: z.string().min(1, "Description is required"),
  baseline: z.string(),
  target: z.string(),
  unit: z.string(),
  priority: z.string(),
  expectedDate: z.string(),
});
const milestoneRowSchema = z.object({
  description: z.string().min(1, "Description is required"),
  objectiveIdx: z.string(),
  expectedDate: z.string(),
  status: z.string(),
});
const interventionRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  frequency: z.string(),
  duration: z.string(),
  instructions: z.string(),
  notes: z.string(),
});

const buildSchema = (mode: "create" | "edit" | "revise") =>
  z.object({
    episodeId: mode === "create" ? z.string().min(1, "Select an episode for this plan") : z.string(),
    objectives: z.array(objectiveRowSchema).max(30),
    milestones: z.array(milestoneRowSchema).max(30),
    interventions: z.array(interventionRowSchema).max(30),
    sessionsPerWeek: z.string(),
    expectedTotalSessions: z.string(),
    sessionDurationMin: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reviewThresholdSessions: z.string(),
    contraindications: z.string(),
    restrictions: z.string(),
    activitiesToAvoid: z.string(),
    specialPrecautions: z.string(),
    patientRecommendations: z.string(),
    referralInstructions: z.string(),
    changeReason: mode === "revise" ? z.string().min(1, "A change reason is required") : z.string(),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const emptyObjective = { description: "", baseline: "", target: "", unit: "", priority: "", expectedDate: "" };
const emptyMilestone = { description: "", objectiveIdx: "", expectedDate: "", status: "PENDING" };
const emptyIntervention = { name: "", description: "", frequency: "", duration: "", instructions: "", notes: "" };

function intOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dateOrNull(v: string): string | null {
  return v && v.trim() ? v : null;
}

// ---------- intervention name: presets select + custom free text ----------
function InterventionNameInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const isPreset = (PLAN_INTERVENTIONS as readonly string[]).includes(value || "");
  const [custom, setCustom] = useState(!!value && !isPreset);

  if (custom) {
    return (
      <div className="flex gap-1.5">
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Custom intervention name" />
        <Button
          type="button" variant="ghost" size="icon" className="shrink-0"
          onClick={() => { setCustom(false); onChange(""); }}
          title="Choose from presets instead"
        >
          <AtomIcon name="List" className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <Select value={value || ""} onValueChange={(v) => {
      if (v === CUSTOM_SENTINEL) { setCustom(true); onChange(""); } else onChange(v);
    }}>
      <SelectTrigger><SelectValue placeholder="Select intervention" /></SelectTrigger>
      <SelectContent>
        {PLAN_INTERVENTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        <SelectItem value={CUSTOM_SENTINEL}>
          <span className="inline-flex items-center gap-1.5"><AtomIcon name="Pencil" className="h-3.5 w-3.5" /> Custom…</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------- repeatable row helpers ----------
function RowShell({ index, label, onRemove, children }: {
  index: number; label: string; onRemove: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} {index + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={onRemove} aria-label={`Remove ${label}`}>
          <AtomIcon name="Trash2" className="h-3.5 w-3.5" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function ErrText({ form, name }: { form: UseFormReturn<FormValues>; name: string }) {
  const err = name.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, form.formState.errors);
  const msg = (err as { message?: string } | undefined)?.message;
  return msg ? <p className="mt-1 text-xs text-rose-600">{msg}</p> : null;
}

// ---------- main ----------
export function PlanForm({
  mode, sourcePlanId, preselectPatientId, preselectEpisodeId, onDone, onCancel,
}: {
  mode: "create" | "edit" | "revise";
  sourcePlanId?: string | null;
  preselectPatientId?: string;
  preselectEpisodeId?: string;
  onDone: (plan: TreatmentPlanDto) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const schema = useMemo(() => buildSchema(mode), [mode]);

  // entry-step lookups
  const [patientSearch, setPatientSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preselectPatientId || "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(patientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [patientSearch]);

  const patientsQuery = useQuery({
    queryKey: ["plans", "patient-search", debouncedSearch],
    queryFn: () => searchPatients(debouncedSearch),
    enabled: mode === "create",
  });
  const episodesQuery = useQuery({
    queryKey: ["plans", "patient-episodes", selectedPatientId],
    queryFn: () => fetchPatientEpisodes(selectedPatientId),
    enabled: mode === "create" && !!selectedPatientId,
  });

  const sourceQuery = useQuery({
    queryKey: ["plans", "detail", sourcePlanId],
    queryFn: () => plansApi.detail(sourcePlanId as string),
    enabled: (mode === "edit" || mode === "revise") && !!sourcePlanId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      episodeId: "",
      objectives: [{ ...emptyObjective }],
      milestones: [],
      interventions: [{ ...emptyIntervention }],
      sessionsPerWeek: "", expectedTotalSessions: "", sessionDurationMin: "",
      startDate: "", endDate: "", reviewThresholdSessions: "",
      contraindications: "", restrictions: "", activitiesToAvoid: "",
      specialPrecautions: "", patientRecommendations: "", referralInstructions: "",
      changeReason: "",
    },
  });
  const { fields: objectiveFields, append: appendObjective, remove: removeObjective } = useFieldArray({ control: form.control, name: "objectives" });
  const { fields: milestoneFields, append: appendMilestone, remove: removeMilestone } = useFieldArray({ control: form.control, name: "milestones" });
  const { fields: interventionFields, append: appendIntervention, remove: removeIntervention } = useFieldArray({ control: form.control, name: "interventions" });

  const objectivesWatch = useWatch({ control: form.control, name: "objectives" });
  const milestonesWatch = useWatch({ control: form.control, name: "milestones" });
  const interventionsWatch = useWatch({ control: form.control, name: "interventions" });
  const scheduleWatch = useWatch({
    control: form.control,
    name: ["sessionsPerWeek", "expectedTotalSessions", "sessionDurationMin", "startDate", "endDate"] as never,
  });
  const [perWeekW, totalW, durationW, startW, endW] = scheduleWatch as [string, string, string, string, string];
  const episodeIdWatch = useWatch({ control: form.control, name: "episodeId" });

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!sourceQuery.data || hydratedRef.current) return;
    const p = sourceQuery.data;
    const objectives = p.objectives.map((o) => ({
      description: o.description || "",
      baseline: o.baseline || "",
      target: o.target || "",
      unit: o.unit || "",
      priority: o.priority || "",
      expectedDate: o.expectedDate ? ymd(new Date(o.expectedDate)) : "",
    }));
    const objectiveIds = p.objectives.map((o) => o.id);
    const milestones = p.milestones.map((m) => ({
      description: m.description || "",
      objectiveIdx: m.objectiveId ? String(Math.max(0, objectiveIds.indexOf(m.objectiveId))) : "",
      expectedDate: m.expectedDate ? ymd(new Date(m.expectedDate)) : "",
      status: m.status || "PENDING",
    }));
    const interventions = p.interventions.map((iv) => ({
      name: iv.name || "", description: iv.description || "", frequency: iv.frequency || "",
      duration: iv.duration || "", instructions: iv.instructions || "", notes: iv.notes || "",
    }));
    form.reset({
      episodeId: p.episodeId,
      objectives: objectives.length ? objectives : [{ ...emptyObjective }],
      milestones,
      interventions: interventions.length ? interventions : [{ ...emptyIntervention }],
      sessionsPerWeek: p.sessionsPerWeek != null ? String(p.sessionsPerWeek) : "",
      expectedTotalSessions: p.expectedTotalSessions != null ? String(p.expectedTotalSessions) : "",
      sessionDurationMin: p.sessionDurationMin != null ? String(p.sessionDurationMin) : "",
      startDate: p.startDate ? ymd(new Date(p.startDate)) : "",
      endDate: p.endDate ? ymd(new Date(p.endDate)) : "",
      reviewThresholdSessions: String(p.reviewThresholdSessions ?? ""),
      contraindications: p.contraindications || "",
      restrictions: p.restrictions || "",
      activitiesToAvoid: p.activitiesToAvoid || "",
      specialPrecautions: p.specialPrecautions || "",
      patientRecommendations: p.patientRecommendations || "",
      referralInstructions: p.referralInstructions || "",
      changeReason: "",
    });
    hydratedRef.current = true;
  }, [sourceQuery.data, form]);

  // auto-pick the preselected episode once its list arrives
  useEffect(() => {
    if (mode !== "create" || !preselectEpisodeId || !episodesQuery.data) return;
    const exists = episodesQuery.data.some((e) => e.id === preselectEpisodeId);
    if (exists && !form.getValues("episodeId")) {
      form.setValue("episodeId", preselectEpisodeId, { shouldValidate: true });
    }
  }, [episodesQuery.data, preselectEpisodeId, mode, form]);

  // ---------- wizard steps ----------
  const steps = useMemo(() => {
    const base: { key: string; label: string; icon: string }[] = [];
    if (mode === "create") base.push({ key: "episode", label: "Episode", icon: "FolderOpen" });
    base.push(
      { key: "objectives", label: "Objectives", icon: "Target" },
      { key: "milestones", label: "Milestones", icon: "Flag" },
      { key: "interventions", label: "Interventions", icon: "ClipboardList" },
      { key: "schedule", label: "Schedule", icon: "CalendarClock" },
      { key: "precautions", label: "Precautions", icon: "ShieldAlert" },
      { key: "review", label: "Review & save", icon: "CheckCircle2" },
    );
    return base;
  }, [mode]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  const stepFields: Record<string, string[]> = {
    episode: ["episodeId"],
    objectives: ["objectives"],
    milestones: ["milestones"],
    interventions: ["interventions"],
    schedule: [],
    precautions: [],
    review: mode === "revise" ? ["changeReason"] : [],
  };

  const goNext = async () => {
    const fields = stepFields[step.key] || [];
    const ok = fields.length === 0 ? true : await form.trigger(fields as never, { shouldFocus: true });
    if (ok) setStepIdx((i) => Math.min(steps.length - 1, i + 1));
  };

  // ---------- submit ----------
  const buildBody = (v: FormValues, activate: boolean) => {
    const schedule = {
      sessionsPerWeek: intOrNull(v.sessionsPerWeek),
      expectedTotalSessions: intOrNull(v.expectedTotalSessions),
      sessionDurationMin: intOrNull(v.sessionDurationMin),
      startDate: dateOrNull(v.startDate),
      endDate: dateOrNull(v.endDate),
      reviewThresholdSessions: intOrNull(v.reviewThresholdSessions),
    };
    const precautions = {
      contraindications: v.contraindications || null,
      restrictions: v.restrictions || null,
      activitiesToAvoid: v.activitiesToAvoid || null,
      specialPrecautions: v.specialPrecautions || null,
      patientRecommendations: v.patientRecommendations || null,
      referralInstructions: v.referralInstructions || null,
    };
    if (mode === "revise") {
      return {
        objectives: v.objectives.map((o) => ({
          description: o.description, baseline: o.baseline || null, target: o.target || null,
          unit: o.unit || null, priority: o.priority || null, expectedDate: dateOrNull(o.expectedDate),
        })),
        milestones: v.milestones.map((m) => ({
          description: m.description, objectiveIdx: intOrNull(m.objectiveIdx),
          expectedDate: dateOrNull(m.expectedDate), status: m.status || "PENDING",
        })),
        interventions: v.interventions.map((iv) => ({
          name: iv.name, description: iv.description || null, frequency: iv.frequency || null,
          duration: iv.duration || null, instructions: iv.instructions || null, notes: iv.notes || null,
        })),
        schedule, precautions, changeReason: v.changeReason.trim(),
      };
    }
    const shared = {
      objectives: v.objectives.map((o) => ({
        description: o.description, baseline: o.baseline || null, target: o.target || null,
        unit: o.unit || null, priority: o.priority || null, expectedDate: dateOrNull(o.expectedDate),
      })),
      milestones: v.milestones.map((m) => ({
        description: m.description, objectiveIdx: intOrNull(m.objectiveIdx),
        expectedDate: dateOrNull(m.expectedDate), status: m.status || "PENDING",
      })),
      interventions: v.interventions.map((iv) => ({
        name: iv.name, description: iv.description || null, frequency: iv.frequency || null,
        duration: iv.duration || null, instructions: iv.instructions || null, notes: iv.notes || null,
      })),
      ...schedule, ...precautions,
    };
    // PATCH (edit) must not carry a status change — activation is a separate POST
    return mode === "create" ? { episodeId: v.episodeId, status: activate ? "ACTIVE" : "DRAFT", ...shared } : shared;
  };

  const submitMutation = useMutation({
    mutationFn: async ({ activate }: { activate: boolean }) => {
      const v = form.getValues();
      if (mode === "create") {
        return plansApi.create(buildBody(v, activate) as never);
      }
      if (mode === "edit" && sourcePlanId) {
        const updated = await plansApi.update(sourcePlanId, buildBody(v, activate));
        return activate ? plansApi.activate(updated.id) : updated;
      }
      // revise
      const newPlan = await plansApi.revise(sourcePlanId as string, buildBody(v, activate));
      return activate ? plansApi.activate(newPlan.id) : newPlan;
    },
    onSuccess: (plan, vars) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success(
        mode === "revise"
          ? `Plan v${plan.version} ${vars.activate ? "activated" : "saved as draft"} — previous version preserved`
          : mode === "edit"
            ? `Draft v${plan.version} ${vars.activate ? "activated" : "saved"}`
            : `Plan ${vars.activate ? `v${plan.version} created and activated` : "saved as draft"}`
      );
      onDone(plan);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = form.handleSubmit(() => submitMutation.mutate({ activate: false }));
  const saveActivate = form.handleSubmit(() => submitMutation.mutate({ activate: true }));

  // ---------- loading states ----------
  if ((mode === "edit" || mode === "revise") && sourceQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if ((mode === "edit" || mode === "revise") && !sourceQuery.data) {
    return <EmptyStateCompact message={sourceQuery.error instanceof Error ? sourceQuery.error.message : "Plan not found"} />;
  }

  const source = sourceQuery.data;
  const selectedPatient = patientsQuery.data?.find((p) => p.id === selectedPatientId);
  const selectedEpisode = episodesQuery.data?.find((e) => e.id === episodeIdWatch);

  return (
    <div className="space-y-4">
      {/* context banner */}
      {source ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-4 py-3 shadow-sm">
          <AtomIcon name={mode === "revise" ? "GitBranch" : "Pencil"} className="h-4 w-4 text-teal-600" />
          <span className="text-sm text-muted-foreground">
            {mode === "revise" ? "Revising" : "Editing draft"} <Badge variant="outline" className="font-mono">v{source.version}</Badge>
          </span>
          <span className="text-sm font-medium text-foreground">{fullName(source.episode.patient)}</span>
          <Badge variant="outline" className="font-mono text-xs">{source.episode.patient.patientCode}</Badge>
          <StatusBadge status={source.status} />
          <span className="text-sm text-muted-foreground">· {source.episode.title}</span>
        </div>
      ) : null}

      {/* stepper */}
      <div className="custom-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        {steps.map((s, i) => {
          const isCurrent = i === stepIdx;
          const isPast = i < stepIdx;
          return (
            <button
              key={s.key}
              type="button"
              disabled={i > stepIdx}
              onClick={() => i < stepIdx && setStepIdx(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCurrent
                  ? "border-navy-800 bg-navy-800 text-white"
                  : isPast
                    ? "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
                    : "border-slate-200 bg-white text-muted-foreground"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                isCurrent ? "bg-white/20" : isPast ? "bg-teal-600 text-white" : "bg-slate-100"
              }`}>
                {isPast ? <AtomIcon name="Check" className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ---------- STEP: entry (create only) ---------- */}
      {step.key === "episode" ? (
        <SectionCard title="Choose patient & episode" icon="FolderOpen" description="Plans are created against an open treatment episode that already has a completed assessment">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Find patient</Label>
              <div className="relative">
                <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search by name or patient code…"
                  className="pl-8"
                />
              </div>
              {patientsQuery.isLoading ? <Skeleton className="h-9 w-full" /> : null}
              {patientsQuery.data ? (
                <Select
                  value={selectedPatientId}
                  onValueChange={(v) => { setSelectedPatientId(v); form.setValue("episodeId", ""); }}
                >
                  <SelectTrigger><SelectValue placeholder={patientsQuery.data.length ? "Select patient" : "No patients matched"} /></SelectTrigger>
                  <SelectContent>
                    {patientsQuery.data.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {fullName(p)} · {p.patientCode}{p.currentStatus ? ` · ${p.currentStatus.replace(/_/g, " ").toLowerCase()}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            {selectedPatientId ? (
              <div className="space-y-1.5">
                <Label>Treatment episode</Label>
                {episodesQuery.isLoading ? <Skeleton className="h-9 w-full" /> : null}
                {episodesQuery.data && episodesQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open episodes for this patient — open an episode in the Patients module first.</p>
                ) : null}
                {episodesQuery.data && episodesQuery.data.length > 0 ? (
                  <Select
                    value={episodeIdWatch || ""}
                    onValueChange={(v) => form.setValue("episodeId", v, { shouldValidate: true })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select episode" /></SelectTrigger>
                    <SelectContent>
                      {episodesQuery.data.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.episodeNumber ? `#${e.episodeNumber} · ` : ""}{e.title} · {e.status.replace(/_/g, " ").toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <ErrText form={form} name="episodeId" />
                {selectedEpisode ? (
                  <p className="flex items-center gap-1.5 text-xs text-teal-700">
                    <AtomIcon name="CheckCircle2" className="h-3.5 w-3.5" />
                    Plan will be created for &ldquo;{selectedEpisode.title}&rdquo;
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* ---------- STEP: objectives ---------- */}
      {step.key === "objectives" ? (
        <SectionCard
          title="Treatment objectives"
          icon="Target"
          description="SMART objectives with measurable baseline → target (used by progress reviews)"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => appendObjective({ ...emptyObjective })}>
              <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add objective
            </Button>
          }
        >
          <div className="space-y-3">
            {objectiveFields.map((field, idx) => (
              <RowShell key={field.id} index={idx} label="Objective" onRemove={() => removeObjective(idx)}>
                <div className="grid gap-2 sm:grid-cols-12">
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
                          <SelectTrigger><SelectValue placeholder="Priority (optional)" /></SelectTrigger>
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
            {objectiveFields.length === 0 ? (
              <EmptyStateCompact message="No objectives yet — add at least one measurable objective" />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* ---------- STEP: milestones ---------- */}
      {step.key === "milestones" ? (
        <SectionCard
          title="Rehabilitation milestones"
          icon="Flag"
          description="Optional checkpoints on the way to the objectives"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => appendMilestone({ ...emptyMilestone })}>
              <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add milestone
            </Button>
          }
        >
          <div className="space-y-3">
            {milestoneFields.map((field, idx) => (
              <RowShell key={field.id} index={idx} label="Milestone" onRemove={() => removeMilestone(idx)}>
                <div className="grid gap-2 sm:grid-cols-12">
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
                          <SelectTrigger><SelectValue placeholder="Linked objective" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not linked</SelectItem>
                            {(objectivesWatch || []).map((o, oi) => (
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
            {milestoneFields.length === 0 ? (
              <EmptyStateCompact message="No milestones — this section is optional" />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* ---------- STEP: interventions ---------- */}
      {step.key === "interventions" ? (
        <SectionCard
          title="Interventions"
          icon="ClipboardList"
          description="Techniques and modalities with frequency and dosage"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => appendIntervention({ ...emptyIntervention })}>
              <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add intervention
            </Button>
          }
        >
          <div className="space-y-3">
            {interventionFields.map((field, idx) => (
              <RowShell key={field.id} index={idx} label="Intervention" onRemove={() => removeIntervention(idx)}>
                <div className="grid gap-2 sm:grid-cols-12">
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
            {interventionFields.length === 0 ? (
              <EmptyStateCompact message="No interventions yet — add at least one" />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* ---------- STEP: schedule ---------- */}
      {step.key === "schedule" ? (
        <SectionCard title="Session schedule" icon="CalendarClock" description="Planned frequency, volume and review cadence">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      ) : null}

      {/* ---------- STEP: precautions ---------- */}
      {step.key === "precautions" ? (
        <SectionCard title="Precautions & recommendations" icon="ShieldAlert" description="Safety information copied to every session and the discharge summary">
          <div className="grid gap-3 md:grid-cols-2">
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
      ) : null}

      {/* ---------- STEP: review ---------- */}
      {step.key === "review" ? (
        <SectionCard title="Review & save" icon="CheckCircle2" description="Confirm the plan before saving">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="bg-navy-50 text-navy-800">{objectivesWatch?.length ?? 0} objectives</Badge>
              <Badge variant="outline" className="bg-navy-50 text-navy-800">{milestonesWatch?.length ?? 0} milestones</Badge>
              <Badge variant="outline" className="bg-navy-50 text-navy-800">{interventionsWatch?.length ?? 0} interventions</Badge>
              {intOrNull(perWeekW) ? <Badge variant="outline">{intOrNull(perWeekW)} sessions/week</Badge> : null}
              {intOrNull(totalW) ? <Badge variant="outline">{intOrNull(totalW)} total sessions</Badge> : null}
              {intOrNull(durationW) ? <Badge variant="outline">{intOrNull(durationW)} min each</Badge> : null}
              {startW ? <Badge variant="outline">from {startW}</Badge> : null}
              {endW ? <Badge variant="outline">to {endW}</Badge> : null}
            </div>
            {mode === "create" ? (
              <p className="text-sm text-muted-foreground">
                Episode: <span className="font-medium text-foreground">{selectedEpisode?.title || episodeIdWatch || "—"}</span>
              </p>
            ) : null}
            {(objectivesWatch || []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objectives</p>
                <ul className="space-y-1">
                  {(objectivesWatch || []).map((o, i) => (
                    <li key={i} className="text-sm text-foreground">• {o?.description}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(interventionsWatch || []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interventions</p>
                <div className="flex flex-wrap gap-1.5">
                  {(interventionsWatch || []).map((iv, i) => (
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
      ) : null}

      {/* ---------- footer nav ---------- */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={stepIdx === 0 ? onCancel : () => setStepIdx((i) => i - 1)} disabled={submitMutation.isPending}>
            <AtomIcon name={stepIdx === 0 ? "X" : "ArrowLeft"} className="mr-1.5 h-4 w-4" />
            {stepIdx === 0 ? "Cancel" : "Back"}
          </Button>
          {stepIdx < steps.length - 1 ? (
            <Button type="button" onClick={goNext} className="bg-navy-800 text-white hover:bg-navy-900">
              Next <AtomIcon name="ArrowRight" className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {stepIdx === steps.length - 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={submitMutation.isPending} onClick={saveDraft}>
              {submitMutation.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Save" className="mr-1.5 h-4 w-4" />}
              {mode === "revise" ? "Save new version (draft)" : mode === "edit" ? "Save changes" : "Save draft"}
            </Button>
            <Button type="button" className="bg-teal-600 text-white hover:bg-teal-700" disabled={submitMutation.isPending} onClick={saveActivate}>
              {submitMutation.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Zap" className="mr-1.5 h-4 w-4" />}
              {mode === "revise" ? "Save & activate new version" : "Save & activate"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
