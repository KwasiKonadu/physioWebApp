"use client";
// ============ AssessmentForm: 8-section clinical assessment editor + read-only completed view ============
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { BODY_PARTS, SIDES, FUNCTIONAL_ACTIVITIES, FUNCTIONAL_DIFFICULTY_LABELS, PERMS, labelize } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import * as API from "./assessments-api";

// ===================== types =====================
interface RomFormRow { bodyPart: string; movement: string; side: string; activeRom: string; passiveRom: string; normalValue: string; notes: string }
interface StrengthFormRow { bodyPart: string; muscleGroup: string; side: string; grade: string; notes: string }
interface FunctionalFormRow { activity: string; difficulty: string; notes: string }

interface FormValues {
  primaryComplaint: string; bodyPart: string; bodyPartCustom: string; affectedSide: string;
  duration: string; onset: string; cause: string; aggravating: string; relieving: string;
  previousTreatment: string; additionalHistory: string;
  painCurrent?: number; painWorst?: number; painLowest?: number;
  painLocation: string; painType: string; painFrequency: string; painNotes: string;
  posture: string; swelling: string; deformity: string; skinCondition: string; muscleWasting: string; gait: string;
  rom: RomFormRow[]; strength: StrengthFormRow[]; functional: FunctionalFormRow[];
  bloodPressure: string; heartRate: string; respiratoryRate: string; temperature: string;
  oxygenSaturation: string; weightKg: string; heightCm: string;
  clinicalFindings: string; impairments: string; functionalLimitations: string;
  clinicalImpression: string; precautions: string; additionalNotes: string; therapistSignature: string;
}

const EMPTY_FORM: FormValues = {
  primaryComplaint: "", bodyPart: "", bodyPartCustom: "", affectedSide: "",
  duration: "", onset: "", cause: "", aggravating: "", relieving: "",
  previousTreatment: "", additionalHistory: "",
  painLocation: "", painType: "", painFrequency: "", painNotes: "",
  posture: "", swelling: "", deformity: "", skinCondition: "", muscleWasting: "", gait: "",
  rom: [], strength: [], functional: [],
  bloodPressure: "", heartRate: "", respiratoryRate: "", temperature: "", oxygenSaturation: "", weightKg: "", heightCm: "",
  clinicalFindings: "", impairments: "", functionalLimitations: "", clinicalImpression: "",
  precautions: "", additionalNotes: "", therapistSignature: "",
};

const SECTIONS = [
  { key: "visit", label: "Visit info", icon: "CalendarDays" },
  { key: "complaint", label: "Presenting complaint", icon: "MessageSquareText" },
  { key: "pain", label: "Pain assessment", icon: "Activity" },
  { key: "exam", label: "Physical examination", icon: "Stethoscope" },
  { key: "functional", label: "Functional assessment", icon: "Accessibility" },
  { key: "vitals", label: "Vital signs", icon: "HeartPulse" },
  { key: "findings", label: "Clinical findings", icon: "ClipboardCheck" },
  { key: "review", label: "Review & complete", icon: "ListChecks" },
] as const;

const MRC_GRADES = ["0", "1", "2", "3", "4", "5"] as const;
const MRC_LABELS: Record<string, string> = {
  "0": "0 — No contraction", "1": "1 — Flicker/trace", "2": "2 — Active, gravity eliminated",
  "3": "3 — Active against gravity", "4": "4 — Active against resistance", "5": "5 — Normal power",
};

