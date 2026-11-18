"use client";
// FEATURE: Treatment plan form wizard — create / edit draft / revise (objectives → milestones → interventions → schedule → precautions → review)
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { PageHeader } from "@/components/molecules/page-header";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientSearchSelect } from "../assessments/PatientSearchSelect";
import type { PatientLite } from "../assessments/assessments-api";
import { apiFetch } from "@/lib/api-client";
import { setNavGuard, useUIStore } from "@/stores/app-store";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { fullName, initials, ymd } from "@/lib/format";
import { plansApi, fetchPatientEpisodes, searchPatients } from "./plan-api";
import type { TreatmentPlanDto } from "./types";
import { buildSchema, FormValues, emptyObjective, emptyMilestone, emptyIntervention, intOrNull, dateOrNull } from "./plan-form-schema";
import { ObjectivesStep, MilestonesStep, InterventionsStep, ScheduleStep, PrecautionsStep, ReviewStep } from "./PlanFormSteps";
import { Field } from "@/components/molecules/field";

// ---------- main ----------
export function PlanForm({
  mode, sourcePlanId, preselectPatientId, preselectEpisodeId, onDone, onCancel, title, subtitle,
}: {
  title: string;
  subtitle?: string;
  mode: "create" | "edit" | "revise";
  sourcePlanId?: string | null;
  preselectPatientId?: string;
  preselectEpisodeId?: string;
  onDone: (plan: TreatmentPlanDto) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useUIStore((s) => s.navigate);
  const schema = useMemo(() => buildSchema(mode), [mode]);

  // entry-step lookups
  const [patientSearch, setPatientSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preselectPatientId || "");
  const [pickedPatient, setPickedPatient] = useState<PatientLite | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(patientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [patientSearch]);

  const patientsQuery = useQuery({
    queryKey: ["plans", "patient-search", debouncedSearch],
    queryFn: () => searchPatients(debouncedSearch),
    // only list patients that match what was typed — never the whole directory
    enabled: mode === "create" && debouncedSearch.trim().length > 0,
  });
  const patientInfoQ = useQuery({
    queryKey: ["plans", "patient-info", selectedPatientId],
    queryFn: async () => {
      const res = await apiFetch<Record<string, unknown>>(`/api/patients/${selectedPatientId}`);
      return (res?.patient ?? res) as { firstName?: string; lastName?: string; middleName?: string | null; patientCode?: string };
    },
    enabled: mode === "create" && !!selectedPatientId && !pickedPatient,
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
  const [maxIdx, setMaxIdx] = useState(0);
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
    if (ok) { setStepIdx((i) => Math.min(steps.length - 1, i + 1)); setMaxIdx((m) => Math.max(m, Math.min(steps.length - 1, stepIdx + 1))); }
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
      ...schedule,
    };
    // POST (create) expects precautions nested; PATCH (edit) expects them flat and must not carry a status change
    return mode === "create"
      ? { episodeId: v.episodeId, status: activate ? "ACTIVE" : "DRAFT", ...shared, precautions }
      : { ...shared, ...precautions };
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

  // ---------- unsaved-changes protection (cancel, breadcrumb, sidebar, tab close) ----------
  const dirty = form.formState.isDirty && !submitMutation.isSuccess;
  const requestLeave = () => { if (dirty) setLeaveOpen(true); else onCancel(); };
  const finishLeave = () => {
    setLeaveOpen(false);
    setNavGuard(null);
    const go = pendingLeave.current;
    pendingLeave.current = null;
    if (go) go(); else onCancel();
  };
  useEffect(() => {
    if (!dirty) return;
    setNavGuard((proceed) => { pendingLeave.current = proceed; setLeaveOpen(true); return true; });
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", h); };
  }, [dirty]);

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

  const patientForStrip = mode === "create"
    ? (pickedPatient ?? patientInfoQ.data ?? null)
    : (source?.episode.patient ?? null);
  const stripName = patientForStrip ? fullName(patientForStrip as never) : "";
  const stripCode = (patientForStrip as { patientCode?: string } | null)?.patientCode || "";
  const stripPatientId = mode === "create" ? selectedPatientId : source?.episode.patient.id;
  const stripEpisode = mode === "create" ? selectedEpisode?.title : source?.episode.title;

  // gate (create): wait for a preselected episode to resolve before showing the pop-up
  const awaitingPreselect = !!preselectEpisodeId && !episodesQuery.isError && (episodesQuery.isLoading || !episodesQuery.data);
  const showGate = mode === "create" && !episodeIdWatch && !awaitingPreselect;

  const stepDone = (key: string): boolean => {
    switch (key) {
      case "objectives": return (objectivesWatch || []).some((o) => o?.description?.trim());
      case "milestones": return (milestonesWatch || []).some((m) => m?.description?.trim());
      case "interventions": return (interventionsWatch || []).some((iv) => iv?.name?.trim());
      case "schedule": return !!(intOrNull(perWeekW) || intOrNull(totalW) || startW);
      case "precautions": return false;
      default: return false;
    }
  };

  return (
    <div className="space-y-4">
      <PageBreadcrumb items={[{ label: "Treatment Plans", onClick: requestLeave }, { label: title }]} />
      <PageHeader title={title} description={subtitle} icon="ClipboardList" />

      {/* patient strip */}
      {(mode !== "create" || episodeIdWatch) ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">
              {initials(stripName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {stripPatientId && stripName ? (
                    <button type="button" title="Open patient profile" className="truncate text-left transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: stripPatientId })}>{stripName}</button>
                  ) : (stripName || "—")}
                </p>
                {stripCode ? <span className="rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy-800">{stripCode}</span> : null}
                {source ? <StatusBadge status={source.status} /> : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">{stripEpisode || "—"}</p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-1">
            <div><dt className="label-caps-sm">Mode</dt><dd className="text-sm font-medium">{mode === "create" ? "New plan" : mode === "edit" ? "Editing draft" : "Revising"}</dd></div>
            {source ? <div><dt className="label-caps-sm">Version</dt><dd className="text-sm font-medium">v{source.version}</dd></div> : null}
          </dl>
        </div>
      ) : null}

      <div className="grid w-full gap-5 lg:grid-cols-[290px_minmax(0,1fr)] *:min-w-0">
        {/* step list + live summary */}
        <div className="hidden space-y-3 self-start lg:sticky lg:top-28 lg:block">
          <nav className="rounded-xl border bg-white p-2 shadow-sm">
            {steps.map((st, i) => {
              const done = stepDone(st.key);
              const reachable = i <= maxIdx;
              return (
                <button
                  key={st.key}
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStepIdx(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === stepIdx ? "bg-teal-50 font-semibold text-teal-800" : reachable ? "text-muted-foreground hover:bg-muted/60" : "text-muted-foreground/50"
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    done ? "border-emerald-300 bg-emerald-100 text-emerald-700" : i === stepIdx ? "border-teal-400 bg-teal-100 text-teal-700" : "border-border"
                  }`}>
                    <AtomIcon name={done ? "Check" : st.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{st.label}</span>
                  {st.key !== "review" ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{["objectives", "interventions"].includes(st.key) ? "Core" : "Optional"}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <p className="label-caps-sm">Plan summary</p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs *:min-w-0">
              <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{(objectivesWatch || []).filter((o) => o?.description?.trim()).length}</p><p className="text-[10px] text-muted-foreground">Objectives</p></div>
              <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{(milestonesWatch || []).filter((m) => m?.description?.trim()).length}</p><p className="text-[10px] text-muted-foreground">Milestones</p></div>
              <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{(interventionsWatch || []).filter((iv) => iv?.name?.trim()).length}</p><p className="text-[10px] text-muted-foreground">Interventions</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs *:min-w-0">
              <div><p className="text-muted-foreground">Sessions / week</p><p className="font-medium">{intOrNull(perWeekW) ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Total sessions</p><p className="font-medium">{intOrNull(totalW) ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Start</p><p className="font-medium">{startW || "—"}</p></div>
              <div><p className="text-muted-foreground">End</p><p className="font-medium">{endW || "—"}</p></div>
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 space-y-4 **:data-[slot=card]:w-full">
      {/* mobile / tablet step chips */}
      <div className="custom-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {steps.map((st, i) => {
          const isCurrent = i === stepIdx;
          const isPast = i < stepIdx;
          return (
            <button
              key={st.key}
              type="button"
              disabled={i > maxIdx}
              onClick={() => setStepIdx(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCurrent ? "border-navy-800 bg-navy-800 text-white" : isPast ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-muted-foreground"
              }`}
            >
              {isPast ? <AtomIcon name="Check" className="h-3 w-3" /> : <span>{i + 1}</span>}
              {st.label}
            </button>
          );
        })}
      </div>

      {/* ---------- STEP: objectives ---------- */}
      {step.key === "objectives" ? <ObjectivesStep form={form} fields={objectiveFields} onAdd={() => appendObjective({ ...emptyObjective })} onRemove={removeObjective} /> : null}

      {/* ---------- STEP: milestones ---------- */}
      {step.key === "milestones" ? <MilestonesStep form={form} fields={milestoneFields} onAdd={() => appendMilestone({ ...emptyMilestone })} onRemove={removeMilestone} objectives={objectivesWatch} /> : null}

      {/* ---------- STEP: interventions ---------- */}
      {step.key === "interventions" ? <InterventionsStep form={form} fields={interventionFields} onAdd={() => appendIntervention({ ...emptyIntervention })} onRemove={removeIntervention} /> : null}

      {/* ---------- STEP: schedule ---------- */}
      {step.key === "schedule" ? <ScheduleStep form={form} /> : null}

      {/* ---------- STEP: precautions ---------- */}
      {step.key === "precautions" ? <PrecautionsStep form={form} /> : null}

      {/* ---------- STEP: review ---------- */}
      {step.key === "review" ? <ReviewStep form={form} mode={mode} objectives={objectivesWatch} milestones={milestonesWatch} interventions={interventionsWatch} perWeek={perWeekW} total={totalW} duration={durationW} start={startW} end={endW} episodeLabel={selectedEpisode?.title || episodeIdWatch || "—"} /> : null}

      {/* ---------- sticky action bar ---------- */}
      <div className="sticky bottom-0 z-10 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="toolbar-row">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={requestLeave} disabled={submitMutation.isPending}>
              <AtomIcon name="ArrowLeft" className="h-4 w-4" />Back to list
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Step {stepIdx + 1} of {steps.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stepIdx > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setStepIdx((i) => i - 1)} disabled={submitMutation.isPending}>Previous</Button>
            ) : null}
            {stepIdx < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={goNext} className="bg-navy-800 text-white hover:bg-navy-900">
                Continue <AtomIcon name="ArrowRight" className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" disabled={submitMutation.isPending} onClick={saveDraft}>
                  {submitMutation.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Save" className="mr-1.5 h-4 w-4" />}
                  {mode === "revise" ? "Save new version (draft)" : mode === "edit" ? "Save changes" : "Save draft"}
                </Button>
                <Button type="button" size="sm" className="bg-teal-600 text-white hover:bg-teal-700" disabled={submitMutation.isPending} onClick={saveActivate}>
                  {submitMutation.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Zap" className="mr-1.5 h-4 w-4" />}
                  {mode === "revise" ? "Save & activate new version" : "Save & activate"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
        </div>
      </div>

      {/* start pop-up: choose patient & episode (new plans only) */}
      <Dialog open={showGate} onOpenChange={(v) => { if (!v) onCancel(); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Start treatment plan</DialogTitle>
            <DialogDescription>Plans are created against an open treatment episode that already has a completed assessment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Patient">
              <PatientSearchSelect
                autoFocus
                selected={pickedPatient}
                onSelect={(pt) => { setPickedPatient(pt); setSelectedPatientId(pt.id); form.setValue("episodeId", ""); }}
                onClear={() => { setPickedPatient(null); setSelectedPatientId(""); form.setValue("episodeId", ""); }}
              />
            </Field>
            {selectedPatientId ? (
              <Field label="Treatment episode">
                {episodesQuery.isLoading ? <Skeleton className="h-9 w-full" /> : null}
                {episodesQuery.data && episodesQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open episodes for this patient — open an episode in the Patients module first.</p>
                ) : null}
                {episodesQuery.data && episodesQuery.data.length > 0 ? (
                  <Select value={episodeIdWatch || ""} onValueChange={(v) => form.setValue("episodeId", v, { shouldValidate: true })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select episode…" /></SelectTrigger>
                    <SelectContent>
                      {episodesQuery.data.map((e) => (
                        <SelectItem key={e.id} value={e.id} disabled={["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS"].includes(e.status)}>
                          {e.episodeNumber ? `#${e.episodeNumber} · ` : ""}{e.title} · {e.status.replace(/_/g, " ").toLowerCase()}
                          {["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS"].includes(e.status) ? " — complete assessment first" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </Field>
            ) : null}
            <p className="text-xs text-muted-foreground">Choosing an episode opens the plan form.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this plan?</DialogTitle>
            <DialogDescription>You have unsaved changes. Leaving will discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
