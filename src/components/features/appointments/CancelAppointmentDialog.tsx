"use client";
// Cancel-appointment confirmation with an optional reason.
import { useState } from "react";
import { formatDate, minutesToTime } from "@/lib/format";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { AppointmentDto } from "./appointments-shared";

export function CancelAppointmentDialog({ appt, open, onOpenChange, pending, onConfirm }: {
  appt: AppointmentDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason?: string) => void;
}) {
  const [cancelReason, setCancelReason] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
          <AlertDialogDescription>
            {`${appt.patient.firstName} ${appt.patient.lastName} — ${formatDate(appt.date)} at ${minutesToTime(appt.startMin)}.`} The therapist is notified and the slot is released.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          rows={2}
          placeholder="Reason (optional)…"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep appointment</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={() => { onConfirm(cancelReason.trim() || undefined); setCancelReason(""); onOpenChange(false); }}
          >
            {pending ? "Cancelling…" : "Cancel appointment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