function toFormValues(d: API.AssessmentDetail): FormValues {
  const bodyInList = (BODY_PARTS as readonly string[]).includes(d.bodyPart || "");
  const s = (v?: number | string | null) => (v === null || v === undefined ? "" : String(v));
  return {
    primaryComplaint: d.primaryComplaint || "",
    bodyPart: d.bodyPart ? (bodyInList ? d.bodyPart : "Other") : "",
    bodyPartCustom: bodyInList ? "" : (d.bodyPart || ""),
    affectedSide: d.affectedSide || "",
    duration: d.duration || "", onset: d.onset || "", cause: d.cause || "",
    aggravating: d.aggravating || "", relieving: d.relieving || "",
    previousTreatment: d.previousTreatment || "", additionalHistory: d.additionalHistory || "",
    painCurrent: d.painCurrent ?? undefined, painWorst: d.painWorst ?? undefined, painLowest: d.painLowest ?? undefined,
    painLocation: d.painLocation || "", painType: d.painType || "", painFrequency: d.painFrequency || "", painNotes: d.painNotes || "",
    posture: d.posture || "", swelling: d.swelling || "", deformity: d.deformity || "",
    skinCondition: d.skinCondition || "", muscleWasting: d.muscleWasting || "", gait: d.gait || "",
    rom: (d.romMeasurements || []).map((r) => ({
      bodyPart: r.bodyPart, movement: r.movement, side: r.side,
      activeRom: s(r.activeRom), passiveRom: s(r.passiveRom), normalValue: s(r.normalValue), notes: r.notes || "",
    })),
    strength: (d.strengthMeasurements || []).map((r) => ({
      bodyPart: r.bodyPart, muscleGroup: r.muscleGroup, side: r.side, grade: s(r.grade), notes: r.notes || "",
    })),
    functional: (d.functionalItems || []).map((r) => ({
      activity: r.activity, difficulty: s(r.difficulty), notes: r.notes || "",
    })),
    bloodPressure: d.bloodPressure || "",
    heartRate: s(d.heartRate), respiratoryRate: s(d.respiratoryRate), temperature: s(d.temperature),
    oxygenSaturation: s(d.oxygenSaturation), weightKg: s(d.weightKg), heightCm: s(d.heightCm),
    clinicalFindings: d.clinicalFindings || "", impairments: d.impairments || "",
    functionalLimitations: d.functionalLimitations || "", clinicalImpression: d.clinicalImpression || "",
    precautions: d.precautions || "", additionalNotes: d.additionalNotes || "", therapistSignature: d.therapistSignature || "",
  };
}

function numOrNull(v?: string | null): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildPayload(v: FormValues, opts: { episodeId: string; therapistId: string; status: "DRAFT" | "COMPLETED" }): Record<string, unknown> {
  const bodyPart = v.bodyPart === "Other" ? (v.bodyPartCustom.trim() || null) : (v.bodyPart || null);
  return {
    episodeId: opts.episodeId,
    therapistId: opts.therapistId,
    status: opts.status,
    primaryComplaint: v.primaryComplaint.trim() || null,
    bodyPart,
    affectedSide: v.affectedSide || null,
    duration: v.duration.trim() || null,
    onset: v.onset || null,
    cause: v.cause.trim() || null,
    aggravating: v.aggravating.trim() || null,
    relieving: v.relieving.trim() || null,
    previousTreatment: v.previousTreatment.trim() || null,
    additionalHistory: v.additionalHistory.trim() || null,
    painCurrent: v.painCurrent ?? null,
    painWorst: v.painWorst ?? null,
    painLowest: v.painLowest ?? null,
    painLocation: v.painLocation.trim() || null,
    painType: v.painType.trim() || null,
    painFrequency: v.painFrequency.trim() || null,
    painNotes: v.painNotes.trim() || null,
    posture: v.posture.trim() || null,
    swelling: v.swelling.trim() || null,
    deformity: v.deformity.trim() || null,
    skinCondition: v.skinCondition.trim() || null,
    muscleWasting: v.muscleWasting.trim() || null,
    gait: v.gait.trim() || null,
    bloodPressure: v.bloodPressure.trim() || null,
    heartRate: numOrNull(v.heartRate),
    respiratoryRate: numOrNull(v.respiratoryRate),
    temperature: numOrNull(v.temperature),
    oxygenSaturation: numOrNull(v.oxygenSaturation),
    weightKg: numOrNull(v.weightKg),
    heightCm: numOrNull(v.heightCm),
    clinicalFindings: v.clinicalFindings.trim() || null,
    impairments: v.impairments.trim() || null,
    functionalLimitations: v.functionalLimitations.trim() || null,
    clinicalImpression: v.clinicalImpression.trim() || null,
    precautions: v.precautions.trim() || null,
    additionalNotes: v.additionalNotes.trim() || null,
    therapistSignature: v.therapistSignature.trim() || null,
    rom: (v.rom || [])
      .filter((r) => r.bodyPart.trim() && r.movement.trim() && r.side)
      .map((r) => ({
        bodyPart: r.bodyPart.trim(), movement: r.movement.trim(), side: r.side,
        activeRom: numOrNull(r.activeRom), passiveRom: numOrNull(r.passiveRom), normalValue: numOrNull(r.normalValue),
        notes: r.notes.trim() || null,
      })),
    strength: (v.strength || [])
      .filter((r) => r.bodyPart.trim() && r.muscleGroup.trim() && r.side)
      .map((r) => ({
        bodyPart: r.bodyPart.trim(), muscleGroup: r.muscleGroup.trim(), side: r.side,
        grade: Number(r.grade || 0), notes: r.notes.trim() || null,
      })),
    functional: (v.functional || [])
      .filter((r) => r.activity.trim())
      .map((r) => ({ activity: r.activity.trim(), difficulty: Number(r.difficulty || 0), notes: r.notes.trim() || null })),
  };
}

