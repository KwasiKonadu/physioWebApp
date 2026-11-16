"use client";
// ============ Booking dialog: react-hook-form + zod, patient search, conflict handling ============
import { ymd } from "@/lib/format";
import { SidePanel } from "@/components/molecules/side-panel";
import { TherapistOption } from "./appointments-shared";
import { BookingForm } from "./BookingForm";

export interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetPatientId?: string | null;
  presetWalkIn?: boolean;
  defaultDate?: string;
  therapists: TherapistOption[];
}

export function BookingDialog({ open, onOpenChange, presetPatientId, presetWalkIn, defaultDate, therapists }: BookingDialogProps) {
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={presetWalkIn ? "Book walk-in appointment" : "Book appointment"}
      description="Schedule a session with a physiotherapist. Overlaps are rejected by the server."
    >
      {open ? (
        // keyed mount = fresh form state per opening, no reset effects needed
        <BookingForm
          key={`${presetPatientId || ""}|${presetWalkIn ? 1 : 0}|${defaultDate || ""}`}
          onDone={() => onOpenChange(false)}
          presetPatientId={presetPatientId || null}
          presetWalkIn={!!presetWalkIn}
          defaultDate={defaultDate || ymd(new Date())}
          therapists={therapists}
        />
      ) : null}
    </SidePanel>
  );
}
