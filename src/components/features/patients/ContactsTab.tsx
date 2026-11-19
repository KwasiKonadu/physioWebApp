"use client";
// Patient profile: contacts tab.

import { formatDate } from "@/lib/format";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { type EmergencyContactDto } from "./hooks";
import type { PatientBundle } from "./hooks";
import { ContactDraft, EmptyStateCompact } from "./patient-profile-shared";
import { Field } from "@/components/molecules/field";

export function ContactsTab({ canManagePatients, consent, contactDraft, contacts, name, patchMutation, saveContacts, setContactDraft, startContactEdit }: { canManagePatients: boolean; consent: PatientBundle["consents"][number] | undefined; contactDraft: ContactDraft[] | null; contacts: PatientBundle["emergencyContacts"]; name: string; patchMutation: { isPending: boolean; mutate: (body: Record<string, unknown>, opts?: { onSuccess?: () => void }) => void }; saveContacts: () => void; setContactDraft: (v: ContactDraft[] | null) => void; startContactEdit: () => void }) {
  return (
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
                  <Field label="Name" required>
                    <Input className="h-9" value={row.fullName} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, fullName: e.target.value } : r)))} />
                  </Field>
                  <Field label="Relationship" required>
                    <Input className="h-9" value={row.relationship} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, relationship: e.target.value } : r)))} />
                  </Field>
                  <Field label="Phone" required>
                    <Input className="h-9" value={row.phone} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, phone: e.target.value } : r)))} />
                  </Field>
                  <Field label="Alt. phone">
                    <Input className="h-9" value={row.altPhone} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, altPhone: e.target.value } : r)))} />
                  </Field>
                  <Field label="Address" className="sm:col-span-3">
                    <Input className="h-9" value={row.address} onChange={(e) => setContactDraft(contactDraft.map((r, j) => (j === i ? { ...r, address: e.target.value } : r)))} />
                  </Field>
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
                  <Badge variant="outline" className="border-navy-200 bg-navy-50 text-navy-800">Next of kin</Badge>
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
  );
}
