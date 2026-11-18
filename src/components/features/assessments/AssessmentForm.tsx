"use client";
// ============ AssessmentForm: 8-section clinical assessment editor + read-only completed view ============

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/molecules/page-header";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { FUNCTIONAL_ACTIVITIES, PERMS, labelize } from "@/lib/constants";
import { formatDate, fullName, initials } from "@/lib/format";
import { useAuthStore, hasPermission, setNavGuard } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import * as API from "./assessments-api";
import { FormValues, EMPTY_FORM, SECTIONS, toFormValues, buildPayload, validateForComplete } from "./assessment-form-model";
import { Field } from "./AssessmentFormParts";
import { PatientSearchSelect } from "./PatientSearchSelect";
import { CompletedView } from "./CompletedView";
import { ComplaintStep, PainStep, ExaminationStep, FunctionalStep, VitalsStep, FindingsStep, ReviewStep } from "./AssessmentFormSteps";

// ===================== props =====================
export interface AssessmentFormTarget { assessmentId?: string | null; patientId?: string; episodeId?: string }
interface AssessmentFormProps {
  target: AssessmentFormTarget;
  onTargetChange: (t: AssessmentFormTarget) => void;
  onDone: (id?: string) => void;
  onBack: () => void;
}

export default function AssessmentForm({ target, onTargetChange, onDone, onBack }: AssessmentFormProps) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const assessmentId = target.assessmentId || null;

  const detailQ = useQuery({
    queryKey: ["assessments", "detail", assessmentId],
    queryFn: () => API.fetchAssessment(assessmentId as string),
    enabled: !!assessmentId,
  });
  const detail = detailQ.data;
  const viewCompleted = !!detail && detail.status === "COMPLETED";

  // Entry state (create mode)
  const [patient, setPatient] = useState<API.PatientLite | null>(null);
  const [episode, setEpisode] = useState<API.EpisodeLite | null>(null);
  const [selectedTherapistId, setTherapistId] = useState("");
  const [step, setStep] = useState(1); // step 0 (visit info) now lives in the patient strip
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null); // set when a sidebar click was intercepted
  const [reviewVisited, setReviewVisited] = useState(false);
  const [customActivity, setCustomActivity] = useState("");

  const bundleQ = useQuery({
    queryKey: ["assessments", "bundle", patient?.id],
    queryFn: () => API.fetchPatientBundle(patient!.id),
    enabled: !!patient?.id && !assessmentId,
  });
  const therapistsQ = useQuery({
    queryKey: ["assessments", "therapists"],
    queryFn: API.fetchTherapists,
    staleTime: 5 * 60_000,
  });

  const therapistId = selectedTherapistId || therapistsQ.data?.[0]?.id || "";

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM });
  const romArr = useFieldArray({ control: form.control, name: "rom" });
  const strengthArr = useFieldArray({ control: form.control, name: "strength" });
  const fnArr = useFieldArray({ control: form.control, name: "functional" });
  const values = useWatch({ control: form.control }) as FormValues;

  // hydrate from an existing assessment
  useEffect(() => {
    if (!detail) return;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate local state from the loaded assessment */
    setPatient((detail.episode?.patient as API.PatientLite) ?? null);
    setEpisode((detail.episode as API.EpisodeLite) ?? null);
    setTherapistId(detail.therapistId);
    /* eslint-enable react-hooks/set-state-in-effect */
    form.reset(toFormValues(detail));
  }, [detail?.id]);

  // resolve prefill targets from navigation
  useEffect(() => {
    if (assessmentId || patient) return;
    const pid = target.patientId;
    const eid = target.episodeId;
    if (!pid && !eid) return;
    let cancelled = false;
    (async () => {
      if (pid) {
        const bundle = await API.fetchPatientBundle(pid);
        if (cancelled || !bundle) return;
        setPatient(bundle.patient);
        const open = bundle.episodes.filter((e) => API.OPEN_EPISODE_STATUSES.includes(e.status || ""));
        const found = eid ? bundle.episodes.find((e) => e.id === eid) : undefined;
        setEpisode(found ?? open[0] ?? bundle.episodes[0] ?? null);
      } else if (eid) {
        try {
          const res = await API.fetchAssessments({ episodeId: eid, pageSize: 1 });
          const item = res.items?.[0];
          if (!cancelled && item?.episode?.patient) {
            setPatient(item.episode.patient as API.PatientLite);
            setEpisode(item.episode as API.EpisodeLite);
          }
        } catch { /* fall through to manual selection */ }
      }
    })();
    return () => { cancelled = true; };
  }, [assessmentId, target.patientId, target.episodeId, patient?.id]);

  // Adopt an existing DRAFT assessment for the selected episode instead of creating a
  // duplicate record on completion (completed records must stay unique per draft chain).
  const draftAdoptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (assessmentId || !episode?.id || draftAdoptedFor.current === episode.id) return;
    let cancelled = false;
    draftAdoptedFor.current = episode.id;
    (async () => {
      try {
        const res = await API.fetchAssessments({ episodeId: episode.id, status: "DRAFT", pageSize: 1 });
        const draftId = res.items?.[0]?.id;
        if (!cancelled && draftId) onTargetChange({ assessmentId: draftId });
      } catch { /* non-fatal: fall through to create-on-complete */ }
    })();
    return () => { cancelled = true; };
  }, [assessmentId, episode?.id]);

  const episodeOptions = useMemo(() => {
    const eps = bundleQ.data?.episodes || [];
    const open = eps.filter((e) => API.OPEN_EPISODE_STATUSES.includes(e.status || ""));
    if (episode && !open.some((e) => e.id === episode.id)) return [episode, ...open];
    return open;
  }, [bundleQ.data, episode]);

  const activityOptions = useMemo(() => {
    const used = (values.functional || []).map((r) => r.activity).filter(Boolean);
    return [...new Set([...FUNCTIONAL_ACTIVITIES, ...used])];
  }, [values.functional]);

  const isSectionComplete = (i: number): boolean => {
    const v = values;
    switch (i) {
      case 0: return !!(episode || detail);
      case 1: return !!(v.primaryComplaint?.trim() && v.bodyPart);
      case 2: return v.painCurrent !== undefined || v.painWorst !== undefined || !!v.painLocation;
      case 3: return (v.rom?.length ?? 0) + (v.strength?.length ?? 0) > 0 || !!(v.posture || v.gait || v.swelling || v.deformity);
      case 4: return (v.functional?.length ?? 0) > 0;
      case 5: return !!(v.bloodPressure || v.heartRate || v.respiratoryRate || v.temperature || v.oxygenSaturation || v.weightKg || v.heightCm);
      case 6: return !!(v.clinicalFindings || v.clinicalImpression || v.impairments || v.functionalLimitations);
      case 7: return reviewVisited;
      default: return false;
    }
  };
  const NAV = SECTIONS.map((sec, i) => ({ ...sec, i })).filter((x) => x.i > 0);
  const completedCount = NAV.reduce((acc, x) => acc + (isSectionComplete(x.i) ? 1 : 0), 0);
  const problem = validateForComplete(values);
  const REQUIRED = new Set([1]);
  const hasError = (i: number) => reviewVisited && problem?.section === i;

  const goTo = (i: number) => {
    setStep(i);
    if (i === 7) setReviewVisited(true);
  };

  const saveQ = useMutation({
    mutationFn: async (p: { status: "DRAFT" | "COMPLETED" }) => {
      if (!patient || !episode) throw new Error("Select a patient and episode first");
      if (!therapistId) throw new Error("Select the assessing therapist");
      const payload = buildPayload(values, { episodeId: episode.id, therapistId, status: p.status });
      return assessmentId ? API.updateAssessment(assessmentId, payload) : API.createAssessment(payload);
    },
    onSuccess: (data, p) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      if (p.status === "COMPLETED") {
        toast.success("Assessment completed", { description: "The episode is now awaiting a treatment plan." });
        onDone(data.id);
      } else {
        toast.success("Draft saved");
        setSavedAt(new Date());
        form.reset(form.getValues());
        if (!assessmentId && data?.id) onTargetChange({ assessmentId: data.id });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save assessment"),
  });

  // warn before closing/reloading the tab with unsaved edits
  useEffect(() => {
    if (!form.formState.isDirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [form.formState.isDirty]);

  // leaving the form: confirm first when there are unsaved edits
  const requestLeave = () => { if (form.formState.isDirty) setLeaveOpen(true); else onBack(); };
  const finishLeave = () => {
    setLeaveOpen(false);
    setNavGuard(null);
    const go = pendingLeave.current;
    pendingLeave.current = null;
    if (go) go(); else onBack();
  };

  // intercept sidebar navigation while there are unsaved edits
  const dirty = form.formState.isDirty;
  useEffect(() => {
    if (!dirty) return;
    setNavGuard((proceed) => { pendingLeave.current = proceed; setLeaveOpen(true); return true; });
    return () => setNavGuard(null);
  }, [dirty]);

  const saveDraft = () => saveQ.mutate({ status: "DRAFT" });

  const complete = () => {
    const problem = validateForComplete(values);
    if (problem) {
      toast.error(problem.message);
      goTo(problem.section);
      return;
    }
    if (!therapistId) {
      toast.error("Select the assessing therapist");
      return;
    }
    saveQ.mutate({ status: "COMPLETED" });
  };

  // ---------- loading / error ----------
  if (assessmentId && detailQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (assessmentId && detailQ.isError) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Assessment not found"
        description="This assessment may have been removed."
        action={<Button variant="outline" onClick={onBack}>Back to list</Button>}
      />
    );
  }

  // ---------- completed read-only view ----------
  if (viewCompleted && detail) {
    return (
      <CompletedView
        detail={detail}
        canManage={canManage}
        onReplaced={(id) => {
          qc.invalidateQueries({ queryKey: ["assessments"] });
          onTargetChange({ assessmentId: id });
          setStep(1);
          setReviewVisited(false);
        }}
        onBack={onBack}
      />
    );
  }

  const therapistName = therapistsQ.data?.find((t) => t.id === therapistId);
  const ready = !!(patient && episode && therapistId);

  return (
    <div className="pb-2">
      <PageBreadcrumb items={[{ label: "Assessments", onClick: requestLeave }, { label: assessmentId ? "Assessment (draft)" : "New assessment" }]} />
      <PageHeader
        title={assessmentId ? "Assessment (draft)" : "New assessment"}
        description={patient ? `${fullName(patient)} · ${episode?.title || ""}` : "Select a patient and episode to begin"}
        icon="ClipboardList"
      />

      {ready ? (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">
              {initials(patient ? fullName(patient) : "")}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">{patient ? fullName(patient) : "—"}</p>
                {patient?.patientCode ? <span className="rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy-800">{patient.patientCode}</span> : null}
                {episode?.status ? <StatusBadge status={episode.status} /> : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">{episode?.title || "—"}</p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-1">
            <div><dt className="label-caps-sm">Date</dt><dd className="text-sm font-medium">{detail ? formatDate(detail.assessmentDate) : formatDate(new Date())}</dd></div>
            <div><dt className="label-caps-sm">Therapist</dt><dd className="text-sm font-medium">{therapistName ? fullName(therapistName) : "—"}</dd></div>
            <div><dt className="label-caps-sm">Status</dt><dd className="text-sm font-medium">{detail?.status ? labelize(detail.status) : "Draft"}</dd></div>
          </dl>
        </div>
      ) : null}

      {/* Entry gate */}
      {!ready ? (
        <Dialog open onOpenChange={(v) => { if (!v) onBack(); }}>
          <DialogContent
            showCloseButton={false}
            className="sm:max-w-lg"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Start assessment</DialogTitle>
              <DialogDescription>Choose the patient, episode and assessing therapist.</DialogDescription>
            </DialogHeader>
          <div className="space-y-4">
            <Field label="Patient">
              <PatientSearchSelect
                autoFocus
                selected={patient}
                onSelect={(p) => { setPatient(p); setEpisode(null); }}
                onClear={() => { setPatient(null); setEpisode(null); }}
              />
            </Field>
            {patient ? (
              <Field label="Episode" hint="Only episodes open for assessment are listed">
                <Select value={episode?.id || undefined} onValueChange={(v) => setEpisode(episodeOptions.find((e) => e.id === v) || null)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select episode…" /></SelectTrigger>
                  <SelectContent>
                    {episodeOptions.length ? episodeOptions.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title || `Episode ${e.episodeNumber ?? ""}`} {e.status ? `· ${labelize(e.status)}` : ""}
                      </SelectItem>
                    )) : <SelectItem value="_none" disabled>No open episodes for this patient</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {patient && episode ? (
              <Field label="Assessing therapist">
                {therapistsQ.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={therapistId || undefined} onValueChange={setTherapistId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select therapist…" /></SelectTrigger>
                    <SelectContent>
                      {(therapistsQ.data || []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{fullName(t)}{t.jobTitle ? ` — ${t.jobTitle}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ) : null}
            {ready ? null : (
              <p className="text-xs text-muted-foreground">
                {therapistsQ.data && !therapistsQ.data.length && patient && episode
                  ? "No active therapists found."
                  : "Complete all three to open the assessment form."}
              </p>
            )}
          </div>
            <DialogFooter>
              <Button variant="outline" onClick={onBack}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <>
          {/* progress */}
          <div className="mb-4 flex items-center gap-3">
            <Progress value={(completedCount / NAV.length) * 100} className="h-2 flex-1" />
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{completedCount}/{NAV.length} sections complete</span>
          </div>

          {/* mobile section chips */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar md:hidden">
            {NAV.map((s) => { const i = s.i; return (
              <button
                key={s.key}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  i === step ? "border-teal-500 bg-teal-50 text-teal-700" : isSectionComplete(i) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-white text-muted-foreground",
                )}
              >
                {isSectionComplete(i) ? <AtomIcon name="Check" className="h-3 w-3" /> : <span>{i + 1}</span>}
                {s.label}
              </button>
            ); })}
          </div>

          <div className="grid w-full gap-5 lg:grid-cols-[290px_minmax(0,1fr)] *:min-w-0">
            {/* section nav */}
            <div className="hidden space-y-3 self-start lg:sticky lg:top-28 lg:block">
            <nav className="rounded-xl border bg-white p-2 shadow-sm">
              {NAV.map((s) => {
                const i = s.i;
                const done = isSectionComplete(i);
                const err = hasError(i);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => goTo(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === step ? "bg-teal-50 font-semibold text-teal-800" : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                      err ? "border-rose-300 bg-rose-50 text-rose-600" : done ? "border-emerald-300 bg-emerald-100 text-emerald-700" : i === step ? "border-teal-400 bg-teal-100 text-teal-700" : "border-border text-muted-foreground",
                    )}>
                      <AtomIcon name={err ? "AlertCircle" : done ? "Check" : s.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {err ? <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Needs attention" />
                      : i < 7 ? <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{REQUIRED.has(i) ? "Required" : "Optional"}</span> : null}
                  </button>
                );
              })}
            </nav>
              <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                <p className="label-caps-sm">Case summary</p>
                <div className="grid grid-cols-3 gap-2 *:min-w-0">
                  {[{ l: "Now", v: values.painCurrent }, { l: "Worst", v: values.painWorst }, { l: "Lowest", v: values.painLowest }].map((p) => (
                    <div key={p.l} className="rounded-lg border bg-slate-50/70 px-2 py-1.5 text-center">
                      <p className="text-base font-semibold leading-tight">{p.v ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{p.l}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Primary complaint</p>
                  <p className="line-clamp-4 text-sm">{values.primaryComplaint?.trim() || "—"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs *:min-w-0">
                  <div><p className="text-muted-foreground">Body part</p><p className="font-medium">{(values.bodyPart === "Other" ? values.bodyPartCustom : values.bodyPart) || "—"}</p></div>
                  <div><p className="text-muted-foreground">Side</p><p className="font-medium">{values.affectedSide ? labelize(values.affectedSide) : "—"}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs *:min-w-0">
                  <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{values.rom?.length ?? 0}</p><p className="text-[10px] text-muted-foreground">ROM</p></div>
                  <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{values.strength?.length ?? 0}</p><p className="text-[10px] text-muted-foreground">Strength</p></div>
                  <div className="rounded-lg border px-2 py-1.5"><p className="font-semibold">{values.functional?.length ?? 0}</p><p className="text-[10px] text-muted-foreground">Functional</p></div>
                </div>
                {values.precautions?.trim() ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700"><AtomIcon name="AlertTriangle" className="h-3 w-3" />Precautions</p>
                    <p className="mt-0.5 line-clamp-3 text-xs text-amber-900">{values.precautions}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* section content */}
            <div className="w-full min-w-0 **:data-[slot=card]:w-full">
              {step === 1 ? <ComplaintStep form={form} values={values} /> : null}

              {step === 2 ? <PainStep form={form} values={values} /> : null}

              {step === 3 ? <ExaminationStep form={form} values={values} romArr={romArr} strengthArr={strengthArr} /> : null}

              {step === 4 ? <FunctionalStep form={form} values={values} fnArr={fnArr} activityOptions={activityOptions} customActivity={customActivity} setCustomActivity={setCustomActivity} /> : null}

              {step === 5 ? <VitalsStep form={form} /> : null}

              {step === 6 ? <FindingsStep form={form} /> : null}

              {step === 7 ? <ReviewStep values={values} problem={problem} episode={episode} goTo={goTo} complete={complete} /> : null}

              {/* sticky action bar */}
              <div className="sticky bottom-0 z-10 mt-5 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                <div className="toolbar-row">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={requestLeave}>
                      <AtomIcon name="ArrowLeft" className="h-4 w-4" />Back to list
                    </Button>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      Step {step} of {NAV.length}
                      {savedAt ? ` · Draft saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" disabled={saveQ.isPending || !canManage} onClick={saveDraft}>
                      <AtomIcon name="Save" className="h-4 w-4" />{saveQ.isPending ? "Saving…" : "Save draft"}
                    </Button>
                    {step > 1 ? (
                      <Button variant="outline" size="sm" onClick={() => goTo(step - 1)}>Previous</Button>
                    ) : null}
                    {step < SECTIONS.length - 1 ? (
                      <Button size="sm" onClick={() => goTo(step + 1)}>Continue<AtomIcon name="ArrowRight" className="h-4 w-4" /></Button>
                    ) : (
                      <Button size="sm" disabled={saveQ.isPending || !canManage} onClick={complete}>
                        <AtomIcon name="CheckCircle2" className="h-4 w-4" />{saveQ.isPending ? "Completing…" : "Complete Assessment"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this assessment?</DialogTitle>
            <DialogDescription>You have unsaved changes. Save a draft to keep them, or leave and discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard & leave</Button>
            <Button
              disabled={saveQ.isPending || !canManage}
              onClick={() => saveQ.mutate({ status: "DRAFT" }, { onSuccess: finishLeave })}
            >
              {saveQ.isPending ? "Saving…" : "Save draft & leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
