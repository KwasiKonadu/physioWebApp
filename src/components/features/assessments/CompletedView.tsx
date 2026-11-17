"use client";
// Read-only view of a completed assessment, with the "start correction" flow.

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DetailGrid } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { FUNCTIONAL_DIFFICULTY_LABELS, labelize } from "@/lib/constants";
import { formatDate, fullName, initials } from "@/lib/format";
import { useUIStore } from "@/stores/app-store";
import * as API from "./assessments-api";
import { Field, DRow, MeasurementTable } from "./AssessmentFormParts";

// ===================== completed read-only view + correction =====================
export function CompletedView({ detail, canManage, onReplaced, onBack }: {
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
                  <span className="code-chip">{patient.patientCode}</span>
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
                <dt className="label-caps-sm">{x.l}</dt>
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

      <div className="split-grid">
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
                <h4 className="label-caps mb-2">Range of motion</h4>
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
                <h4 className="label-caps mb-2">Muscle strength (MRC)</h4>
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
