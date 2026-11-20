"use client";
// SETTINGS: Users & Roles tab — user accounts table, add/edit dialogs
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useAllStaff } from "@/components/features/staff/use-staff-options";
import { formatDate } from "@/lib/format";
import ManageRolesDialog from "./settings-roles-tab";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/molecules/field";
import { PasswordInput } from "@/components/molecules/password-input";

interface UserRow {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  staffId: string | null;
  staffName: string | null;
  active: boolean;
  createdAt: string;
}
interface RolesData {
  items: { id: string; name: string; description: string | null; permissions: string[]; system: boolean; userCount: number }[];
  allPerms: string[];
}
interface StaffRow {
  id: string; firstName: string; lastName: string; staffCode: string; jobTitle: string;
  name?: string; email?: string | null; staffRole?: string; hasAccount?: boolean;
}

// system role created for each staff role (see ROLE_NAMES)
const STAFF_ROLE_TO_ROLE_NAME: Record<string, string> = {
  ADMIN: "Clinic Administrator",
  RECEPTIONIST: "Receptionist",
  PHYSIOTHERAPIST: "Physiotherapist",
  MANAGEMENT: "Management",
};

interface Props {
  highlightEmail: string | null;
}

export default function SettingsUsersTab({ highlightEmail }: Props) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["users", "list", search],
    queryFn: () => apiFetch<{ items: UserRow[]; total: number; roles: { id: string; name: string; system: boolean; description: string | null }[] }>(
      `/api/users?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ""}`
    ),
  });
  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<RolesData>("/api/roles"),
  });
  const { data: staffData } = useAllStaff(addOpen || !!editTarget);

  const setInactive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch(`/api/users/${id}`, { method: "PATCH", json: { active } }),
    onSuccess: (_d, vars) => {
      toast.success(vars.active ? "User activated" : "User deactivated");
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = data?.items || [];

  return (
    <div className="space-y-4">
      <DataToolbar
        search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search name or email…" }}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ["users"] })}
        refreshing={isFetching}
      >
        <Button variant="outline" onClick={() => setRolesOpen(true)}>
          <AtomIcon name="ShieldCheck" className="mr-2 h-4 w-4" /> Manage roles
        </Button>
        <Button onClick={() => setAddOpen(true)}>
          <AtomIcon name="UserPlus" className="mr-2 h-4 w-4" /> Add user
        </Button>
      </DataToolbar>

      <DataTable
        rows={users}
        rowKey={(u: UserRow) => u.id}
        loading={isLoading}
        loadingRows={4}
        minWidth="min-w-160"
        rowClassName={(u) => (highlightEmail && u.email === highlightEmail ? "bg-navy-50/60 ring-1 ring-inset ring-navy-300" : undefined)}
        empty={<EmptyState icon="Users" title="No users found" />}
        columns={[
          {
            id: "user", header: "User",
            cell: (u) => (
              <>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {u.name}
                  {highlightEmail && u.email === highlightEmail && (
                    <Badge variant="outline" className="border-navy-300 bg-navy-100 text-navy-800">You</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground sm:hidden">{u.email}</p>
              </>
            ),
          },
          { id: "email", header: "Email", hideBelow: "sm", cell: (u) => <span className="text-sm text-muted-foreground">{u.email}</span> },
          { id: "role", header: "Role", cell: (u) => <Badge variant="outline" className="bg-navy-50 text-navy-800">{u.roleName}</Badge> },
          { id: "staff", header: "Staff link", hideBelow: "md", cell: (u) => <span className="text-sm text-muted-foreground">{u.staffName || <span className="text-xs">— not linked —</span>}</span> },
          { id: "created", header: "Created", hideBelow: "lg", cell: (u) => <span className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</span> },
          {
            id: "active", header: "Active", align: "center",
            cell: (u) => (
              <Switch
                checked={u.active}
                onCheckedChange={(v) => setInactive.mutate({ id: u.id, active: v })}
                disabled={setInactive.isPending}
                aria-label={`Toggle ${u.email}`}
              />
            ),
          },
          {
            id: "actions", header: "Actions", align: "right",
            cell: (u) => (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(u)} aria-label="Edit user">
                <AtomIcon name="Pencil" className="h-4 w-4" />
              </Button>
            ),
          },
        ]}
      />

      <ManageRolesDialog open={rolesOpen} onClose={() => setRolesOpen(false)} />

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} roles={rolesData?.items || []} staff={staffData?.items || []} />
      <EditUserDialog target={editTarget} onClose={() => setEditTarget(null)} roles={rolesData?.items || []} />
    </div>
  );
}

function AddUserDialog({ open, onClose, roles, staff }: {
  open: boolean;
  onClose: () => void;
  roles: { id: string; name: string }[];
  staff: StaffRow[];
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [staffId, setStaffId] = useState("NONE");
  const [saving, setSaving] = useState(false);

  const reset = () => { setEmail(""); setName(""); setPassword(""); setRoleId(""); setStaffId("NONE"); };

  // staff who don't have a login yet
  const available = staff.filter((s) => !s.hasAccount);

  // picking a staff member fills in the rest from their profile
  const pickStaff = (id: string) => {
    setStaffId(id);
    if (id === "NONE") return;
    const st = staff.find((s) => s.id === id);
    if (!st) return;
    setName(st.name || `${st.firstName} ${st.lastName}`);
    setEmail(st.email || "");
    const roleName = st.staffRole ? STAFF_ROLE_TO_ROLE_NAME[st.staffRole] : undefined;
    const match = roles.find((r) => r.name === roleName);
    if (match) setRoleId(match.id);
  };

  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!email.includes("@")) { toast.error("Enter a valid email"); return; }
    if (name.trim().length < 2) { toast.error("Enter the user's name"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (!roleId) { toast.error("Choose a role"); return; }
    setSaving(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        json: { email, name: name.trim(), password, roleId, staffId: staffId === "NONE" ? null : staffId },
      });
      toast.success("User created");
      reset();
      await qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? close() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a login account and assign a role.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Link to staff profile">
            <Select value={staffId} onValueChange={pickStaff}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— None —</SelectItem>
                {available.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.staffCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {staffId === "NONE"
                ? "Pick a staff member to fill in the name, email and role, or leave as None to enter them yourself."
                : "Name, email and role were filled from the staff profile — you can still change them."}
            </p>
          </Labeled>
          <Labeled label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@gmrsphysio.com.gh" />
          </Labeled>
          <Labeled label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Boateng" />
          </Labeled>
          <Labeled label="Password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
          </Labeled>
          <Labeled label="Role">
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Labeled>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ target, onClose, roles }: {
  target: UserRow | null;
  onClose: () => void;
  roles: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) {
      setName(target.name);
      setRoleId(target.roleId);
      setPassword("");
    }
  }

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (name.trim() && name.trim() !== target.name) payload.name = name.trim();
      if (roleId && roleId !== target.roleId) payload.roleId = roleId;
      if (password) {
        if (password.length < 8) { toast.error("Password must be at least 8 characters"); setSaving(false); return; }
        payload.password = password;
      }
      if (Object.keys(payload).length === 0) { toast.info("No changes"); onClose(); return; }
      await apiFetch(`/api/users/${target.id}`, { method: "PATCH", json: payload });
      toast.success("User updated");
      await qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{target?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Labeled>
          <Labeled label="Role">
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Reset password (leave blank to keep current)">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 8 chars)" />
          </Labeled>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving} className="bg-navy-800 hover:bg-navy-900">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field label={<>{label}</>}>
      {children}
    </Field>
  );
}
