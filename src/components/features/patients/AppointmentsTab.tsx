"use client";
// Patient profile: appointments tab.

import { formatDate, fullName, minutesToTime } from "@/lib/format";
import { useUIStore } from "@/stores/app-store";
import { DataTable } from "@/components/molecules/data-table";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { TabsContent } from "@/components/ui/tabs";
import type { PatientBundle } from "./hooks";

export function AppointmentsTab({ bundle, navigate, patientId }: { bundle: PatientBundle; navigate: ReturnType<typeof useUIStore.getState>["navigate"]; patientId: string }) {
  return (
    <TabsContent value="appointments">
      <SectionCard title="Recent appointments" icon="CalendarDays" description="Latest 20 appointments — click a row to open it in the appointments module." noPadding>
        <DataTable
          bare
          maxHeight="max-h-130"
          minWidth="min-w-160"
          rows={bundle.appointments}
          rowKey={(a) => a.id}
          onRowClick={(a) => navigate("appointments", { patientId, appointmentId: a.id })}
          empty={<EmptyState icon="CalendarDays" title="No appointments" description="Book an appointment from the appointments module." />}
          columns={[
            { id: "date", header: "Date", cell: (a) => <span className="text-sm">{formatDate(a.date)}</span> },
            { id: "time", header: "Time", cell: (a) => <span className="text-sm">{minutesToTime(a.startMin)}–{minutesToTime(a.endMin)}</span> },
            { id: "therapist", header: "Therapist", cell: (a) => <span className="text-sm">{a.therapist ? fullName({ firstName: a.therapist.firstName, lastName: a.therapist.lastName }) : "—"}</span> },
            { id: "episode", header: "Episode", cell: (a) => <span className="text-sm">{a.episode ? a.episode.title : "—"}</span> },
            { id: "purpose", header: "Purpose", cell: (a) => <span className="text-sm">{a.purpose || "—"}</span> },
            { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
      </SectionCard>
    </TabsContent>
  );
}
