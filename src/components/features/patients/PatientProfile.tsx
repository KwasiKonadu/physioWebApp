"use client";
// ============ Patient profile: header + 7 tabs (overview, episodes, appointments, billing, history, contacts, referrals) ============
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import {
  calcAge, formatDate, formatDateTime, formatMoney, fullName, initials, minutesToTime,
} from "@/lib/format";
import {
  PERMS, MEDICAL_HISTORY_TYPES, labelize,
} from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { BookingDialog } from "../appointments/BookingDialog";
import { useTherapists as useAppointmentTherapists } from "../appointments/appointments-shared";
import { DataTable } from "@/components/molecules/data-table";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePatient, useTherapists, useInsuranceProviders,
  type EmergencyContactDto, type EpisodeDto, type InsuranceDto, type MedicalHistoryDto } from "./hooks";
import EpisodeCard from "./EpisodeCard";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-teal-50 text-teal-700 border-teal-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

interface ContactDraft { fullName: string; relationship: string; phone: string; altPhone: string; address: string; isNextOfKin: boolean }
interface HistoryDraft { type: string; name: string; details: string }

interface Props {
  patientId: string;
  onBack: () => void;
}

export default function PatientProfile({ patientId, onBack }: Props) {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const bundleQuery = usePatient(patientId);

  const canManagePatients = hasPermission(user, PERMS.patientsManage);
  const canClinicalManage = hasPermission(user, PERMS.clinicalManage);
  const canBook = hasPermission(user, PERMS.appointmentsManage);
  const canBill = hasPermission(user, PERMS.billingManage);

  const [newEpisodeOpen, setNewEpisodeOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const appointmentTherapists = useAppointmentTherapists();
  const [contactDraft, setContactDraft] = useState<ContactDraft[] | null>(null);
  const [historyDraft, setHistoryDraft] = useState<HistoryDraft[] | null>(null);
  const [insuranceDialog, setInsuranceDialog] = useState<{ open: boolean; entry: InsuranceDto | null }>({ open: false, entry: null });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
    void queryClient.invalidateQueries({ queryKey: ["patients"] });
  };

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/patients/${patientId}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      toast.success("Patient updated");
      invalidate();
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  if (bundleQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (bundleQuery.isError || !bundleQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <AtomIcon name="ArrowLeft" className="mr-1.5 h-4 w-4" /> All patients
        </Button>
        <EmptyState icon="UserX" title="Patient not found" description="This record may have been removed or you may not have access." action={<Button variant="outline" onClick={onBack}>Back to directory</Button>} />
      </div>
    );
  }

  const bundle = bundleQuery.data;
  const patient = bundle.patient;
  const name = fullName({ firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName });
  const consent = bundle.consents[0];
  const contacts = bundle.emergencyContacts;

  // ---- contacts editing ----
  const startContactEdit = () => setContactDraft(contacts.map((c) => ({ fullName: c.fullName, relationship: c.relationship, phone: c.phone, altPhone: c.altPhone || "", address: c.address || "", isNextOfKin: c.isNextOfKin })));
  const saveContacts = () => {
    const draft = (contactDraft || []).filter((c) => c.fullName.trim() || c.relationship.trim() || c.phone.trim());
    const invalid = draft.find((c) => !c.fullName.trim() || !c.relationship.trim() || !c.phone.trim());
    if (invalid) {
      toast.error("Every contact needs a name, relationship and phone — or remove the empty row.");
      return;
    }
    patchMutation.mutate({ emergencyContacts: draft }, { onSuccess: () => setContactDraft(null) });
  };

  // ---- medical history editing ----
  const startHistoryEdit = () => setHistoryDraft(bundle.medicalHistory.map((m) => ({ type: m.type, name: m.name, details: m.details || "" })));
  const saveHistory = () => {
    const draft = (historyDraft || []).filter((m) => m.name.trim());
    const invalid = draft.find((m) => !m.name.trim());
    if (invalid) {
      toast.error("Each entry needs a name");
      return;
    }
    patchMutation.mutate({ medicalHistory: draft }, { onSuccess: () => setHistoryDraft(null) });
  };

  // ---- insurance ----
  const saveInsurance = (body: { providerId: string; membershipNumber: string; policyNumber: string; validFrom: string; validTo: string; principalMember: string; relationshipToPrincipal: string }) => {
    const cleaned = {
      providerId: body.providerId,
      membershipNumber: body.membershipNumber.trim(),
      policyNumber: body.policyNumber.trim() || null,
      validFrom: body.validFrom || null,
      validTo: body.validTo || null,
      principalMember: body.principalMember.trim() || null,
      relationshipToPrincipal: body.relationshipToPrincipal.trim() || null,
    };
    const entryId = insuranceDialog.entry?.id;
    const next = entryId
      ? bundle.insurances.map((i) => (i.id === entryId ? { ...i, ...cleaned } : i))
      : [...bundle.insurances, { ...cleaned, id: "new", status: "ACTIVE" } as InsuranceDto];
    if (!cleaned.providerId || !cleaned.membershipNumber) {
      toast.error("Provider and membership number are required");
      return;
    }
    patchMutation.mutate(
      {
        insurance: next.map((i) => ({
          providerId: i.providerId,
          membershipNumber: i.membershipNumber,
          policyNumber: i.policyNumber ?? null,
          validFrom: i.validFrom ?? null,
          validTo: i.validTo ?? null,
          principalMember: i.principalMember ?? null,
          relationshipToPrincipal: i.relationshipToPrincipal ?? null,
        })),
      },
      { onSuccess: () => setInsuranceDialog({ open: false, entry: null }) }
    );
  };

  const removeInsurance = (id: string) => {
    patchMutation.mutate({
      insurance: bundle.insurances
        .filter((i) => i.id !== id)
        .map((i) => ({
          providerId: i.providerId,
          membershipNumber: i.membershipNumber,
          policyNumber: i.policyNumber ?? null,
          validFrom: i.validFrom ?? null,
          validTo: i.validTo ?? null,
          principalMember: i.principalMember ?? null,
          relationshipToPrincipal: i.relationshipToPrincipal ?? null,
        })),
    });
  };

  const historyByType = MEDICAL_HISTORY_TYPES.map((type) => ({
    type,
    entries: bundle.medicalHistory.filter((m) => m.type === type),
  })).filter((g) => g.entries.length > 0);

  return (
    <div>
      <PageBreadcrumb items={[{ label: "Patients", onClick: onBack }, { label: name }]} />
    <div className="space-y-5">
      <Tabs defaultValue="overview" className="gap-5">
      {/* ---------- summary + tabs: one card ---------- */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-base font-semibold text-navy-800">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight md:text-xl">{name}</h2>
                <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{patient.patientCode}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><AtomIcon name="Phone" className="h-3.5 w-3.5" /> {patient.phone}</span>
                {patient.email ? <span className="flex items-center gap-1"><AtomIcon name="Mail" className="h-3.5 w-3.5" /> {patient.email}</span> : null}
                <span>{patient.gender ? labelize(patient.gender) : "—"} · {calcAge(patient.dateOfBirth)} yrs</span>
                <span className="flex items-center gap-1">
                  <AtomIcon name="Stethoscope" className="h-3.5 w-3.5" />
                  {patient.assignedTherapist ? fullName({ firstName: patient.assignedTherapist.firstName, lastName: patient.assignedTherapist.lastName }) : "No therapist"}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StatusBadge status={patient.currentStatus} />
                <Badge variant="outline" className={PAYMENT_TONES[patient.paymentArrangement] || ""}>{labelize(patient.paymentArrangement)}</Badge>
                {bundle.stats.openEpisodes > 0 ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                    {bundle.stats.openEpisodes} open episode{bundle.stats.openEpisodes > 1 ? "s" : ""}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canClinicalManage ? (
              <Button onClick={() => setNewEpisodeOpen(true)}>
                <AtomIcon name="Stethoscope" className="mr-2 h-4 w-4" /> New episode
              </Button>
            ) : null}
            {canBook ? (
              <Button variant="outline" onClick={() => setBookingOpen(true)}>
                <AtomIcon name="CalendarPlus" className="mr-2 h-4 w-4" /> Book appointment
              </Button>
            ) : null}
            {canBill ? (
              <Button variant="outline" onClick={() => navigate("billing", { patientId, focusTab: "invoices" })}>
                <AtomIcon name="Receipt" className="mr-2 h-4 w-4" /> New invoice
              </Button>
            ) : null}
          </div>
        </div>
        </div>
        <UnderlineTabsList className="border-0 px-4 md:px-6">
          <UnderlineTabsTrigger value="overview"><AtomIcon name="User" className="h-4 w-4" />Overview</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="episodes"><AtomIcon name="Stethoscope" className="h-4 w-4" />Episodes ({bundle.episodes.length})</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="appointments"><AtomIcon name="CalendarDays" className="h-4 w-4" />Appointments</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="billing"><AtomIcon name="Receipt" className="h-4 w-4" />Billing</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="history"><AtomIcon name="HeartPulse" className="h-4 w-4" />Medical history</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="contacts"><AtomIcon name="PhoneCall" className="h-4 w-4" />Contacts & consent</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="referrals"><AtomIcon name="Share2" className="h-4 w-4" />Referrals</UnderlineTabsTrigger>
        </UnderlineTabsList>
      </div>

        {/* ============ OVERVIEW ============ */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Episodes" value={bundle.stats.episodes} icon="Stethoscope" tone="navy" hint={`${bundle.stats.openEpisodes} open`} />
            <StatCard label="Sessions completed" value={bundle.stats.sessionsCompleted} icon="Activity" tone="teal" hint={`${bundle.stats.sessions} booked in total`} />
            <StatCard label="Assessments" value={bundle.stats.assessments} icon="ClipboardList" tone="sky" />
            <StatCard label="Active packages" value={bundle.stats.activePackages} icon="Package" tone="emerald" hint={`${bundle.patientPackages.length} purchased`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Personal information" icon="User">
              <DetailGrid cols={2}>
                <DetailRow label="Full name" value={name} />
                <DetailRow label="Patient ID" value={<span className="font-mono text-xs">{patient.patientCode}</span>} />
                <DetailRow label="Gender" value={patient.gender ? labelize(patient.gender) : undefined} />
                <DetailRow label="Date of birth" value={formatDate(patient.dateOfBirth)} />
                <DetailRow label="Age" value={`${calcAge(patient.dateOfBirth)} years`} />
                <DetailRow label="Phone" value={patient.phone} />
                <DetailRow label="Alt. phone" value={patient.altPhone} />
                <DetailRow label="Email" value={patient.email} />
                <DetailRow label="Address" value={patient.address} />
                <DetailRow label="Occupation" value={patient.occupation} />
                <DetailRow label="Marital status" value={patient.maritalStatus ? labelize(patient.maritalStatus) : undefined} />
                <DetailRow label="Nationality" value={patient.nationality} />
                <DetailRow label="Payment" value={<Badge variant="outline" className={PAYMENT_TONES[patient.paymentArrangement] || ""}>{labelize(patient.paymentArrangement)}</Badge>} />
                <DetailRow label="Registered" value={formatDateTime(patient.createdAt)} />
                <DetailRow
                  label="Assigned therapist"
                  value={patient.assignedTherapist ? `${fullName({ firstName: patient.assignedTherapist.firstName, lastName: patient.assignedTherapist.lastName })}${patient.assignedTherapist.jobTitle ? ` — ${patient.assignedTherapist.jobTitle}` : ""}` : undefined}
                />
              </DetailGrid>
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Emergency contacts" icon="PhoneCall">
                {contacts.length === 0 ? (
                  <EmptyStateCompact message="No emergency contacts recorded." />
                ) : (
                  <ul className="space-y-2.5">
                    {contacts.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground">{c.relationship} · {c.phone}{c.altPhone ? ` · ${c.altPhone}` : ""}</p>
                        </div>
                        {c.isNextOfKin ? (
                          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">Next of kin</Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Consent" icon="FileSignature">
                {consent ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={consent.treatmentConsent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                        <AtomIcon name={consent.treatmentConsent ? "Check" : "X"} className="mr-1 h-3 w-3" /> Treatment consent
                      </Badge>
                      <Badge variant="outline" className={consent.dataConsent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                        <AtomIcon name={consent.dataConsent ? "Check" : "X"} className="mr-1 h-3 w-3" /> Data consent
                      </Badge>
                    </div>
                    <DetailGrid cols={1}>
                      <DetailRow label="Signed by" value={consent.signatureName} />
                      <DetailRow label="Consent date" value={formatDate(consent.consentDate)} />
                      {consent.guardianName ? (
                        <DetailRow label="Guardian" value={`${consent.guardianName} (${consent.guardianRelationship || "guardian"})`} />
                      ) : null}
                    </DetailGrid>
                  </div>
                ) : (
                  <EmptyStateCompact message="No consent record found." />
                )}
              </SectionCard>
            </div>
          </div>

          {bundle.insurances.length > 0 ? (
            <SectionCard
              title="Insurance"
              icon="ShieldCheck"
              actions={
                canManagePatients ? (
                  <Button size="sm" variant="outline" onClick={() => setInsuranceDialog({ open: true, entry: null })}>
                    <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add policy
                  </Button>
                ) : undefined
              }
            >
              <ul className="space-y-3">
                {bundle.insurances.map((ins) => (
                  <li key={ins.id} className="rounded-lg border px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{ins.provider?.name || "Unknown provider"}</p>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={ins.status} />
                        {canManagePatients ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setInsuranceDialog({ open: true, entry: ins })}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-rose-50 hover:text-destructive" onClick={() => removeInsurance(ins.id)}>Remove</Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <DetailGrid cols={2}>
                      <DetailRow label="Membership" value={<span className="font-mono text-xs">{ins.membershipNumber}</span>} />
                      <DetailRow label="Policy" value={ins.policyNumber} />
                      <DetailRow label="Valid" value={ins.validFrom || ins.validTo ? `${formatDate(ins.validFrom)} — ${formatDate(ins.validTo)}` : undefined} />
                      <DetailRow label="Principal member" value={ins.principalMember ? `${ins.principalMember}${ins.relationshipToPrincipal ? ` (${labelize(ins.relationshipToPrincipal)})` : ""}` : undefined} />
                    </DetailGrid>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {bundle.referrals.length > 0 ? (
            <SectionCard title="Referral" icon="Share2">
              {bundle.referrals.map((r) => (
                <DetailGrid key={r.id} cols={2}>
                  <DetailRow label="Source" value={labelize(r.source)} />
                  <DetailRow label="Referrer" value={r.referrerName} />
                  <DetailRow label="Contact" value={r.referrerContact} />
                  <DetailRow label="Date" value={formatDate(r.referralDate)} />
                  <DetailRow label="Notes" value={r.notes} />
                </DetailGrid>
              ))}
            </SectionCard>
          ) : null}
        </TabsContent>

        {/* ============ EPISODES ============ */}
        <TabsContent value="episodes" className="space-y-4">
          <SectionCard
            title="Treatment episodes"
            icon="Stethoscope"
            description="Each episode is a distinct course of care — holds, sessions and reviews are tracked per episode."
            actions={
              canClinicalManage ? (
                <Button size="sm" onClick={() => setNewEpisodeOpen(true)}>
                  <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> New episode
                </Button>
              ) : undefined
            }
          >
            {bundle.episodes.length === 0 ? (
              <EmptyState
                icon="Stethoscope"
                title="No episodes yet"
                description="Open a treatment episode to start the clinical workflow for this patient."
                action={canClinicalManage ? <Button onClick={() => setNewEpisodeOpen(true)}>New episode</Button> : undefined}
              />
            ) : (
              <div className="space-y-3">
                {bundle.episodes.map((ep: EpisodeDto) => (
                  <EpisodeCard key={ep.id} episode={ep} patientId={patientId} onChanged={invalidate} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ============ APPOINTMENTS ============ */}
        <TabsContent value="appointments">
          <SectionCard title="Recent appointments" icon="CalendarDays" description="Latest 20 appointments — click a row to open it in the appointments module." noPadding>
            <DataTable
              bare
              maxHeight="max-h-130"
              minWidth="min-w-160"
              rows={bundle.appointments}
              rowKey={(a) => a.id}
              onRowClick={(a) => navigate("appointments", { patientId, appointmentId: a.id })}
              empty={<EmptyState icon="CalendarDays" title="No appointments" description="Book an appointment from the appointments module." />}
              columns={[
                { id: "date", header: "Date", cell: (a) => <span className="text-sm">{formatDate(a.date)}</span> },
                { id: "time", header: "Time", cell: (a) => <span className="text-sm">{minutesToTime(a.startMin)}–{minutesToTime(a.endMin)}</span> },
                { id: "therapist", header: "Therapist", cell: (a) => <span className="text-sm">{a.therapist ? fullName({ firstName: a.therapist.firstName, lastName: a.therapist.lastName }) : "—"}</span> },
                { id: "episode", header: "Episode", cell: (a) => <span className="text-sm">{a.episode ? a.episode.title : "—"}</span> },
                { id: "purpose", header: "Purpose", cell: (a) => <span className="text-sm">{a.purpose || "—"}</span> },
                { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
              ]}
            />
          </SectionCard>
        </TabsContent>

        {/* ============ BILLING ============ */}
        <TabsContent value="billing" className="space-y-4">
          <SectionCard title="Invoices" icon="Receipt" description="Latest 20 invoices — click a row to open it in the billing module.">
            <DataTable
              bare
              maxHeight="max-h-105"
              minWidth="min-w-160"
              rows={bundle.invoices}
              rowKey={(inv) => inv.id}
              onRowClick={(inv) => navigate("billing", { patientId, invoiceId: inv.id, focusTab: "invoices" })}
              empty={<EmptyState icon="Receipt" title="No invoices" description="Invoices issued for this patient will appear here." />}
              columns={[
                { id: "invoice", header: "Invoice", cell: (inv) => <span className="font-mono text-xs">{inv.invoiceNumber}</span> },
                { id: "issued", header: "Issued", cell: (inv) => <span className="text-sm">{formatDate(inv.issuedAt)}</span> },
                { id: "arrangement", header: "Arrangement", cell: (inv) => <span className="text-sm">{labelize(inv.arrangement)}</span> },
                { id: "total", header: "Total", align: "right", cell: (inv) => <span className="text-sm">{formatMoney(inv.totalCents)}</span> },
                { id: "paid", header: "Paid", align: "right", cell: (inv) => <span className="text-sm">{formatMoney(inv.paidCents)}</span> },
                { id: "status", header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
              ]}
            />
          </SectionCard>

          {bundle.patientPackages.length > 0 ? (
            <SectionCard title="Session packages" icon="Package">
              <ul className="space-y-2.5">
                {bundle.patientPackages.map((pp) => (
                  <li key={pp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{pp.package.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {pp.usedSessions}/{pp.totalSessions} sessions used · expires {formatDate(pp.expiryDate)} · {formatMoney(pp.amountPaidCents)}
                      </p>
                    </div>
                    <StatusBadge status={pp.status} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </TabsContent>

        {/* ============ MEDICAL HISTORY ============ */}
        <TabsContent value="history">
          <SectionCard
            title="Medical history"
            icon="HeartPulse"
            description="Conditions, surgeries, injuries, medications and allergies recorded for this patient."
            actions={
              canManagePatients ? (
                historyDraft === null ? (
                  <Button size="sm" variant="outline" onClick={startHistoryEdit}>
                    <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setHistoryDraft(null)}>Cancel</Button>
                    <Button size="sm" disabled={patchMutation.isPending} onClick={saveHistory}>Save</Button>
                  </div>
                )
              ) : undefined
            }
          >
            {historyDraft !== null ? (
              <div className="space-y-3">
                {historyDraft.map((row, i) => (
                  <div key={i} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[150px_1fr_1fr_40px]">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={row.type} onValueChange={(v) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, type: v } : r)))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MEDICAL_HISTORY_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input className="h-9" value={row.name} onChange={(e) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Details</Label>
                      <Input className="h-9" value={row.details} onChange={(e) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, details: e.target.value } : r)))} />
                    </div>
                    <div className="flex items-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setHistoryDraft(historyDraft.filter((_, j) => j !== i))} aria-label="Remove entry">
                        <AtomIcon name="Trash2" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setHistoryDraft([...historyDraft, { type: "CONDITION", name: "", details: "" }])}>
                  <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add entry
                </Button>
              </div>
            ) : bundle.medicalHistory.length === 0 ? (
              <EmptyState icon="HeartPulse" title="No medical history recorded" description="Use Edit to add conditions, allergies, medications or declarations such as “No relevant medical history”." />
            ) : (
              <div className="space-y-4">
                {historyByType.map((group) => (
                  <div key={group.type}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labelize(group.type)}</p>
                    <ul className="space-y-2">
                      {group.entries.map((m: MedicalHistoryDto) => (
                        <li key={m.id} className="rounded-lg border px-3 py-2">
                          <p className="text-sm font-medium">{m.name}</p>
                          {m.details ? <p className="text-xs text-muted-foreground">{m.details}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ============ CONTACTS & CONSENT ============ */}
        <TabsContent value="contacts" className="space-y-4">
          <SectionCard
            title="Emergency contacts"
            icon="PhoneCall"
            description="Editable list — changes replace the saved contacts."
            actions={
              canManagePatients ? (
                contactDraft === null ? (
                  <Button size="sm" variant="outline" onClick={startContactEdit}>
                    <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setContactDraft(null)}>Cancel</Button>
                    <Button size="sm" disabled={patchMutation.isPending} onClick={saveContacts}>Save</Button>
                  </div>
                )
              ) : undefined
            }
          >
            {contactDraft !== null ? (
              <div className="space-y-3">
                {contactDraft.map((row, i) => (
                  <div key={i} className="rounded-lg border bg-muted/20 p-3">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input className="h-9" value={row.fullName} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, fullName: e.target.value } : r)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Relationship *</Label>
                        <Input className="h-9" value={row.relationship} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, relationship: e.target.value } : r)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone *</Label>
                        <Input className="h-9" value={row.phone} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, phone: e.target.value } : r)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Alt. phone</Label>
                        <Input className="h-9" value={row.altPhone} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, altPhone: e.target.value } : r)))} />
                      </div>
                      <div className="space-y-1 sm:col-span-3">
                        <Label className="text-xs">Address</Label>
                        <Input className="h-9" value={row.address} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, address: e.target.value } : r)))} />
                      </div>
                      <div className="flex items-end justify-between gap-2 sm:justify-end">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox checked={row.isNextOfKin} onCheckedChange={(v) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, isNextOfKin: v === true } : r)))} />
                          Next of kin
                        </label>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setContactDraft(contactDraft.filter((_, j) => j !== i))} aria-label="Remove contact">
                          <AtomIcon name="Trash2" className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setContactDraft([...contactDraft, { fullName: "", relationship: "", phone: "", altPhone: "", address: "", isNextOfKin: false }])}>
                  <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add contact
                </Button>
              </div>
            ) : contacts.length === 0 ? (
              <EmptyState icon="PhoneCall" title="No emergency contacts" description="Add at least one contact with next-of-kin details." />
            ) : (
              <ul className="space-y-2.5">
                {contacts.map((c: EmergencyContactDto) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">{c.relationship} · {c.phone}{c.altPhone ? ` · ${c.altPhone}` : ""}{c.address ? ` · ${c.address}` : ""}</p>
                    </div>
                    {c.isNextOfKin ? (
                      <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">Next of kin</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Consent record" icon="FileSignature" description="Captured at registration — see the clinic consent policy for details.">
            {consent ? (
              <DetailGrid cols={2}>
                <DetailRow
                  label="Treatment consent"
                  value={
                    <Badge variant="outline" className={consent.treatmentConsent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                      {consent.treatmentConsent ? "Granted" : "Not granted"}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Data consent"
                  value={
                    <Badge variant="outline" className={consent.dataConsent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                      {consent.dataConsent ? "Granted" : "Not granted"}
                    </Badge>
                  }
                />
                <DetailRow label="Signature" value={consent.signatureName} />
                <DetailRow label="Consent date" value={formatDate(consent.consentDate)} />
                <DetailRow label="Guardian" value={consent.guardianName ? `${consent.guardianName}${consent.guardianRelationship ? ` (${consent.guardianRelationship})` : ""}` : undefined} />
              </DetailGrid>
            ) : (
              <EmptyStateCompact message="No consent record found." />
            )}
          </SectionCard>
        </TabsContent>

        {/* ============ REFERRALS ============ */}
        <TabsContent value="referrals">
          <SectionCard title="Referrals" icon="Share2" description="How this patient came to the clinic.">
            {bundle.referrals.length === 0 ? (
              <EmptyState icon="Share2" title="No referrals recorded" />
            ) : (
              <ul className="space-y-3">
                {bundle.referrals.map((r) => (
                  <li key={r.id} className="rounded-lg border px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-navy-50 text-navy-800">{labelize(r.source)}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(r.referralDate)}</span>
                    </div>
                    <div className="mt-2">
                      <DetailGrid cols={2}>
                        <DetailRow label="Referrer" value={r.referrerName} />
                        <DetailRow label="Contact" value={r.referrerContact} />
                        <DetailRow label="Notes" value={r.notes} />
                      </DetailGrid>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* ---------- new episode dialog ---------- */}
      <BookingDialog
        open={bookingOpen}
        onOpenChange={(o) => { setBookingOpen(o); if (!o) invalidate(); }}
        presetPatientId={patientId}
        therapists={appointmentTherapists.data || []}
      />
      <NewEpisodeDialog open={newEpisodeOpen} onOpenChange={setNewEpisodeOpen} patientId={patientId} patientName={name} onCreated={invalidate} />

      {/* ---------- insurance dialog (remounted per target entry) ---------- */}
      {insuranceDialog.open ? (
        <InsuranceDialog
          key={insuranceDialog.entry?.id ?? "new"}
          open={insuranceDialog.open}
          entry={insuranceDialog.entry}
          onOpenChange={(o) => setInsuranceDialog({ open: o, entry: o ? insuranceDialog.entry : null })}
          onSave={saveInsurance}
          saving={patchMutation.isPending}
        />
      ) : null}
    </div>
    </div>
  );
}

// ---------- helpers ----------
function EmptyStateCompact({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

// ---------- New episode dialog ----------
function NewEpisodeDialog({ open, onOpenChange, patientId, patientName, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId: string;
  patientName: string;
  onCreated: () => void;
}) {
  const therapists = useTherapists();
  const [title, setTitle] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ id: string; episodeNumber: number }>(`/api/patients/${patientId}/episodes`, { method: "POST", json: body }),
    onSuccess: (ep) => {
      toast.success(`Episode #${ep.episodeNumber} opened`, { description: "Status: awaiting assessment" });
      onOpenChange(false);
      setTitle(""); setTherapistId(""); setNotes("");
      onCreated();
    },
    onError: (e: Error) => toast.error("Could not open episode", { description: e.message }),
  });

  const submit = () => {
    if (!title.trim()) {
      toast.error("Episode title is required");
      return;
    }
    create.mutate({ title: title.trim(), therapistId: therapistId || undefined, notes: notes.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!create.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open treatment episode</DialogTitle>
          <DialogDescription>
            A new episode for <span className="font-medium text-foreground">{patientName}</span> starts at “Awaiting assessment”. Session numbering and review thresholds are set automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lower back pain — mechanical" />
          </div>
          <div className="space-y-1.5">
            <Label>Assign therapist</Label>
            <Select value={therapistId} onValueChange={setTherapistId}>
              <SelectTrigger><SelectValue placeholder="Optional — assign now or later" /></SelectTrigger>
              <SelectContent>
                {therapists.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Context for the assessing therapist" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" />}
            Open episode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Insurance edit dialog ----------
function InsuranceDialog({ open, entry, onOpenChange, onSave, saving }: {
  open: boolean;
  entry: InsuranceDto | null;
  onOpenChange: (o: boolean) => void;
  onSave: (body: { providerId: string; membershipNumber: string; policyNumber: string; validFrom: string; validTo: string; principalMember: string; relationshipToPrincipal: string }) => void;
  saving: boolean;
}) {
  const providers = useInsuranceProviders();
  // state is initialised from the target entry — parent remounts this dialog with a key per target
  const [providerId, setProviderId] = useState(entry?.providerId || "");
  const [membershipNumber, setMembershipNumber] = useState(entry?.membershipNumber || "");
  const [policyNumber, setPolicyNumber] = useState(entry?.policyNumber || "");
  const [validFrom, setValidFrom] = useState(entry?.validFrom ? String(entry.validFrom).slice(0, 10) : "");
  const [validTo, setValidTo] = useState(entry?.validTo ? String(entry.validTo).slice(0, 10) : "");
  const [principalMember, setPrincipalMember] = useState(entry?.principalMember || "");
  const [relationshipToPrincipal, setRelationshipToPrincipal] = useState(entry?.relationshipToPrincipal || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit insurance policy" : "Add insurance policy"}</DialogTitle>
          <DialogDescription>The policy list is replaced on save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Provider *</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {(providers.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Membership number *</Label>
            <Input value={membershipNumber} onChange={(e) => setMembershipNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Policy number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Principal member</Label>
            <Input value={principalMember} onChange={(e) => setPrincipalMember(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Relationship to principal</Label>
            <Input value={relationshipToPrincipal} onChange={(e) => setRelationshipToPrincipal(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valid from</Label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valid to</Label>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ providerId, membershipNumber, policyNumber, validFrom, validTo, principalMember, relationshipToPrincipal })} disabled={saving}>
            {saving ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
