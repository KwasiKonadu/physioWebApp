"use client";
// Staff profile tab: the patients assigned to this therapist (their clients).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounced, usePatientList, type PatientListItem } from "../patients/hooks";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { DataTable } from "@/components/molecules/data-table";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PATIENT_STATUSES, labelize } from "@/lib/constants";
import { formatDate, fullName, initials } from "@/lib/format";
import { useUrlState } from "@/hooks/use-url-state";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-navy-50 text-navy-800 border-navy-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

export default function StaffPatientsTab({ staffId, staffName }: { staffId: string; staffName: string }) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useUrlState("sp_q", "");
  const [status, setStatus] = useUrlState("sp_status", "all");
  const [page, setPage] = useUrlState("sp_page", 1);
  const [pageSize, setPageSize] = useUrlState("sp_size", 10);
  const search = useDebounced(searchInput, 300);

  const list = usePatientList({
    search,
    status: status === "all" ? "" : status,
    arrangement: "",
    therapistId: staffId,
    page,
    pageSize,
    sort: "createdAt",
    order: "desc",
  });
  const items = list.data?.items ?? [];
  const filtered = !!search || status !== "all";

  return (
    <div className="space-y-3">
      <DataToolbar
        search={{ value: searchInput, onChange: (v) => { setSearchInput(v); setPage(1); }, placeholder: "Search name, ID or phone…" }}
        onRefresh={() => void list.refetch()}
        refreshing={list.isFetching}
        filters={
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PATIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <DataTable
        rows={items}
        rowKey={(p: PatientListItem) => p.id}
        loading={list.isLoading}
        loadingRows={5}
        minWidth="min-w-200"
        onRowClick={(p) => router.push(`/patients/${p.id}`)}
        empty={
          <EmptyState
            icon="Users"
            title={filtered ? "No matching patients" : "No patients assigned"}
            description={filtered ? "Try adjusting the search or status." : `${staffName} has no patients assigned yet. Assign a therapist from a patient's profile.`}
          />
        }
        pagination={{ page, pageSize, total: list.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
        columns={[
          { id: "code", header: "Patient ID", cell: (p) => <span className="font-mono text-xs text-muted-foreground">{p.patientCode}</span> },
          {
            id: "name", header: "Name",
            cell: (p) => {
              const name = fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName });
              return (
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-navy-50 text-xs font-semibold text-navy-800">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {p.activeEpisodeTitle ? <p className="truncate text-xs text-muted-foreground">{p.activeEpisodeTitle}</p> : null}
                  </div>
                </div>
              );
            },
          },
          { id: "phone", header: "Phone", cell: (p) => <span className="text-sm">{p.phone}</span> },
          { id: "registered", header: "Registered", cell: (p) => <span className="text-sm">{formatDate(p.createdAt)}</span> },
          { id: "payment", header: "Payment", cell: (p) => <Badge variant="outline" className={PAYMENT_TONES[p.paymentArrangement] || ""}>{labelize(p.paymentArrangement)}</Badge> },
          { id: "status", header: "Status", cell: (p) => <StatusBadge status={p.currentStatus} /> },
          { id: "actions", header: "Actions", align: "right", cell: (p) => <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/patients/${p.id}`); }}>Open</Button> },
        ]}
      />
    </div>
  );
}
