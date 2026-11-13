"use client";
// SETTINGS: Users & Roles tab — user accounts table, add/edit dialogs
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { SectionCard } from "@/components/molecules/section-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
interface StaffRow { id: string; firstName: string; lastName: string; staffCode: string; jobTitle: string }

interface Props {
  highlightEmail: string | null;
}

export default function SettingsUsersTab({ highlightEmail }: Props) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["users", "list", search],
    queryFn: () => apiFetch<{ items: UserRow[]; total: number; roles: { id: string; name: string; system: boolean; description: string | null }[] }>(
      `/api/users?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ""}`
    ),
  });
  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<RolesData>("/api/roles"),
  });
  const { data: staffData } = useQuery({
    queryKey: ["staff", "for-users"],
    queryFn: () => apiFetch<{ items: StaffRow[] }>("/api/staff?pageSize=200"),
    enabled: addOpen || !!editTarget,
  });

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
    <div className="space-y-6">
      <SectionCard
        title="User accounts"
        icon="Users"
        description="Login accounts and role assignments. Deactivated users cannot sign in."
        noPadding
        actions={
          <Button size="sm" className="bg-navy-800 hover:bg-navy-900" onClick={() => setAddOpen(true)}>
            <AtomIcon name="UserPlus" className="mr-1.5 h-3.5 w-3.5" /> Add user
          </Button>
        }
      >
        <div className="p-4 pb-2">
          <DataToolbar
            search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search name or email…" }}
          />
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="p-4"><EmptyState icon="Users" title="No users found" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Staff link</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.id}
                    className={cn(
                      highlightEmail && u.email === highlightEmail && "bg-teal-50/60 ring-1 ring-inset ring-teal-300"
                    )}
                  >
                    <TableCell>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {u.name}
                        {highlightEmail && u.email === highlightEmail && (
                          <Badge variant="outline" className="border-teal-300 bg-teal-100 text-teal-800">You</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground sm:hidden">{u.email}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-navy-50 text-navy-800">{u.roleName}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {u.staffName || <span className="text-xs">— not linked —</span>}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={u.active}
                        onCheckedChange={(v) => setInactive.mutate({ id: u.id, active: v })}
                        disabled={setInactive.isPending}
                        aria-label={`Toggle ${u.email}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(u)} aria-label="Edit user">
                        <AtomIcon name="Pencil" className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

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
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a login account and assign a role.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@gmrsphysio.com.gh" />
          </Labeled>
          <Labeled label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Boateng" />
          </Labeled>
          <Labeled label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
          </Labeled>
          <Labeled label="Role">
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Link to staff profile (optional)">
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— None —</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.staffCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving} className="bg-navy-800 hover:bg-navy-900">
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

  useEffect(() => {
    if (target) {
      setName(target.name);
      setRoleId(target.roleId);
      setPassword("");
    }
  }, [target]);

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
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 8 chars)" />
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
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
