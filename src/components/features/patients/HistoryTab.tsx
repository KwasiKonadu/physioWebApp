"use client";
// Patient profile: history tab.

import { MEDICAL_HISTORY_TYPES, labelize } from "@/lib/constants";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { TabsContent } from "@/components/ui/tabs";
import { type MedicalHistoryDto } from "./hooks";
import type { PatientBundle } from "./hooks";
import { HistoryDraft } from "./patient-profile-shared";
import { Field } from "@/components/molecules/field";

export function HistoryTab({ bundle, canManagePatients, historyByType, historyDraft, name, patchMutation, patient, saveHistory, setHistoryDraft, startHistoryEdit }: { bundle: PatientBundle; canManagePatients: boolean; historyByType: { type: string; entries: MedicalHistoryDto[] }[]; historyDraft: HistoryDraft[] | null; name: string; patchMutation: { isPending: boolean; mutate: (body: Record<string, unknown>, opts?: { onSuccess?: () => void }) => void }; patient: PatientBundle["patient"]; saveHistory: () => void; setHistoryDraft: (v: HistoryDraft[] | null) => void; startHistoryEdit: () => void }) {
  return (
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
                <Field label="Type">
                  <Select value={row.type} onValueChange={(v) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, type: v } : r)))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDICAL_HISTORY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Name" required>
                  <Input className="h-9" value={row.name} onChange={(e) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                </Field>
                <Field label="Details">
                  <Input className="h-9" value={row.details} onChange={(e) => setHistoryDraft(historyDraft.map((r, j) => (j === i ? { ...r, details: e.target.value } : r)))} />
                </Field>
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
  );
}
