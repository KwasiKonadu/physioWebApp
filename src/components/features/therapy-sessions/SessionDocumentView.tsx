"use client";
// FEATURE: Session documentation — vitals, interventions delivered, completion, cancellation, read-only history

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, minutesToTime, formatDate, initials } from "@/lib/format";
import { PERMS, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { PageHeader } from "@/components/molecules/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { EDITABLE_STATUSES, DetailResponse } from "./session-form";
import { ReadOnlyDocumentation, PackageLedgerCard } from "./SessionReadOnly";
import { SessionEditForm } from "./SessionEditForm";

// ---- Main view ----
export default function SessionDocumentView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [reviewDueFlag, setReviewDueFlag] = useState(false);
  const leaveRef = useRef<((go: () => void) => boolean) | null>(null);

  const detailQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => apiFetch<DetailResponse>(`/api/sessions/${sessionId}`),
  });

  const session = detailQuery.data?.session;
  const ledger = detailQuery.data?.packageTransactions ?? [];
  const editable = !!session && EDITABLE_STATUSES.includes(session.status) && canManage;

  // ---- Loading / error ----
  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (detailQuery.isError || !session) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Session not found"
        description={(detailQuery.error as Error)?.message || "This session may have been removed."}
        action={<Button variant="outline" onClick={onBack}>Back to sessions</Button>}
      />
    );
  }

  const patient = session.patient;
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const reviewDue = reviewDueFlag || session.episode.reviewDue;
  const goBack = () => { if (leaveRef.current?.(onBack)) return; onBack(); };
  const hasLedger = patient.paymentArrangement === "PACKAGE" || ledger.length > 0;
  const ledgerEl = <PackageLedgerCard transactions={ledger} arrangement={patient.paymentArrangement} />;
  const therapistName = session.therapist ? `${session.therapist.firstName} ${session.therapist.lastName}` : "—";

  return (
    <div className="space-y-4">
      <PageBreadcrumb items={[{ label: "Therapy Sessions", onClick: goBack }, { label: `Session — ${patientName}` }]} />
      <PageHeader title="Therapy session" description="Document the treatment delivered, vitals and clinical record" icon="Activity" />

      {/* Summary card */}
      <div className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(patientName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">
                  <button
                    type="button"
                    title="Open patient profile"
                    className="truncate text-left transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline"
                    onClick={() => navigate("patients", { patientId: session.patientId })}
                  >
                    {patientName}
                  </button>
                </h2>
                <span className="code-chip">{patient.patientCode}</span>
                <StatusBadge status={session.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{session.episode.title}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
            {[
              { l: "Date & time", v: `${formatDate(session.date)} · ${minutesToTime(session.timeMin)}` },
              { l: "Therapist", v: therapistName },
              { l: "Payment", v: labelize(patient.paymentArrangement) },
              { l: "Review cycle", v: `${session.episode.sessionsSinceReview}/${session.episode.reviewThreshold}${session.episode.reviewDue ? " · due" : ""}`, warn: session.episode.reviewDue },
            ].map((x) => (
              <div key={x.l} className="min-w-0">
                <dt className="label-caps-sm">{x.l}</dt>
                <dd className={cn("truncate text-sm font-semibold", x.warn && "text-amber-600")}>{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          {session.appointment ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
              onClick={() => navigate("appointments", { appointmentId: session.appointment!.id })}
              title="Open linked appointment"
            >
              <AtomIcon name="CalendarDays" className="h-3.5 w-3.5" />
              Appointment · {formatDate(session.appointment.date)} {minutesToTime(session.appointment.startMin)}
            </button>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Walk-in / no linked appointment</Badge>
          )}
          {session.completedAt ? <span className="text-xs text-muted-foreground">Completed {formatDateTime(session.completedAt)}</span> : null}
        </div>
      </div>

      {/* Review-due warning */}
      {reviewDue ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-800">
          <AtomIcon name="AlertTriangle" className="h-4 w-4" />
          <AlertTitle>Progress review now due</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {session.episode.sessionsSinceReview}/{session.episode.reviewThreshold} sessions completed since the last review — a progress review is required before continuing treatment.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
              onClick={() => navigate("progress-reviews", { episodeId: session.episodeId })}
            >
              Go to progress reviews
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {session.status === "CANCELLED" || session.status === "NO_SHOW" ? (
        <>
          <Alert>
            <AtomIcon name="Info" className="h-4 w-4" />
            <AlertTitle>{labelize(session.status)} session</AlertTitle>
            <AlertDescription>
              This session was not delivered. It does not count toward progress-review thresholds and does not deduct any package sessions.
            </AlertDescription>
          </Alert>
          <div className="split-grid">
            <SectionCard title="Session record" icon="FileText" className="h-full">
              <DetailGrid cols={1}>
                <DetailRow label="Scheduled for" value={`${formatDate(session.date)} ${minutesToTime(session.timeMin)}`} />
                <DetailRow label="Therapist" value={therapistName} />
                <DetailRow label="Notes" value={<span className="whitespace-pre-wrap">{session.notes || "—"}</span>} />
              </DetailGrid>
            </SectionCard>
            {hasLedger ? <div className="flex flex-col *:flex-1">{ledgerEl}</div> : null}
          </div>
        </>
      ) : session.status === "COMPLETED" || !editable ? (
        <ReadOnlyDocumentation session={session} aside={ledgerEl} hasAside={hasLedger} />
      ) : (
        <SessionEditForm
          key={session.id}
          session={session}
          onBack={onBack}
          onReviewDue={() => setReviewDueFlag(true)}
          aside={ledgerEl}
          hasAside={hasLedger}
          leaveRef={leaveRef}
        />
      )}
    </div>
  );
}
