"use client";
// ============ Appointment details dialog: full info + status actions + start-session bridge ============
import { useState } from "react";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import { formatDate, formatDateTime, minutesToTime, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import {
  AppointmentDto, statusTone, useAppointmentAction, useAppointmentDetail, useStartSession,
} from "./appointments-shared";

function minutesToInputTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isToday(dateStr: string): boolean {
  return ymd(new Date(dateStr)) === ymd(new Date());
}

interface AppointmentDetailsProps {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppointmentDetails({ appointmentId, open, onOpenChange }: AppointmentDetailsProps) {
  const detail = useAppointmentDetail(open ? appointmentId : null);
  const appt = detail.data?.appointment;
  const action = useAppointmentAction();
  const startSession = useStartSession();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-scrollbar max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Appointment
            {appt ? <StatusBadge status={appt.status} /> : null}
            {appt?.walkIn ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AtomIcon name="Zap" className="h-3 w-3" /> Walk-in
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>Full booking details, actions and the linked therapy session.</DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !appt ? (
          <EmptyState icon="CalendarOff" title="Appointment not found" description="It may have been removed or belongs to another clinic." />
        ) : (
          // keyed remount keeps per-appointment UI state fresh without effects
          <AppointmentDetailsBody
            key={appt.id}
            appt={appt}
            onOpenChange={onOpenChange}
            action={action}
            startSession={startSession}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ActionMutation = ReturnType<typeof useAppointmentAction>;
type StartSessionMutation = ReturnType<typeof useStartSession>;

function AppointmentDetailsBody({ appt, onOpenChange, action, startSession }: {
  appt: AppointmentDto;
  onOpenChange: (open: boolean) => void;
  action: ActionMutation;
  startSession: StartSessionMutation;
}) {
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.appointmentsManage);
  const canClinical = hasPermission(user, PERMS.clinicalManage);

  // fresh per-appointment state (component is keyed by appt.id)
  const [rescheduling, setRescheduling] = useState(false);
  const [resDate, setResDate] = useState(() => ymd(new Date(appt.date)));
  const [resTime, setResTime] = useState(() => minutesToInputTime(appt.startMin));
  const [resDuration, setResDuration] = useState(String(appt.endMin - appt.startMin));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const linkedSession = appt.sessions?.[0] || null;
  const status = appt.status;
  const active = ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(status);
  const canStartSession = canClinical && (
    status === "COMPLETED" || ((status === "SCHEDULED" || status === "CONFIRMED") && isToday(appt.date))
  );

  const doAction = (body: Record<string, unknown>, successMsg: string) =>
    action.mutate({ id: appt.id, body, successMsg });

  const submitReschedule = () => {
    const [h, m] = resTime.split(":").map(Number);
    const startMin = h * 60 + m;
    doAction(
      { action: "reschedule", date: resDate, startMin, endMin: startMin + Number(resDuration) },
      "Appointment rescheduled",
    );
    setRescheduling(false);
  };

  return (
    <>
      <div className="space-y-4">
        {/* patient header */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border bg-white text-sm font-semibold", statusTone(status).chip)}>
            {(appt.patient.firstName?.[0] || "?") + (appt.patient.lastName?.[0] || "")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appt.patient.firstName} {appt.patient.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{appt.patient.patientCode}{appt.patient.phone ? ` · ${appt.patient.phone}` : ""}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => { onOpenChange(false); navigate("patients", { patientId: appt.patientId }); }}
          >
            Patient file
          </Button>
        </div>

        <DetailGrid>
          <DetailRow label="Date" value={formatDate(appt.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
          <DetailRow label="Time" value={`${minutesToTime(appt.startMin)} – ${minutesToTime(appt.endMin)}`} />
          <DetailRow label="Therapist" value={appt.therapist ? `${appt.therapist.firstName} ${appt.therapist.lastName}${appt.therapist.jobTitle ? ` · ${appt.therapist.jobTitle}` : ""}` : "—"} />
          <DetailRow label="Purpose" value={appt.purpose} />
          <DetailRow label="Episode" value={appt.episode ? appt.episode.title : "Not linked"} />
          <DetailRow label="Created" value={formatDateTime(appt.createdAt)} />
        </DetailGrid>

        {appt.notes ? (
          <DetailRow label="Notes" value={<span className="whitespace-pre-wrap">{appt.notes}</span>} />
        ) : null}

        {/* linked therapy session */}
        {linkedSession ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Linked therapy session</p>
              <p className="mt-0.5 flex items-center gap-2 text-sm">
                <StatusBadge status={linkedSession.status} />
                <span className="text-muted-foreground">{linkedSession.date ? formatDate(linkedSession.date) : "—"}</span>
              </p>
            </div>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => { onOpenChange(false); navigate("therapy-sessions", { sessionId: linkedSession.id }); }}
            >
              Open session
            </Button>
          </div>
        ) : null}

        {/* reschedule inline form */}
        {rescheduling ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Reschedule appointment</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">New date</Label>
                <Input type="date" value={resDate} onChange={(e) => setResDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">New start</Label>
                <Input type="time" value={resTime} onChange={(e) => setResTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duration</Label>
              <Select value={resDuration} onValueChange={setResDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15", "30", "45", "60"].map((d) => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRescheduling(false)}>Keep original</Button>
              <Button size="sm" onClick={submitReschedule} disabled={action.isPending}>
                {action.isPending ? "Saving…" : "Reschedule"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* actions */}
        {canManage ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {status === "SCHEDULED" ? (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={action.isPending}
                onClick={() => doAction({ action: "confirm" }, "Appointment confirmed")}>
                <AtomIcon name="Check" className="h-4 w-4" /> Confirm
              </Button>
            ) : null}
            {active ? (
              <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => setRescheduling((v) => !v)}>
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
              <Button variant="destructive" size="sm" disabled={action.isPending} onClick={() => setCancelOpen(true)}>
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
          </div>
        ) : null}
      </div>

      {/* cancel with reason */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
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
              disabled={action.isPending}
              onClick={() => { doAction({ action: "cancel", reason: cancelReason.trim() || undefined }, "Appointment cancelled"); setCancelOpen(false); }}
            >
              {action.isPending ? "Cancelling…" : "Cancel appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
