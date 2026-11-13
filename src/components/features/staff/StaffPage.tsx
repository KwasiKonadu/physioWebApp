"use client";
// FEATURE: Staff — directory, filters, stats, detail dialog, add/edit form
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PERMS, STAFF_ROLES, EMPLOYMENT_STATUSES, labelize } from "@/lib/constants";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import StaffFormDialog, { type StaffFormTarget } from "./staff-form-dialog";
import StaffDetailDialog from "./staff-detail-dialog";

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
}

interface StaffListResponse {
  items: StaffListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; therapists: number; active: number; onLeave: number };
}

const ROLE_TONES: Record<string, string> = {
  ADMIN: "bg-navy-50 text-navy-800 border-navy-200",
  PHYSIOTHERAPIST: "bg-teal-50 text-teal-700 border-teal-200",
  RECEPTIONIST: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGEMENT: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function StaffPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.staffManage);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [detailId, setDetailId] = useState<string | null>(null);
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
          employmentStatus: string; professionalDesignation: string | null; specialization: string | null;
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
        professionalDesignation: detail.staff.professionalDesignation,
        specialization: detail.staff.specialization,
        qualifications: detail.staff.qualifications || [],
        availability: detail.staff.availability || [],
        remunerationMethod: detail.staff.remunerationMethod,
        remunerationRateCents: detail.staff.remunerationRateCents,
      });
      setDetailId(null);
      setFormOpen(true);
    } catch {
      setFormTarget(toFormTarget(row));
      setFormOpen(true);
    }
  };

  const items = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Staff profiles, employment status and therapist remuneration"
        icon="BadgeCheck"
        actions={
          canManage ? (
            <Button
              className="bg-navy-800 hover:bg-navy-900"
              onClick={() => { setFormTarget(null); setFormOpen(true); }}
            >
              <AtomIcon name="UserPlus" className="mr-1.5 h-4 w-4" /> Add staff
            </Button>
          ) : null
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total staff" value={summary?.total ?? 0} icon="Users" tone="navy" loading={!data} />
        <StatCard label="Therapists" value={summary?.therapists ?? 0} icon="Stethoscope" tone="teal" loading={!data} />
        <StatCard label="Active" value={summary?.active ?? 0} icon="UserCheck" tone="emerald" loading={!data} />
        <StatCard label="On leave" value={summary?.onLeave ?? 0} icon="CalendarOff" tone="amber" loading={!data} />
      </div>

      <SectionCard title="Staff directory" icon="Users" className="mt-5" noPadding>
        <div className="p-4 pb-2">
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
                  <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All roles</SelectItem>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{labelize(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {EMPLOYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="Users"
              title="No staff found"
              description={search || role !== "ALL" || status !== "ALL" ? "Try adjusting the filters." : "Add your first staff member to get started."}
              action={
                canManage ? (
                  <Button onClick={() => { setFormTarget(null); setFormOpen(true); }}>Add staff</Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Staff member</TableHead>
                    <TableHead className="hidden md:table-cell">Job title</TableHead>
                    <TableHead className="hidden md:table-cell">Role</TableHead>
                    <TableHead className="hidden lg:table-cell">Department</TableHead>
                    <TableHead className="hidden lg:table-cell">Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-center">Account</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {items.map((row) => (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => setDetailId(row.id)}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.staffCode}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-navy-100 text-xs text-navy-800">
                                {(row.firstName[0] + row.lastName[0]).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{row.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{row.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{row.jobTitle}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className={ROLE_TONES[row.staffRole]}>
                            {labelize(row.staffRole)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{row.department || "—"}</TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{row.phone || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell"><StatusBadge status={row.employmentStatus} /></TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${row.hasAccount ? (row.accountActive ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600") : "bg-slate-100 text-slate-400"}`}>
                                <AtomIcon name={row.hasAccount ? "Link2" : "Link2Off"} className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {!row.hasAccount ? "No login account" : row.accountActive ? "Account linked (active)" : "Account linked (deactivated)"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailId(row.id)} aria-label="View">
                              <AtomIcon name="Eye" className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openEdit(row)} aria-label="Edit">
                                <AtomIcon name="Pencil" className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TooltipProvider>
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={data?.total || 0}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </SectionCard>

      <StaffDetailDialog
        staffId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onEdit={async () => {
          const row = items.find((r) => r.id === detailId);
          if (row) await openEdit(row);
        }}
      />

      <StaffFormDialog
        open={formOpen}
        target={formTarget}
        onClose={() => { setFormOpen(false); setFormTarget(null); }}
      />
    </div>
  );
}
