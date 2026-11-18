"use client";
// ============ Patient profile: header + 7 tabs (overview, episodes, appointments, billing, history, contacts, referrals) ============
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { calcAge, fullName, initials } from "@/lib/format";
import {
  PERMS, MEDICAL_HISTORY_TYPES, labelize,
} from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { BookingDialog } from "../appointments/BookingDialog";
import { useTherapists as useAppointmentTherapists } from "../appointments/appointments-shared";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { usePatient, type InsuranceDto } from "./hooks";
import { PAYMENT_TONES, ContactDraft, HistoryDraft } from "./patient-profile-shared";
import { NewEpisodeDialog } from "./NewEpisodeDialog";
import { EditPatientDialog } from "./EditPatientDialog";
import { InsuranceDialog } from "./InsuranceDialog";
import { OverviewTab } from "./OverviewTab";
import { EpisodesTab } from "./EpisodesTab";
import { AppointmentsTab } from "./AppointmentsTab";
import { BillingTab } from "./BillingTab";
import { HistoryTab } from "./HistoryTab";
import { ContactsTab } from "./ContactsTab";
import { ReferralsTab } from "./ReferralsTab";

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
  const [editOpen, setEditOpen] = useState(false);
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
                <span className="code-chip">{patient.patientCode}</span>
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
            {canManagePatients ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <AtomIcon name="UserPen" className="mr-2 h-4 w-4" /> Edit patient
              </Button>
            ) : null}
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
        <OverviewTab bundle={bundle} canManagePatients={canManagePatients} consent={consent} contacts={contacts} name={name} patient={patient} />

        {/* ============ EPISODES ============ */}
        <EpisodesTab bundle={bundle} canClinicalManage={canClinicalManage} invalidate={invalidate} name={name} patient={patient} patientId={patientId} setNewEpisodeOpen={setNewEpisodeOpen} />

        {/* ============ APPOINTMENTS ============ */}
        <AppointmentsTab bundle={bundle} navigate={navigate} patientId={patientId} />

        {/* ============ BILLING ============ */}
        <BillingTab bundle={bundle} name={name} navigate={navigate} patient={patient} patientId={patientId} canBill={canBill} canManagePatients={canManagePatients} removeInsurance={removeInsurance} setInsuranceDialog={setInsuranceDialog} onChangeArrangement={() => setEditOpen(true)} />

        {/* ============ MEDICAL HISTORY ============ */}
        <HistoryTab bundle={bundle} canManagePatients={canManagePatients} historyByType={historyByType} historyDraft={historyDraft} name={name} patchMutation={patchMutation} patient={patient} saveHistory={saveHistory} setHistoryDraft={setHistoryDraft} startHistoryEdit={startHistoryEdit} />

        {/* ============ CONTACTS & CONSENT ============ */}
        <ContactsTab canManagePatients={canManagePatients} consent={consent} contactDraft={contactDraft} contacts={contacts} name={name} patchMutation={patchMutation} saveContacts={saveContacts} setContactDraft={setContactDraft} startContactEdit={startContactEdit} />

        {/* ============ REFERRALS ============ */}
        <ReferralsTab bundle={bundle} patient={patient} />
      </Tabs>

      {/* ---------- new episode dialog ---------- */}
      <BookingDialog
        open={bookingOpen}
        onOpenChange={(o) => { setBookingOpen(o); if (!o) invalidate(); }}
        presetPatientId={patientId}
        therapists={appointmentTherapists.data || []}
      />
      <EditPatientDialog open={editOpen} onOpenChange={setEditOpen} patient={patient} onSaved={invalidate} />
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
