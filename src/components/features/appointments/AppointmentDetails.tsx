"use client";
// ============ Appointment details dialog: full info + status actions + start-session bridge ============
import { useState } from "react";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import { formatDate, formatDateTime, minutesToTime, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidePanel, SidePanelBody } from "@/components/molecules/side-panel";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { AppointmentActions } from "./AppointmentActions";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";
import { RescheduleForm } from "./AppointmentRescheduleForm";
import {
  AppointmentDto, statusTone, useAppointmentAction, useAppointmentDetail, useStartSession,
} from "./appointments-shared";

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
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Appointment"
      description="Full booking details, actions and the linked therapy session."
      headerExtra={(
        <>
          {appt ? <StatusBadge status={appt.status} /> : null}
          {appt?.walkIn ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              <AtomIcon name="Zap" className="h-3 w-3" /> Walk-in
            </span>
          ) : null}
        </>
      )}
    >
      {detail.isLoading ? (
        <SidePanelBody>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </SidePanelBody>
      ) : !appt ? (
        <SidePanelBody>
          <EmptyState icon="CalendarOff" title="Appointment not found" description="It may have been removed or belongs to another clinic." />
        </SidePanelBody>
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
    </SidePanel>
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
  const [cancelOpen, setCancelOpen] = useState(false);

  const linkedSession = appt.sessions?.[0] || null;
  const status = appt.status;
  const canStartSession = canClinical && (
    status === "COMPLETED" || ((status === "SCHEDULED" || status === "CONFIRMED") && isToday(appt.date))
  );

  const doAction = (body: Record<string, unknown>, successMsg: string) =>
    action.mutate({ id: appt.id, body, successMsg });

  return (
    <>
      <SidePanelBody>
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

        {rescheduling ? (
          <RescheduleForm
            appt={appt}
            pending={action.isPending}
            onSubmit={(date, startMin, endMin) => {
              doAction({ action: "reschedule", date, startMin, endMin }, "Appointment rescheduled");
              setRescheduling(false);
            }}
            onCancel={() => setRescheduling(false)}
          />
        ) : null}

      </div>
      </SidePanelBody>

      {canManage ? (
        <AppointmentActions
          appt={appt}
          action={action}
          startSession={startSession}
          canStartSession={canStartSession}
          linkedSession={linkedSession}
          onToggleReschedule={() => setRescheduling((v) => !v)}
          onCancel={() => setCancelOpen(true)}
          doAction={doAction}
          onOpenChange={onOpenChange}
        />
      ) : null}

      <CancelAppointmentDialog
        appt={appt}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={action.isPending}
        onConfirm={(reason) => doAction({ action: "cancel", reason }, "Appointment cancelled")}
      />
    </>
  );
}
