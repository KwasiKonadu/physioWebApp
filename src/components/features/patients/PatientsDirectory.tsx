"use client";
// ============ Patients directory: searchable/filterable table + pagination ============
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/molecules/page-header";
import { TopBarTitle } from "@/components/templates/topbar-slots";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { CardGrid } from "@/components/molecules/card-grid";
import { ViewToggle } from "@/components/molecules/view-toggle";
import { DataTable } from "@/components/molecules/data-table";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { avatarTone } from "@/components/molecules/profile-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { calcAge, formatDate, fullName, initials } from "@/lib/format";
import { PERMS, PATIENT_STATUSES, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { patientQueryOptions, useDebounced, usePatientList, useTherapists, type PatientListItem } from "./hooks";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PatientCard } from "./PatientCard";
import { PatientRowActions } from "./PatientRowActions";
import PatientRegistrationDialog from "./PatientRegistrationDialog";
import { useUrlState } from "@/hooks/use-url-state";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-navy-50 text-navy-800 border-navy-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

interface Props {
  onOpen: (patientId: string) => void;
}

export default function PatientsDirectory({ onOpen }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, PERMS.patientsManage);

  const [searchInput, setSearchInput] = useUrlState("q", "");
  const [status, setStatus] = useUrlState("status", "all");
  const [arrangement, setArrangement] = useUrlState("arr", "all");
  const [therapistId, setTherapistId] = useUrlState("therapist", "all");
  const [page, setPage] = useUrlState("page", 1);
  const [pageSize, setPageSize] = useUrlState("size", 10);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [view, setView] = usePersistentState<"table" | "grid">("gmrs-patients-view", "table", ["table", "grid"]);

  const search = useDebounced(searchInput, 300);
  const therapists = useTherapists();

  const list = usePatientList({
    search,
    status: status === "all" ? "" : status,
    arrangement: arrangement === "all" ? "" : arrangement,
    therapistId: therapistId === "all" ? "" : therapistId,
    page,
    pageSize,
    sort,
    order,
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const resetPage = () => setPage(1);

  const toggleSort = (field: string) => {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("asc");
    }
    resetPage();
  };

  const handleRegistered = (patientId: string) => {
    toast.success("Patient registered", { description: "The profile is ready." });
    void queryClient.invalidateQueries({ queryKey: ["patients"] });
    setRegisterOpen(false);
    onOpen(patientId);
  };

  const emptyBlock = (
    <div className="p-4">
              <EmptyState
                icon="Users"
                title="No patients found"
                description={
                  search || status !== "all" || arrangement !== "all" || therapistId !== "all"
                    ? "No patients match the current filters. Try adjusting your search."
                    : "Register the first patient to get started."
                }
                action={
                  canManage && !search && status === "all" && arrangement === "all" && therapistId === "all" ? (
                    <Button onClick={() => setRegisterOpen(true)}>
                      <AtomIcon name="UserPlus" className="mr-2 h-4 w-4" />
                      Register patient
                    </Button>
                  ) : undefined
                }
              />
            </div>
  );

  const paginationEl = (
    <TablePagination
      standalone
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={(s) => {
        setPageSize(s);
        resetPage();
      }}
    />
  );

  return (
    <div>
      <TopBarTitle><h1 className="truncate text-lg font-semibold text-navy-800">Patient Management</h1></TopBarTitle>
      <PageHeader
        title="Patient Management"
        description="Register new patients, manage records and open treatment profiles"
        icon="Users"
      />

      <div className="mb-3">
        <DataToolbar
          search={{
            value: searchInput,
            onChange: (v) => {
              setSearchInput(v);
              resetPage();
            },
            placeholder: "Search name, ID or phone…",
          }}
          filters={
            <>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-37.5">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PATIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={arrangement}
                onValueChange={(v) => {
                  setArrangement(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-37.5">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All arrangements</SelectItem>
                  {PAYMENT_ARRANGEMENTS.map((p) => (
                    <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={therapistId}
                onValueChange={(v) => {
                  setTherapistId(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-42.5">
                  <SelectValue placeholder="Therapist" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All therapists</SelectItem>
                  {therapists.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => void list.refetch()}
          refreshing={list.isFetching}
        >
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "Table", icon: "Table2" },
              { value: "grid", label: "Grid", icon: "LayoutGrid" },
            ]}
          />
          {canManage ? (
            <Button onClick={() => setRegisterOpen(true)}>
              <AtomIcon name="UserPlus" className="mr-2 h-4 w-4" />
              Register patient
            </Button>
          ) : null}
        </DataToolbar>
      </div>
      {view === "grid" ? (
        <>
          {list.isLoading ? (
            <CardGrid>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </CardGrid>
          ) : items.length === 0 ? (
            <div className="rounded-lg border bg-card">{emptyBlock}</div>
          ) : (
            <CardGrid minItemWidth={290}>
              {items.map((p: PatientListItem) => <PatientCard key={p.id} patient={p} onOpen={onOpen} />)}
            </CardGrid>
          )}
          <div className="mt-4">{paginationEl}</div>
        </>
      ) : (
        <DataTable
          rows={items}
          rowKey={(p: PatientListItem) => p.id}
          loading={list.isLoading}
          minWidth="min-w-220"
          onRowClick={(p) => onOpen(p.id)}
          onRowHover={(p) => { void queryClient.prefetchQuery({ ...patientQueryOptions(p.id), staleTime: 30_000 }); }}
          sort={{ field: sort, order }}
          onSort={toggleSort}
          empty={emptyBlock}
          pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); resetPage(); } }}
          columns={[
            {
              id: "name", header: "Name", sortField: "lastName",
              cell: (p) => {
                const name = fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName });
                return (
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={cn("text-xs font-semibold", avatarTone(p.patientCode))}>{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{p.patientCode}</p>
                    </div>
                  </div>
                );
              },
            },
            { id: "phone", header: "Phone", cell: (p) => <span className="text-sm">{p.phone}</span> },
            { id: "gender", header: "Gender", cell: (p) => <span className="text-sm">{p.gender ? labelize(p.gender) : "—"}</span> },
            { id: "age", header: "Age", align: "right", cell: (p) => <span className="text-sm">{calcAge(p.dateOfBirth)}</span> },
            { id: "registered", header: "Registered", sortField: "createdAt", cell: (p) => <span className="text-sm">{formatDate(p.createdAt)}</span> },
            { id: "payment", header: "Payment", cell: (p) => <Badge variant="outline" className={PAYMENT_TONES[p.paymentArrangement] || ""}>{labelize(p.paymentArrangement)}</Badge> },
            { id: "status", header: "Status", cell: (p) => <StatusBadge status={p.currentStatus} /> },
            { id: "therapist", header: "Therapist", cell: (p) => <span className="text-sm">{p.assignedTherapist?.name || "—"}</span> },
            {
              id: "actions", header: <span className="sr-only">Actions</span>, align: "right", className: "w-12",
              cell: (p) => <PatientRowActions patient={p} />,
            },
          ]}
        />
      )}

      <PatientRegistrationDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={handleRegistered}
      />
    </div>
  );
}
