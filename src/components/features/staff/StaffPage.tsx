"use client";
// FEATURE: Staff — directory, filters, stats, detail dialog, add/edit form
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PERMS, STAFF_ROLES, EMPLOYMENT_STATUSES, labelize } from "@/lib/constants";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { CardGrid } from "@/components/molecules/card-grid";
import { ViewToggle } from "@/components/molecules/view-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { StaffCard, STAFF_ROLE_TONES } from "./StaffCard";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import StaffFormDialog, { type StaffFormTarget } from "./staff-form-dialog";

export interface StaffListItem {
  id: string;
  staffCode: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string;
  department: string | null;
  staffRole: string;
  employmentStatus: string;
  employmentDate: string | null;
  isTherapist: boolean;
  remunerationMethod: string;
  remunerationRateCents: number | null;
  branchName: string | null;
  hasAccount: boolean;
  accountActive: boolean;
  branchId: string | null;
}

interface StaffListResponse {
  items: StaffListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; therapists: number; active: number; onLeave: number };
}

export default function StaffPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.staffManage);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [view, setView] = usePersistentState<"table" | "grid">("gmrs-staff-view", "table", ["table", "grid"]);
  const router = useRouter();
  const setDetailId = (id: string | null) => { if (id) router.push(`/staff/${id}`); };
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<StaffFormTarget | null>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (role !== "ALL") params.set("role", role);
  if (status !== "ALL") params.set("status", status);
  if (search) params.set("search", search);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["staff", "list", role, status, search, page, pageSize],
    queryFn: () => apiFetch<StaffListResponse>(`/api/staff?${params.toString()}`),
  });

  const summary = data?.summary;

  // Build form target from list row when editing from table
  const toFormTarget = (row: StaffListItem): StaffFormTarget => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    department: row.department,
    staffRole: row.staffRole,
    employmentDate: row.employmentDate,
    employmentStatus: row.employmentStatus,
    branchId: row.branchId,
    professionalDesignation: null,
    specialization: null,
    qualifications: [],
    availability: [],
    remunerationMethod: row.remunerationMethod,
    remunerationRateCents: row.remunerationRateCents,
  });

  const openEdit = async (row: StaffListItem) => {
    // pull full profile (includes qualifications + availability JSON)
    try {
      const detail = await apiFetch<{
        staff: {
          id: string; firstName: string; lastName: string; email: string | null; phone: string | null;
          jobTitle: string; department: string | null; staffRole: string; employmentDate: string | null;
          employmentStatus: string; branchId: string | null; professionalDesignation: string | null; specialization: string | null;
          qualifications: string[]; availability: { day: string; start?: string; end?: string }[];
          remunerationMethod: string; remunerationRateCents: number | null;
        };
      }>(`/api/staff/${row.id}`);
      setFormTarget({
        id: detail.staff.id,
        firstName: detail.staff.firstName,
        lastName: detail.staff.lastName,
        email: detail.staff.email,
        phone: detail.staff.phone,
        jobTitle: detail.staff.jobTitle,
        department: detail.staff.department,
        staffRole: detail.staff.staffRole,
        employmentDate: detail.staff.employmentDate,
        employmentStatus: detail.staff.employmentStatus,
        branchId: detail.staff.branchId,
        professionalDesignation: detail.staff.professionalDesignation,
        specialization: detail.staff.specialization,
        qualifications: detail.staff.qualifications || [],
        availability: detail.staff.availability || [],
        remunerationMethod: detail.staff.remunerationMethod,
        remunerationRateCents: detail.staff.remunerationRateCents,
      });
      setFormOpen(true);
    } catch {
      setFormTarget(toFormTarget(row));
      setFormOpen(true);
    }
  };

  const items = data?.items || [];

  const emptyBlock = (
    <div className="p-4">
      <EmptyState
        icon="Users"
        title="No staff found"
        description={search || role !== "ALL" || status !== "ALL" ? "No staff match the current filters. Try adjusting your search." : "Add your first staff member to get started."}
        action={
          canManage && !search && role === "ALL" && status === "ALL" ? (
            <Button onClick={() => { setFormTarget(null); setFormOpen(true); }}>
              <AtomIcon name="UserPlus" className="mr-2 h-4 w-4" />
              Add staff
            </Button>
          ) : undefined
        }
      />
    </div>
  );

  const paginationEl = (
    <TablePagination
      page={page}
      pageSize={pageSize}
      total={data?.total || 0}
      onPageChange={setPage}
      onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
    />
  );

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Staff profiles, employment status and therapist remuneration"
        icon="BadgeCheck"
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total staff" value={summary?.total ?? 0} icon="Users" tone="navy" loading={!data} />
        <StatCard label="Therapists" value={summary?.therapists ?? 0} icon="Stethoscope" tone="teal" loading={!data} />
        <StatCard label="Active" value={summary?.active ?? 0} icon="UserCheck" tone="emerald" loading={!data} />
        <StatCard label="On leave" value={summary?.onLeave ?? 0} icon="CalendarOff" tone="amber" loading={!data} />
      </div>

      <div className="mb-3">
        <DataToolbar
          search={{
            value: searchInput,
            onChange: (v) => setSearchInput(v),
            placeholder: "Search name, code, email, phone…",
          }}
          onRefresh={() => {
            void refetch();
          }}
          refreshing={isFetching}
          filters={
            <>
              <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{labelize(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {EMPLOYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
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
            <Button onClick={() => { setFormTarget(null); setFormOpen(true); }}>
              <AtomIcon name="UserPlus" className="mr-1.5 h-4 w-4" /> Add staff
            </Button>
          ) : null}
        </DataToolbar>
      </div>
      {view === "grid" ? (
        <>
          {isLoading ? (
            <CardGrid>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </CardGrid>
          ) : items.length === 0 ? (
            <div className="rounded-xl border bg-card shadow-sm">{emptyBlock}</div>
          ) : (
            <CardGrid minItemWidth={290}>
              {items.map((row) => <StaffCard key={row.id} staff={row} onOpen={setDetailId} />)}
            </CardGrid>
          )}
          <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{paginationEl}</div>
        </>
      ) : (
        <TooltipProvider>
          <DataTable
            rows={items}
            rowKey={(r: StaffListItem) => r.id}
            loading={isLoading}
            minWidth="min-w-220"
            onRowClick={(r) => setDetailId(r.id)}
            empty={emptyBlock}
            pagination={{ page, pageSize, total: data?.total || 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
            columns={[
              { id: "code", header: "Staff ID", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.staffCode}</span> },
              {
                id: "name", header: "Name",
                cell: (r) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-navy-50 text-xs font-semibold text-navy-800">
                        {(r.firstName[0] + r.lastName[0]).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.email || "—"}</p>
                    </div>
                  </div>
                ),
              },
              { id: "job", header: "Job title", cell: (r) => <span className="text-sm">{r.jobTitle}</span> },
              { id: "role", header: "Role", cell: (r) => <Badge variant="outline" className={STAFF_ROLE_TONES[r.staffRole]}>{labelize(r.staffRole)}</Badge> },
              { id: "dept", header: "Department", cell: (r) => <span className="text-sm text-muted-foreground">{r.department || "—"}</span> },
              { id: "phone", header: "Phone", cell: (r) => <span className="text-sm text-muted-foreground">{r.phone || "—"}</span> },
              { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.employmentStatus} /> },
              {
                id: "account", header: "Account", align: "center",
                cell: (r) => (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${r.hasAccount ? (r.accountActive ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600") : "bg-slate-100 text-slate-400"}`}>
                        <AtomIcon name={r.hasAccount ? "Link2" : "Link2Off"} className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!r.hasAccount ? "No login account" : r.accountActive ? "Account linked (active)" : "Account linked (deactivated)"}
                    </TooltipContent>
                  </Tooltip>
                ),
              },
              {
                id: "actions", header: "Actions", align: "right",
                cell: (r) => (
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>
                    {canManage && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openEdit(r)} aria-label="Edit">
                        <AtomIcon name="Pencil" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </TooltipProvider>
      )}

      <StaffFormDialog
        open={formOpen}
        target={formTarget}
        onClose={() => { setFormOpen(false); setFormTarget(null); }}
      />
    </div>
  );
}
