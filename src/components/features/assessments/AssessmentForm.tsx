"use client";
// ============ AssessmentForm: 8-section clinical assessment editor + read-only completed view ============
import { DataTable } from "@/components/molecules/data-table";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { BODY_PARTS, SIDES, FUNCTIONAL_ACTIVITIES, FUNCTIONAL_DIFFICULTY_LABELS, PERMS, labelize } from "@/lib/constants";
import { formatDate, fullName, initials } from "@/lib/format";
import { useAuthStore, useUIStore, hasPermission, setNavGuard } from "@/stores/app-store";
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

// Standard (AAOS-style) normal ranges in degrees, used for quick-add sets and auto-filling "Normal"
const ROM_PRESETS: Record<string, [string, number][]> = {
  "Cervical spine": [["Flexion", 45], ["Extension", 45], ["Lateral flexion", 45], ["Rotation", 80]],
  "Lumbar spine": [["Flexion", 60], ["Extension", 25], ["Lateral flexion", 25], ["Rotation", 30]],
  Shoulder: [["Flexion", 180], ["Extension", 60], ["Abduction", 180], ["Internal rotation", 70], ["External rotation", 90]],
  Elbow: [["Flexion", 150], ["Extension", 0], ["Supination", 80], ["Pronation", 80]],
  "Wrist/Hand": [["Flexion", 80], ["Extension", 70], ["Radial deviation", 20], ["Ulnar deviation", 30]],
  Hip: [["Flexion", 120], ["Extension", 30], ["Abduction", 45], ["Adduction", 30], ["Internal rotation", 45], ["External rotation", 45]],
  Knee: [["Flexion", 135], ["Extension", 0]],
  "Ankle/Foot": [["Dorsiflexion", 20], ["Plantarflexion", 50], ["Inversion", 35], ["Eversion", 15]],
};

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