function validateForComplete(v: FormValues): { section: number; message: string } | null {
  if (!v.primaryComplaint.trim()) return { section: 1, message: "Primary complaint is required to complete an assessment" };
  if (v.bodyPart === "Other" && !v.bodyPartCustom.trim()) return { section: 1, message: "Enter the custom body part" };
  const romIdx = (v.rom || []).findIndex((r) => (r.bodyPart || r.movement || r.side || r.activeRom || r.passiveRom || r.normalValue) && (!r.bodyPart || !r.movement || !r.side));
  if (romIdx >= 0) return { section: 3, message: `ROM row ${romIdx + 1}: body part, movement and side are required (or clear the row)` };
  const strIdx = (v.strength || []).findIndex((r) => (r.bodyPart || r.muscleGroup || r.notes) && (!r.bodyPart || !r.muscleGroup || !r.side));
  if (strIdx >= 0) return { section: 3, message: `Muscle strength row ${strIdx + 1}: body part, muscle group and side are required` };
  const fnIdx = (v.functional || []).findIndex((r) => !r.activity && r.notes);
  if (fnIdx >= 0) return { section: 4, message: `Functional row ${fnIdx + 1}: choose an activity (or clear the row)` };
  return null;
}

// ===================== small presentational helpers =====================
function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DRow({ label, value }: { label: string; value?: string | number | null }) {
  return <DetailRow label={label} value={value === null || value === undefined || value === "" ? "—" : String(value)} />;
}

