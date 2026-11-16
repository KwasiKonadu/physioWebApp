"use client";
// Pinned footer actions of the appointment details panel: confirm, reschedule, complete, cancel, start session.

import { useUIStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { SidePanelFooter } from "@/components/molecules/side-panel";
import { AtomIcon } from "@/components/atoms/icon";
import { AppointmentDto, useAppointmentAction, useStartSession } from "./appointments-shared";

type ActionMutation = ReturnType<typeof useAppointmentAction>;
type StartSessionMutation = ReturnType<typeof useStartSession>;

export function AppointmentActions({ appt, action, startSession, canStartSession, linkedSession, onToggleReschedule, onCancel, doAction, onOpenChange }: {
  appt: AppointmentDto;
  action: ActionMutation;
  startSession: StartSessionMutation;
  canStartSession: boolean;
  linkedSession: unknown;
  onToggleReschedule: () => void;
  onCancel: () => void;
  doAction: (body: Record<string, unknown>, successMsg: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useUIStore((s) => s.navigate);
  const status = appt.status;
  const active = ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(status);
  return (
      <SidePanelFooter>
          {status === "SCHEDULED" ? (
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={action.isPending}
              onClick={() => doAction({ action: "confirm" }, "Appointment confirmed")}>
              <AtomIcon name="Check" className="h-4 w-4" /> Confirm
            </Button>
          ) : null}
          {active ? (
            <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => onToggleReschedule()}>
              <AtomIcon name="CalendarClock" className="h-4 w-4" /> Reschedule
            </Button>
          ) : null}
          {["SCHEDULED", "CONFIRMED"].includes(status) ? (
            <>
              <Button variant="outline" size="sm" disabled={action.isPending}
                onClick={() => doAction({ action: "complete" }, "Marked completed")}>
                <AtomIcon name="CheckCheck" className="h-4 w-4" /> Mark completed
              </Button>
              <Button variant="outline" size="sm" disabled={action.isPending}
                onClick={() => doAction({ action: "no_show" }, "Marked as no-show")}>
                <AtomIcon name="UserX" className="h-4 w-4" /> No-show
              </Button>
              <Button variant="outline" size="sm" disabled={action.isPending}
                onClick={() => doAction({ action: "attended_no_treatment" }, "Marked attended — no treatment")}>
                <AtomIcon name="UserCheck" className="h-4 w-4" /> Attended — no treatment
              </Button>
            </>
          ) : null}
          {active ? (
            <Button variant="destructive" size="sm" disabled={action.isPending} onClick={() => onCancel()}>
              <AtomIcon name="XCircle" className="h-4 w-4" /> Cancel appointment
            </Button>
          ) : null}
          {!linkedSession && canStartSession ? (
            <Button
              size="sm"
              className="ml-auto bg-navy-800 hover:bg-navy-900"
              disabled={startSession.isPending || !appt.episodeId}
              title={appt.episodeId ? "Create the therapy session" : "Link a treatment episode first"}
              onClick={() => startSession.mutate(appt.id, {
                onSuccess: (res) => { onOpenChange(false); navigate("therapy-sessions", { sessionId: res.session.id }); },
              })}
            >
              <AtomIcon name="Activity" className="h-4 w-4" />
              {startSession.isPending ? "Starting…" : "Start therapy session"}
            </Button>
          ) : null}
          {!appt.episodeId && canStartSession && !linkedSession ? (
            <p className="w-full text-xs text-amber-700">Starting a therapy session requires this appointment to be linked to a treatment episode.</p>
          ) : null}
      </SidePanelFooter>
  );
}
