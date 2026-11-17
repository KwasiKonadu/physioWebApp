"use client";
// Inline reschedule form shown inside the appointment details panel.
import { useState } from "react";
import { ymd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppointmentDto } from "./appointments-shared";
import { Field } from "@/components/molecules/field";

export function minutesToInputTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function RescheduleForm({ appt, pending, onSubmit, onCancel }: {
  appt: AppointmentDto;
  pending: boolean;
  onSubmit: (date: string, startMin: number, endMin: number) => void;
  onCancel: () => void;
}) {
  const [resDate, setResDate] = useState(() => ymd(new Date(appt.date)));
  const [resTime, setResTime] = useState(() => minutesToInputTime(appt.startMin));
  const [resDuration, setResDuration] = useState(String(appt.endMin - appt.startMin));

  const submitReschedule = () => {
    const [h, m] = resTime.split(":").map(Number);
    const startMin = h * 60 + m;
    onSubmit(resDate, startMin, startMin + Number(resDuration));
  };

  return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">Reschedule appointment</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="New date">
            <Input type="date" value={resDate} onChange={(e) => setResDate(e.target.value)} />
          </Field>
          <Field label="New start">
            <Input type="time" value={resTime} onChange={(e) => setResTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Duration">
          <Select value={resDuration} onValueChange={setResDuration}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["15", "30", "45", "60"].map((d) => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Keep original</Button>
          <Button size="sm" onClick={submitReschedule} disabled={pending}>
            {pending ? "Saving…" : "Reschedule"}
          </Button>
        </div>
      </div>
  );
}