const PAIN_TONES = [
  "bg-emerald-500", "bg-emerald-500", "bg-lime-500", "bg-lime-500", "bg-yellow-500",
  "bg-amber-500", "bg-orange-500", "bg-orange-500", "bg-red-500", "bg-red-600", "bg-red-700",
];
function PainSlider({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="min-w-9 justify-center bg-teal-50 text-teal-700 border-teal-200">{value ?? "—"}/10</Badge>
          {value !== undefined ? (
            <button type="button" onClick={() => onChange(undefined)} className="text-muted-foreground hover:text-foreground" aria-label={`Clear ${label}`}>
              <AtomIcon name="X" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-11 gap-1" role="radiogroup" aria-label={label}>
        {PAIN_TONES.map((tone, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "h-8 rounded-md text-xs font-semibold transition-all",
              value === n ? cn(tone, "text-white shadow-sm ring-2 ring-offset-1 ring-slate-400") : "border bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0 — none</span><span>10 — worst</span></div>
    </div>
  );
}

function MeasurementTable<T>({ rows, columns }: { rows: T[]; columns: [string, (r: T) => React.ReactNode][] }) {
  return (
    <DataTable
      bare
      compact
      maxHeight="max-h-none"
      minWidth="min-w-120"
      rows={rows}
      rowKey={(_r, i) => String(i)}
      columns={columns.map(([header, cell], i) => ({ id: String(i), header, cell }))}
    />
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
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</dt><dd className="text-sm font-medium">{detail ? formatDate(detail.assessmentDate) : formatDate(new Date())}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Therapist</dt><dd className="text-sm font-medium">{therapistName ? fullName(therapistName) : "—"}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</dt><dd className="text-sm font-medium">{detail?.status ? labelize(detail.status) : "Draft"}</dd></div>
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
                  ? "No active therapists found from /api/staff — enter one once the staff module is available."
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Case summary</p>
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
              {step === 1 ? (
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
              ) : null}

              {step === 2 ? (
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
              ) : null}

              {step === 3 ? (
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
              ) : null}

              {step === 5 ? (
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
              ) : null}

              {/* sticky action bar */}
              <div className="sticky bottom-0 z-10 mt-5 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
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

// ===================== completed read-only view + correction =====================
function CompletedView({ detail, canManage, onReplaced, onBack }: {
  detail: API.AssessmentDetail;
  canManage: boolean;
  onReplaced: (id: string) => void;
  onBack: () => void;
}) {
  const navigate = useUIStore((s) => s.navigate);
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
      <PageBreadcrumb items={[{ label: "Assessments", onClick: onBack }, { label: patient ? `Assessment — ${fullName(patient)}` : "Assessment" }]} />
      <PageHeader
        title="Assessment"
        description={`${patient ? fullName(patient) : ""}${patient?.patientCode ? ` · ${patient.patientCode}` : ""} — ${detail.episode?.title || ""}`}
        icon="ClipboardList"
      />

      {/* ---------- summary ---------- */}
      <div className="mb-4 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">
                {initials(patient ? fullName(patient) : "")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0"><button type="button" title="Open patient profile" disabled={!patient?.id} className="truncate text-left text-lg font-semibold tracking-tight transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => patient?.id && navigate("patients", { patientId: patient.id })}>{patient ? fullName(patient) : "Patient"}</button></h2>
                {patient?.patientCode ? (
                  <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{patient.patientCode}</span>
                ) : null}
                <StatusBadge status={detail.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{detail.episode?.title || "—"}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
            {[
              { l: "Assessed", v: formatDate(detail.assessmentDate) },
              { l: "Completed", v: detail.completedAt ? formatDate(detail.completedAt) : "—" },
              { l: "Therapist", v: detail.therapist ? fullName(detail.therapist) : detail.therapistName || "—", sub: detail.therapist?.jobTitle },
              { l: "Signed by", v: detail.therapistSignature || "—" },
            ].map((x) => (
              <div key={x.l} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.l}</dt>
                <dd className="truncate text-sm font-semibold">{x.v}</dd>
                {x.sub ? <dd className="truncate text-xs text-muted-foreground">{x.sub}</dd> : null}
              </div>
            ))}
          </dl>
        </div>
        {canManage ? (
          <div className="flex items-center justify-between gap-3 border-t bg-slate-50/80 px-4 py-2.5 md:px-5">
            <p className="text-xs text-muted-foreground">Completed assessments are immutable. A correction creates a new editable draft and keeps this record in the audit trail.</p>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setCorrectionOpen(true)}>
              <AtomIcon name="FilePenLine" className="h-4 w-4" />Start correction
            </Button>
          </div>
        ) : null}
      </div>

      {/* ---------- key figures ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pain — current" value={detail.painCurrent != null ? `${detail.painCurrent}/10` : "—"} icon="Activity" tone="rose" />
        <StatCard label="Pain — worst" value={detail.painWorst != null ? `${detail.painWorst}/10` : "—"} icon="Flame" tone="amber" />
        <StatCard label="Pain — lowest" value={detail.painLowest != null ? `${detail.painLowest}/10` : "—"} icon="Snowflake" tone="sky" />
        <StatCard label="Measurements" value={rom.length + strength.length + functional.length} icon="Ruler" tone="teal" hint={`${rom.length} ROM · ${strength.length} strength · ${functional.length} functional`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
        {/* ---------- left: narrative + examination ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
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

          <SectionCard title="Physical examination" icon="Stethoscope">
            <DetailGrid cols={3}>
              <DRow label="Posture" value={detail.posture} />
              <DRow label="Swelling" value={detail.swelling} />
              <DRow label="Deformity" value={detail.deformity} />
              <DRow label="Skin condition" value={detail.skinCondition} />
              <DRow label="Muscle wasting" value={detail.muscleWasting} />
              <DRow label="Gait" value={detail.gait} />
            </DetailGrid>
            {rom.length ? (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Range of motion</h4>
                <div className="overflow-hidden rounded-lg border">
                  <MeasurementTable rows={rom} columns={[
                    ["Body part", (r) => r.bodyPart], ["Movement", (r) => r.movement], ["Side", (r) => labelize(r.side)],
                    ["Active", (r) => r.activeRom ?? "—"], ["Passive", (r) => r.passiveRom ?? "—"],
                    ["Normal", (r) => r.normalValue ?? "—"], ["Notes", (r) => r.notes || "—"],
                  ]} />
                </div>
              </div>
            ) : null}
            {strength.length ? (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Muscle strength (MRC)</h4>
                <div className="overflow-hidden rounded-lg border">
                  <MeasurementTable rows={strength} columns={[
                    ["Body part", (r) => r.bodyPart], ["Muscle group", (r) => r.muscleGroup], ["Side", (r) => labelize(r.side)],
                    ["Grade", (r) => <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{r.grade}/5</Badge>],
                    ["Notes", (r) => r.notes || "—"],
                  ]} />
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Clinical findings" icon="ClipboardCheck" className="flex-1">
            {detail.clinicalImpression ? (
              <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Clinical impression</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.clinicalImpression}</p>
              </div>
            ) : null}
            <DetailGrid cols={2}>
              <DRow label="Clinical findings" value={detail.clinicalFindings} />
              <DRow label="Impairments" value={detail.impairments} />
              <DRow label="Functional limitations" value={detail.functionalLimitations} />
              <DRow label="Precautions" value={detail.precautions} />
              <DRow label="Additional notes" value={detail.additionalNotes} />
            </DetailGrid>
          </SectionCard>
        </div>

        {/* ---------- right: pain, vitals, functional ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Pain details" icon="Activity">
            <DetailGrid cols={1}>
              <DRow label="Location" value={detail.painLocation} />
              <DRow label="Type" value={detail.painType} />
              <DRow label="Frequency" value={detail.painFrequency} />
              <DRow label="Notes" value={detail.painNotes} />
            </DetailGrid>
          </SectionCard>

          <SectionCard title="Vital signs" icon="HeartPulse">
            <div className="grid grid-cols-2 gap-2 *:min-w-0">
              {[
                { l: "Blood pressure", v: detail.bloodPressure },
                { l: "Heart rate", v: detail.heartRate != null ? `${detail.heartRate} bpm` : "" },
                { l: "Respiratory rate", v: detail.respiratoryRate != null ? `${detail.respiratoryRate}/min` : "" },
                { l: "Temperature", v: detail.temperature != null ? `${detail.temperature} °C` : "" },
                { l: "SpO₂", v: detail.oxygenSaturation != null ? `${detail.oxygenSaturation}%` : "" },
                { l: "Weight", v: detail.weightKg != null ? `${detail.weightKg} kg` : "" },
                { l: "Height", v: detail.heightCm != null ? `${detail.heightCm} cm` : "" },
              ].map((x) => (
                <div key={x.l} className="rounded-lg border bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{x.l}</p>
                  <p className="text-sm font-semibold">{x.v || "—"}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Functional assessment" icon="Accessibility" noPadding={functional.length > 0} className="flex-1">
            {functional.length ? (
              <MeasurementTable rows={functional} columns={[
                ["Activity", (r) => r.activity], ["Difficulty", (r) => FUNCTIONAL_DIFFICULTY_LABELS[Number(r.difficulty ?? 0)] || "—"],
                ["Notes", (r) => r.notes || "—"],
              ]} />
            ) : (
              <p className="text-sm text-muted-foreground">No functional activities recorded.</p>
            )}
          </SectionCard>
        </div>
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
