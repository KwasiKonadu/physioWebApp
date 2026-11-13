"use client";
// ============ Patients directory: searchable/filterable table + pagination ============
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/molecules/page-header";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { calcAge, formatDate, fullName, initials } from "@/lib/format";
import { PERMS, PATIENT_STATUSES, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { useDebounced, usePatientList, useTherapists, type PatientListItem } from "./hooks";
import PatientRegistrationDialog from "./PatientRegistrationDialog";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-teal-50 text-teal-700 border-teal-200",
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

  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [arrangement, setArrangement] = useState("all");
  const [therapistId, setTherapistId] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [registerOpen, setRegisterOpen] = useState(false);

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

  const renderSortHead = (field: string, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => toggleSort(field)}
      >
        {label}
        {sort === field ? (
          <AtomIcon name={order === "asc" ? "ArrowUp" : "ArrowDown"} className="h-3 w-3" />
        ) : null}
      </button>
    </TableHead>
  );

  const handleRegistered = (patientId: string) => {
    toast.success("Patient registered", { description: "The profile is ready." });
    void queryClient.invalidateQueries({ queryKey: ["patients"] });
    setRegisterOpen(false);
    onOpen(patientId);
  };

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Register new patients, manage records and open treatment profiles"
        icon="Users"
        actions={
          canManage ? (
            <Button onClick={() => setRegisterOpen(true)}>
              <AtomIcon name="UserPlus" className="mr-2 h-4 w-4" />
              Register patient
            </Button>
          ) : null
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-4">
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
                  <SelectTrigger className="h-9 w-[150px]">
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
                  <SelectTrigger className="h-9 w-[150px]">
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
                  <SelectTrigger className="h-9 w-[170px]">
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
          />
        </div>

        <div className="max-h-[600px] overflow-auto custom-scrollbar">
          <Table className="min-w-[880px]">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                {renderSortHead("patientCode", "Patient ID")}
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead className="text-right">Age</TableHead>
                {renderSortHead("createdAt", "Registered")}
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Therapist</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.map((p: PatientListItem) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => onOpen(p.id)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.patientCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8 rounded-lg">
                            <AvatarFallback className="rounded-lg bg-navy-50 text-xs font-semibold text-navy-800">
                              {initials(fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName }))}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName })}</p>
                            {p.activeEpisodeTitle ? (
                              <p className="truncate text-xs text-muted-foreground">{p.activeEpisodeTitle}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{p.phone}</TableCell>
                      <TableCell className="text-sm">{p.gender ? labelize(p.gender) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{calcAge(p.dateOfBirth)}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PAYMENT_TONES[p.paymentArrangement] || ""}>
                          {labelize(p.paymentArrangement)}
                        </Badge>
                      </TableCell>
                      <TableCell><StatusBadge status={p.currentStatus} /></TableCell>
                      <TableCell className="text-sm">{p.assignedTherapist?.name || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(p.id);
                          }}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>

          {!list.isLoading && items.length === 0 ? (
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
          ) : null}
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            resetPage();
          }}
        />
      </div>

      <PatientRegistrationDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={handleRegistered}
      />
    </div>
  );
}
