"use client";
// Ellipsis menu for a patient table row: edit, new episode, book appointment, new invoice.
// Each action is permission-gated, mirroring the buttons on the patient profile.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PERMS } from "@/lib/constants";
import { fullName } from "@/lib/format";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { BookingDialog } from "../appointments/BookingDialog";
import { useTherapists as useAppointmentTherapists } from "../appointments/appointments-shared";
import { EditPatientDialog } from "./EditPatientDialog";
import { NewEpisodeDialog } from "./NewEpisodeDialog";
import { usePatient, type PatientListItem } from "./hooks";

export function PatientRowActions({ patient }: { patient: PatientListItem }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, PERMS.patientsManage);
  const canClinical = hasPermission(user, PERMS.clinicalManage);
  const canBook = hasPermission(user, PERMS.appointmentsManage);
  const canBill = hasPermission(user, PERMS.billingManage);

  const [editOpen, setEditOpen] = useState(false);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  // the list item has no full record; load it only once edit is requested
  const full = usePatient(editOpen ? patient.id : null);
  const therapists = useAppointmentTherapists();

  const name = fullName({ firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["patients"] });
    void queryClient.invalidateQueries({ queryKey: ["patient", patient.id] });
  };

  if (!canManage && !canClinical && !canBook && !canBill) return null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${name}`}>
            <AtomIcon name="EllipsisVertical" className="h-5 w-5 stroke-[3]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManage ? (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <AtomIcon name="UserPen" className="mr-2 h-4 w-4" /> Edit patient
            </DropdownMenuItem>
          ) : null}
          {canClinical ? (
            <DropdownMenuItem onSelect={() => setEpisodeOpen(true)}>
              <AtomIcon name="Stethoscope" className="mr-2 h-4 w-4" /> New episode
            </DropdownMenuItem>
          ) : null}
          {canBook ? (
            <DropdownMenuItem onSelect={() => setBookingOpen(true)}>
              <AtomIcon name="CalendarPlus" className="mr-2 h-4 w-4" /> Book appointment
            </DropdownMenuItem>
          ) : null}
          {canBill ? (
            <DropdownMenuItem onSelect={() => navigate("billing", { patientId: patient.id, focusTab: "invoices" })}>
              <AtomIcon name="Receipt" className="mr-2 h-4 w-4" /> New invoice
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && full.data ? (
        <EditPatientDialog open={editOpen} onOpenChange={setEditOpen} patient={full.data.patient} onSaved={refresh} />
      ) : null}
      {episodeOpen ? (
        <NewEpisodeDialog open={episodeOpen} onOpenChange={setEpisodeOpen} patientId={patient.id} patientName={name} onCreated={refresh} />
      ) : null}
      {bookingOpen ? (
        <BookingDialog
          open={bookingOpen}
          onOpenChange={(o) => { setBookingOpen(o); if (!o) refresh(); }}
          presetPatientId={patient.id}
          therapists={therapists.data || []}
        />
      ) : null}
    </div>
  );
}