function PainSlider({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="min-w-9 justify-center bg-teal-50 text-teal-700 border-teal-200">{value ?? "—"}</Badge>
          {value !== undefined ? (
            <button type="button" onClick={() => onChange(undefined)} className="text-muted-foreground hover:text-foreground" aria-label={`Clear ${label}`}>
              <AtomIcon name="X" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <Slider min={0} max={10} step={1} value={[value ?? 0]} onValueChange={(vals) => onChange(vals[0])} className="mt-3" />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0 — none</span><span>10 — worst</span></div>
    </div>
  );
}

function MeasurementTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

// ===================== patient search select =====================
export function PatientSearchSelect({ selected, onSelect, onClear, autoFocus }: {
  selected?: API.PatientLite | null; onSelect: (p: API.PatientLite) => void; onClear?: () => void; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const dq = API.useDebounced(q, 300);
  const [open, setOpen] = useState(false);
  const searchQ = useQuery({
    queryKey: ["assessments", "patient-search", dq],
    queryFn: () => API.searchPatients(dq),
    enabled: open && dq.trim().length > 0,
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <AtomIcon name="UserRound" className="h-4 w-4 text-teal-600" />
          <div>
            <p className="text-sm font-medium">{fullName(selected) || selected.id}</p>
            {selected.patientCode ? <p className="text-xs text-muted-foreground">{selected.patientCode}</p> : null}
          </div>
        </div>
        {onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear} type="button">Change</Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search patients by name or code…"
          className="pl-8"
        />
      </div>
      {open && dq.trim() ? (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {searchQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          ) : !searchQ.data?.length ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching patients</p>
          ) : (
            <div className="max-h-56 overflow-y-auto custom-scrollbar">
              {searchQ.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(p); setOpen(false); setQ(""); }}
                >
                  <span className="text-sm font-medium">{fullName(p)}</span>
                  <span className="text-xs text-muted-foreground">{p.patientCode || ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  const [therapistId, setTherapistId] = useState("");
  const [step, setStep] = useState(0);
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

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM });
  const romArr = useFieldArray({ control: form.control, name: "rom" });
  const strengthArr = useFieldArray({ control: form.control, name: "strength" });
  const fnArr = useFieldArray({ control: form.control, name: "functional" });
  const values = form.watch();

  // hydrate from an existing assessment
  useEffect(() => {
    if (!detail) return;
    setPatient((detail.episode?.patient as API.PatientLite) ?? null);
    setEpisode((detail.episode as API.EpisodeLite) ?? null);
    setTherapistId(detail.therapistId);
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

  // default therapist
  useEffect(() => {
    if (therapistId || !therapistsQ.data?.length) return;
    setTherapistId(therapistsQ.data[0].id);
  }, [therapistsQ.data, therapistId]);

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
  const completedCount = SECTIONS.reduce((acc, _, i) => acc + (isSectionComplete(i) ? 1 : 0), 0);

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
        if (!assessmentId && data?.id) onTargetChange({ assessmentId: data.id });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save assessment"),
  });

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
          setStep(0);
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
      <PageHeader
        title={assessmentId ? "Assessment (draft)" : "New assessment"}
        description={patient ? `${fullName(patient)} · ${episode?.title || ""}` : "Select a patient and episode to begin"}
        icon="ClipboardList"
        actions={<Button variant="outline" onClick={onBack}><AtomIcon name="ArrowLeft" className="h-4 w-4" />Back to list</Button>}
      />

      {/* Patient info header card */}
      <div className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Patient</p>
            <p className="text-sm font-semibold">{patient ? fullName(patient) : "—"}</p>
            <p className="text-xs text-muted-foreground">{patient?.patientCode || ""}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Episode</p>
            <p className="text-sm font-semibold">{episode?.title || "—"}</p>
            <div className="mt-1">{episode?.status ? <StatusBadge status={episode.status} /> : null}</div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assessment date</p>
            <p className="text-sm font-semibold">{detail ? formatDate(detail.assessmentDate) : formatDate(new Date())}</p>
            <p className="text-xs text-muted-foreground">{detail?.status ? labelize(detail.status) : "Draft in progress"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Therapist</p>
            <p className="text-sm font-semibold">{therapistName ? fullName(therapistName) : therapistId ? "—" : "Not selected"}</p>
          </div>
        </div>
      </div>

      {/* Entry gate */}
      {!ready ? (
        <SectionCard title="Start assessment" description="Choose the patient, episode and assessing therapist" icon="ClipboardPen">
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
                  <SelectTrigger><SelectValue placeholder="Select episode…" /></SelectTrigger>
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
                  <Skeleton className="h-9 w-56" />
                ) : (
                  <Select value={therapistId || undefined} onValueChange={setTherapistId}>
                    <SelectTrigger><SelectValue placeholder="Select therapist…" /></SelectTrigger>
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
                  ? "No active therapists found from /api/staff — enter one once the staff module is available."
                  : "Complete all three to open the assessment form."}
              </p>
            )}
          </div>
        </SectionCard>
      ) : (
        <>
          {/* progress */}
          <div className="mb-4 flex items-center gap-3">
            <Progress value={(completedCount / SECTIONS.length) * 100} className="h-2 flex-1" />
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{completedCount}/{SECTIONS.length} sections complete</span>
          </div>

          {/* mobile section chips */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar md:hidden">
            {SECTIONS.map((s, i) => (
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
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
            {/* section nav */}
            <nav className="hidden rounded-xl border bg-white p-2 shadow-sm lg:block">
              {SECTIONS.map((s, i) => (
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
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    isSectionComplete(i) ? "border-emerald-300 bg-emerald-100 text-emerald-700" : i === step ? "border-teal-400 bg-teal-100 text-teal-700" : "border-border bg-muted/40",
                  )}>
                    {isSectionComplete(i) ? <AtomIcon name="Check" className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              ))}
            </nav>

            {/* section content */}
            <div className="min-w-0">
              {step === 0 ? (
                <SectionCard title="Visit info" description="Auto-populated from the selected patient and episode" icon="CalendarDays">
                  <DetailGrid cols={2}>
                    <DRow label="Patient" value={patient ? fullName(patient) : ""} />
                    <DRow label="Patient code" value={patient?.patientCode || ""} />
                    <DRow label="Episode" value={episode?.title || ""} />
                    <DRow label="Episode status" value={episode?.status ? labelize(episode.status) : ""} />
                    <DRow label="Assessment date" value={detail ? formatDate(detail.assessmentDate) : formatDate(new Date())} />
                    <DRow label="Therapist" value={therapistName ? fullName(therapistName) : ""} />
                    <DRow label="Current status" value={detail ? labelize(detail.status) : "Draft"} />
                  </DetailGrid>
                </SectionCard>
              ) : null}

              {step === 1 ? (
                <SectionCard title="Presenting complaint" icon="MessageSquareText">
                  <div className="space-y-4">
                    <Field label="Primary complaint">
                      <Textarea rows={3} placeholder="e.g. Persistent lower back pain radiating to the left buttock" {...form.register("primaryComplaint")} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Body part">
                        <Select value={values.bodyPart || undefined} onValueChange={(v) => form.setValue("bodyPart", v)}>
                          <SelectTrigger><SelectValue placeholder="Select body part…" /></SelectTrigger>
                          <SelectContent>
                            {[...BODY_PARTS, "Other"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Affected side">
                        <Select value={values.affectedSide || undefined} onValueChange={(v) => form.setValue("affectedSide", v)}>
                          <SelectTrigger><SelectValue placeholder="Select side…" /></SelectTrigger>
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Duration">
                        <Input placeholder="e.g. 4 months" {...form.register("duration")} />
                      </Field>
                      <Field label="Onset">
                        <Select value={values.onset || undefined} onValueChange={(v) => form.setValue("onset", v)}>
                          <SelectTrigger><SelectValue placeholder="Select onset…" /></SelectTrigger>
                          <SelectContent>
                            {["SUDDEN", "GRADUAL", "INSIDIOUS"].map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Cause / mechanism of injury">
                      <Textarea rows={2} placeholder="e.g. Prolonged sitting and frequent heavy lifting at work" {...form.register("cause")} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
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
              ) : null}

              {step === 2 ? (
                <SectionCard title="Pain assessment" description="Rate each on a 0–10 scale" icon="Activity">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <PainSlider label="Current pain" value={values.painCurrent} onChange={(v) => form.setValue("painCurrent", v)} />
                      <PainSlider label="Worst pain" value={values.painWorst} onChange={(v) => form.setValue("painWorst", v)} />
                      <PainSlider label="Lowest pain" value={values.painLowest} onChange={(v) => form.setValue("painLowest", v)} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
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
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <SectionCard title="Observation" icon="Eye">
                    <div className="grid gap-4 sm:grid-cols-2">
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
                      <Button type="button" variant="outline" size="sm" onClick={() => romArr.append({ bodyPart: "", movement: "", side: "", activeRom: "", passiveRom: "", normalValue: "", notes: "" })}>
                        <AtomIcon name="Plus" className="h-4 w-4" />Add row
                      </Button>
                    )}
                  >
                    {romArr.fields.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No ROM measurements yet — add a row to begin.</p>
                    ) : (
                      <div className="space-y-3">
                        {romArr.fields.map((f, idx) => (
                          <div key={f.id} className="rounded-lg border bg-muted/10 p-3">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <Field label="Body part">
                                <Select value={values.rom?.[idx]?.bodyPart || undefined} onValueChange={(v) => form.setValue(`rom.${idx}.bodyPart`, v)}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Body part…" /></SelectTrigger>
                                  <SelectContent>{[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                </Select>
                              </Field>
                              <Field label="Movement">
                                <Input placeholder="e.g. Flexion" {...form.register(`rom.${idx}.movement`)} />
                              </Field>
                              <Field label="Side">
                                <Select value={values.rom?.[idx]?.side || undefined} onValueChange={(v) => form.setValue(`rom.${idx}.side`, v)}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Side…" /></SelectTrigger>
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
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                              <Field label="Body part">
                                <Select value={values.strength?.[idx]?.bodyPart || undefined} onValueChange={(v) => form.setValue(`strength.${idx}.bodyPart`, v)}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Body part…" /></SelectTrigger>
                                  <SelectContent>{[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                </Select>
                              </Field>
                              <Field label="Muscle group">
                                <Input placeholder="e.g. Quadriceps" {...form.register(`strength.${idx}.muscleGroup`)} />
                              </Field>
                              <Field label="Side">
                                <Select value={values.strength?.[idx]?.side || undefined} onValueChange={(v) => form.setValue(`strength.${idx}.side`, v)}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Side…" /></SelectTrigger>
                                  <SelectContent>{SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                                </Select>
                              </Field>
                              <Field label="MRC grade">
                                <Select value={values.strength?.[idx]?.grade || undefined} onValueChange={(v) => form.setValue(`strength.${idx}.grade`, v)}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Grade…" /></SelectTrigger>
                                  <SelectContent>{MRC_GRADES.map((g) => <SelectItem key={g} value={g}>{MRC_LABELS[g]}</SelectItem>)}</SelectContent>
                                </Select>
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
              ) : null}

              {step === 4 ? (
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
                              <SelectTrigger className="h-9"><SelectValue placeholder="Activity…" /></SelectTrigger>
                              <SelectContent>
                                {activityOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Difficulty">
                            <Select value={values.functional?.[idx]?.difficulty || undefined} onValueChange={(v) => form.setValue(`functional.${idx}.difficulty`, v)}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Difficulty…" /></SelectTrigger>
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
              ) : null}

              {step === 5 ? (
                <SectionCard title="Vital signs" description="None of these are mandatory" icon="HeartPulse">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Blood pressure"><Input placeholder="120/80" {...form.register("bloodPressure")} /></Field>
                    <Field label="Heart rate (bpm)"><Input type="number" inputMode="numeric" {...form.register("heartRate")} /></Field>
                    <Field label="Respiratory rate"><Input type="number" inputMode="numeric" {...form.register("respiratoryRate")} /></Field>
                    <Field label="Temperature (°C)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("temperature")} /></Field>
                    <Field label="SpO₂ (%)"><Input type="number" inputMode="numeric" {...form.register("oxygenSaturation")} /></Field>
                    <Field label="Weight (kg)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("weightKg")} /></Field>
                    <Field label="Height (cm)"><Input type="number" step="0.1" inputMode="decimal" {...form.register("heightCm")} /></Field>
                  </div>
                </SectionCard>
              ) : null}

              {step === 6 ? (
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
              ) : null}

              {step === 7 ? (
                <SectionCard title="Review" description="Verify all captured information, then complete the assessment" icon="ListChecks">
                  <div className="space-y-5">
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
                        <MeasurementTable headers={["Body part", "Movement", "Side", "Active", "Passive", "Normal"]}>
                          {(values.rom || []).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.bodyPart || "—"}</TableCell>
                              <TableCell className="text-xs">{r.movement || "—"}</TableCell>
                              <TableCell className="text-xs">{r.side ? labelize(r.side) : "—"}</TableCell>
                              <TableCell className="text-xs">{r.activeRom || "—"}</TableCell>
                              <TableCell className="text-xs">{r.passiveRom || "—"}</TableCell>
                              <TableCell className="text-xs">{r.normalValue || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </MeasurementTable>
                      ) : null}
                      {(values.strength?.length || 0) > 0 ? (
                        <MeasurementTable headers={["Body part", "Muscle group", "Side", "Grade"]}>
                          {(values.strength || []).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.bodyPart || "—"}</TableCell>
                              <TableCell className="text-xs">{r.muscleGroup || "—"}</TableCell>
                              <TableCell className="text-xs">{r.side ? labelize(r.side) : "—"}</TableCell>
                              <TableCell className="text-xs">{r.grade}/5</TableCell>
                            </TableRow>
                          ))}
                        </MeasurementTable>
                      ) : null}
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Functional — {values.functional?.length || 0} activities</h4>
                      {(values.functional?.length || 0) > 0 ? (
                        <MeasurementTable headers={["Activity", "Difficulty", "Notes"]}>
                          {(values.functional || []).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.activity}</TableCell>
                              <TableCell className="text-xs">{FUNCTIONAL_DIFFICULTY_LABELS[Number(r.difficulty || 0)]}</TableCell>
                              <TableCell className="text-xs">{r.notes || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </MeasurementTable>
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
                    <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                      Completing the assessment marks the episode <strong>awaiting plan</strong> and locks this record. Corrections create a new draft linked in the audit trail.
                    </p>
                  </div>
                </SectionCard>
              ) : null}

              {/* footer actions */}
              <div className="sticky bottom-0 z-10 mt-5 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onBack}>
                    <AtomIcon name="ArrowLeft" className="h-4 w-4" />Back to list
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" disabled={saveQ.isPending || !canManage} onClick={saveDraft}>
                      <AtomIcon name="Save" className="h-4 w-4" />{saveQ.isPending ? "Saving…" : "Save draft"}
                    </Button>
                    {step > 0 ? (
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
    </div>
  );
}

// ===================== completed read-only view + correction =====================
function CompletedView({ detail, canManage, onReplaced, onBack }: {
  detail: API.AssessmentDetail;
  canManage: boolean;
  onReplaced: (id: string) => void;
  onBack: () => void;
}) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reason, setReason] = useState("");
  const correctQ = useMutation({
    mutationFn: () => API.updateAssessment(detail.id, { action: "correct", reason: reason.trim() }),
    onSuccess: (data) => {
      toast.success("Correction draft created", { description: "The original record is preserved; edit the new draft and complete it again." });
      setCorrectionOpen(false);
      setReason("");
      onReplaced(data.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start correction"),
  });

  const patient = detail.episode?.patient;
  const rom = detail.romMeasurements || [];
  const strength = detail.strengthMeasurements || [];
  const functional = detail.functionalItems || [];

  return (
    <div className="pb-2">
      <PageHeader
        title="Assessment"
        description={`${patient ? fullName(patient) : ""}${patient?.patientCode ? ` · ${patient.patientCode}` : ""} — ${detail.episode?.title || ""}`}
        icon="ClipboardList"
        actions={(
          <>
            <Button variant="outline" onClick={onBack}><AtomIcon name="ArrowLeft" className="h-4 w-4" />Back to list</Button>
            {canManage ? (
              <Button onClick={() => setCorrectionOpen(true)}><AtomIcon name="FilePenLine" className="h-4 w-4" />Start correction</Button>
            ) : null}
          </>
        )}
      />

      <div className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1"><StatusBadge status={detail.status} /></div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assessment date</p>
            <p className="text-sm font-semibold">{formatDate(detail.assessmentDate)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Completed</p>
            <p className="text-sm font-semibold">{detail.completedAt ? formatDate(detail.completedAt) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Therapist</p>
            <p className="text-sm font-semibold">
              {detail.therapist ? fullName(detail.therapist) : detail.therapistName || "—"}
            </p>
            <p className="text-xs text-muted-foreground">{detail.therapist?.jobTitle || ""}</p>
          </div>
        </div>
        {detail.therapistSignature ? (
          <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">Signed: <span className="font-medium text-foreground">{detail.therapistSignature}</span></p>
        ) : null}
      </div>

      <div className="space-y-5">
        <SectionCard title="Presenting complaint" icon="MessageSquareText">
          <DetailGrid cols={2}>
            <DRow label="Primary complaint" value={detail.primaryComplaint} />
            <DRow label="Body part" value={detail.bodyPart} />
            <DRow label="Affected side" value={detail.affectedSide ? labelize(detail.affectedSide) : ""} />
            <DRow label="Duration" value={detail.duration} />
            <DRow label="Onset" value={detail.onset ? labelize(detail.onset) : ""} />
            <DRow label="Cause / mechanism" value={detail.cause} />
            <DRow label="Aggravating" value={detail.aggravating} />
            <DRow label="Relieving" value={detail.relieving} />
            <DRow label="Previous treatment" value={detail.previousTreatment} />
            <DRow label="Additional history" value={detail.additionalHistory} />
          </DetailGrid>
        </SectionCard>

        <SectionCard title="Pain assessment" icon="Activity">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { l: "Current", v: detail.painCurrent },
              { l: "Worst", v: detail.painWorst },
              { l: "Lowest", v: detail.painLowest },
            ].map((p) => (
              <Badge key={p.l} variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{p.l}: {p.v ?? "—"}/10</Badge>
            ))}
          </div>
          <DetailGrid cols={2}>
            <DRow label="Location" value={detail.painLocation} />
            <DRow label="Type" value={detail.painType} />
            <DRow label="Frequency" value={detail.painFrequency} />
            <DRow label="Notes" value={detail.painNotes} />
          </DetailGrid>
        </SectionCard>

        <SectionCard title="Physical examination" icon="Stethoscope">
          <DetailGrid cols={2}>
            <DRow label="Posture" value={detail.posture} />
            <DRow label="Swelling" value={detail.swelling} />
            <DRow label="Deformity" value={detail.deformity} />
            <DRow label="Skin condition" value={detail.skinCondition} />
            <DRow label="Muscle wasting" value={detail.muscleWasting} />
            <DRow label="Gait" value={detail.gait} />
          </DetailGrid>
          {rom.length ? (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Range of motion</h4>
              <MeasurementTable headers={["Body part", "Movement", "Side", "Active", "Passive", "Normal", "Notes"]}>
                {rom.map((r) => (
                  <TableRow key={r.id || r.bodyPart + r.movement}>
                    <TableCell className="text-xs">{r.bodyPart}</TableCell>
                    <TableCell className="text-xs">{r.movement}</TableCell>
                    <TableCell className="text-xs">{labelize(r.side)}</TableCell>
                    <TableCell className="text-xs">{r.activeRom ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.passiveRom ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.normalValue ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </MeasurementTable>
            </div>
          ) : null}
          {strength.length ? (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Muscle strength (MRC)</h4>
              <MeasurementTable headers={["Body part", "Muscle group", "Side", "Grade", "Notes"]}>
                {strength.map((r) => (
                  <TableRow key={r.id || r.bodyPart + r.muscleGroup}>
                    <TableCell className="text-xs">{r.bodyPart}</TableCell>
                    <TableCell className="text-xs">{r.muscleGroup}</TableCell>
                    <TableCell className="text-xs">{labelize(r.side)}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{r.grade}/5</Badge></TableCell>
                    <TableCell className="text-xs">{r.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </MeasurementTable>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Functional assessment" icon="Accessibility">
          {functional.length ? (
            <MeasurementTable headers={["Activity", "Difficulty", "Notes"]}>
              {functional.map((r) => (
                <TableRow key={r.id || r.activity}>
                  <TableCell className="text-xs">{r.activity}</TableCell>
                  <TableCell className="text-xs">{FUNCTIONAL_DIFFICULTY_LABELS[Number(r.difficulty ?? 0)] || "—"}</TableCell>
                  <TableCell className="text-xs">{r.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </MeasurementTable>
          ) : (
            <p className="text-sm text-muted-foreground">No functional activities recorded.</p>
          )}
        </SectionCard>

        <SectionCard title="Vital signs" icon="HeartPulse">
          <DetailGrid cols={3}>
            <DRow label="Blood pressure" value={detail.bloodPressure} />
            <DRow label="Heart rate" value={detail.heartRate != null ? `${detail.heartRate} bpm` : ""} />
            <DRow label="Respiratory rate" value={detail.respiratoryRate != null ? `${detail.respiratoryRate}/min` : ""} />
            <DRow label="Temperature" value={detail.temperature != null ? `${detail.temperature} °C` : ""} />
            <DRow label="SpO₂" value={detail.oxygenSaturation != null ? `${detail.oxygenSaturation}%` : ""} />
            <DRow label="Weight" value={detail.weightKg != null ? `${detail.weightKg} kg` : ""} />
            <DRow label="Height" value={detail.heightCm != null ? `${detail.heightCm} cm` : ""} />
          </DetailGrid>
        </SectionCard>

        <SectionCard title="Clinical findings" icon="ClipboardCheck">
          <DetailGrid cols={1}>
            <DRow label="Clinical findings" value={detail.clinicalFindings} />
            <DRow label="Impairments" value={detail.impairments} />
            <DRow label="Functional limitations" value={detail.functionalLimitations} />
            <DRow label="Clinical impression" value={detail.clinicalImpression} />
            <DRow label="Precautions" value={detail.precautions} />
            <DRow label="Additional notes" value={detail.additionalNotes} />
          </DetailGrid>
        </SectionCard>
      </div>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start correction</DialogTitle>
            <DialogDescription>
              Completed assessments are immutable. This creates a new editable draft copied from this record — the original stays in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason for correction">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Transcription error — passive ROM values were entered from the wrong side" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>Cancel</Button>
            <Button
              disabled={!reason.trim() || correctQ.isPending}
              onClick={() => correctQ.mutate()}
            >
              {correctQ.isPending ? "Creating…" : "Create correction draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
