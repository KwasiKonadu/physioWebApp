"use client";
// Settings: appointment and clinical default cards.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import type { SettingsData } from "./settings-types";
import { EditableCard, fmtTime, Field } from "./SettingsShared";

export function ConfigCards({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const cfg = data.settings;

  const [slotMin, setSlotMin] = useState(String(cfg.appointmentSlotMin));
  const [hoursStart, setHoursStart] = useState(cfg.workingHoursStart);
  const [hoursEnd, setHoursEnd] = useState(cfg.workingHoursEnd);
  const [threshold, setThreshold] = useState(String(cfg.reviewThreshold));

  const patch = async (settings: Record<string, unknown>, message: string) => {
    await apiFetch("/api/settings", { method: "PATCH", json: { settings } });
    toast.success(message);
    await qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const invalidThreshold = !Number.isInteger(parseInt(threshold, 10)) || parseInt(threshold, 10) < 1 || parseInt(threshold, 10) > 100;
  const invalidHours = !hoursStart || !hoursEnd || hoursEnd <= hoursStart;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <EditableCard
          title="Appointment defaults"
          icon="CalendarDays"
          description="Used by the appointment booking grid"
          canSave={!invalidHours}
          onStart={() => { setSlotMin(String(cfg.appointmentSlotMin)); setHoursStart(cfg.workingHoursStart); setHoursEnd(cfg.workingHoursEnd); }}
          onSave={() => patch({ appointmentSlotMin: parseInt(slotMin, 10), workingHoursStart: hoursStart, workingHoursEnd: hoursEnd }, "Appointment defaults saved")}
          preview={
            <DetailGrid cols={1}>
              <DetailRow label="Slot length" value={`${cfg.appointmentSlotMin} minutes`} />
              <DetailRow label="Working hours" value={`${fmtTime(cfg.workingHoursStart)} – ${fmtTime(cfg.workingHoursEnd)}`} />
            </DetailGrid>
          }
          form={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 *:min-w-0">
              <Field label="Slot minutes">
                <Select value={slotMin} onValueChange={setSlotMin}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 20, 30, 45, 60].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Working hours start">
                <Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
              </Field>
              <Field label="Working hours end">
                <Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
                {invalidHours ? <p className="text-xs text-rose-600">End must be after start.</p> : null}
              </Field>
            </div>
          }
        />

        <EditableCard
          title="Clinical"
          icon="Stethoscope"
          canSave={!invalidThreshold}
          onStart={() => setThreshold(String(cfg.reviewThreshold))}
          onSave={() => patch({ reviewThreshold: parseInt(threshold, 10) }, "Clinical settings saved")}
          preview={
            <>
              <DetailGrid cols={1}>
                <DetailRow label="Review threshold" value={`${cfg.reviewThreshold} sessions`} />
              </DetailGrid>
              <p className="mt-2 text-xs text-muted-foreground">
                Every <span className="font-semibold text-navy-800">{cfg.reviewThreshold}</span> completed therapy sessions, the
                patient&apos;s episode is flagged for a progress review.
              </p>
            </>
          }
          form={
            <>
              <Field label="Review threshold (sessions)">
                <Input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="max-w-40" />
              </Field>
              <p className="mt-2 text-xs text-muted-foreground">
                Every <span className="font-semibold text-navy-800">{threshold || "N"}</span> completed therapy sessions, the
                patient&apos;s episode is flagged for a progress review.
              </p>
              {invalidThreshold ? <p className="mt-1 text-xs text-rose-600">Enter a whole number between 1 and 100.</p> : null}
            </>
          }
        />
      </div>
    </>
  );
}
