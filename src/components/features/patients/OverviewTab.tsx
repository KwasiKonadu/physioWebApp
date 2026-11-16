"use client";
// Patient profile: overview tab.

import { calcAge, formatDate, formatDateTime, fullName } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { type InsuranceDto } from "./hooks";
import type { PatientBundle } from "./hooks";
import { PAYMENT_TONES, EmptyStateCompact } from "./patient-profile-shared";

export function OverviewTab({ bundle, canManagePatients, consent, contacts, name, patient, removeInsurance, setInsuranceDialog }: { bundle: PatientBundle; canManagePatients: boolean; consent: PatientBundle["consents"][number] | undefined; contacts: PatientBundle["emergencyContacts"]; name: string; patient: PatientBundle["patient"]; removeInsurance: (id: string) => void; setInsuranceDialog: (v: { open: boolean; entry: InsuranceDto | null }) => void }) {
  return (
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
  );
}
