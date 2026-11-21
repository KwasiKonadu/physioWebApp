"use client";
// SETTINGS: Manage roles — a pop-up to pick the role, then a side panel to edit its permissions as pills (with confirm dialog)
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/molecules/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AtomIcon } from "@/components/atoms/icon";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  system: boolean;
  userCount: number;
  staffCount?: number;
}

// Permission groups for the checkbox grid
const PERM_GROUPS: { label: string; perms: { key: string; label: string }[] }[] = [
  { label: "Dashboard", perms: [{ key: "dashboard.view", label: "View dashboard" }] },
  {
    label: "Patients",
    perms: [{ key: "patients.view", label: "View patients" }, { key: "patients.manage", label: "Manage patients" }],
  },
  {
    label: "Appointments",
    perms: [{ key: "appointments.view", label: "View appointments" }, { key: "appointments.manage", label: "Manage appointments" }],
  },
  {
    label: "Clinical",
    perms: [{ key: "clinical.view", label: "View clinical records" }, { key: "clinical.manage", label: "Manage clinical records" }],
  },
  {
    label: "Billing",
    perms: [
      { key: "billing.view", label: "View billing" },
      { key: "billing.manage", label: "Manage billing" },
      { key: "billing.refund", label: "Issue refunds" },
      { key: "packages.manage", label: "Manage packages" },
      { key: "insurance.manage", label: "Manage insurance" },
    ],
  },
  {
    label: "Inventory",
    perms: [{ key: "inventory.view", label: "View inventory" }, { key: "inventory.manage", label: "Manage stock & record sales" }],
  },
  {
    label: "Staff",
    perms: [{ key: "staff.view", label: "View staff" }, { key: "staff.manage", label: "Manage staff" }, { key: "leave.apply", label: "Apply for own leave" }],
  },
  { label: "Reports", perms: [{ key: "reports.view", label: "View reports" }] },
  { label: "Settings", perms: [{ key: "settings.manage", label: "Manage settings" }] },
];

export default function ManageRolesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: RoleRow[] }>("/api/roles"),
    enabled: open,
  });
  const roles = data?.items || [];

  // step 1: pop-up to pick the role; step 2: side panel to edit it
  const [pickerOpen, setPickerOpen] = useState(false);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // creating a new custom role (name + permissions) in the same side panel
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  // the picker follows the parent's `open`; selecting a role hands over to the panel
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPickerOpen(open);
    if (open) { setRoleId(null); setCreating(false); }
  }

  const role = roles.find((r) => r.id === roleId) ?? null;
  const dirty = creating ? newName.trim().length >= 2 : !!role && (draft.length !== role.permissions.length || draft.some((p) => !role.permissions.includes(p)));

  const pick = (r: RoleRow) => {
    setRoleId(r.id);
    setDraft(r.permissions);
    setPickerOpen(false);
  };

  const startCreate = () => {
    setCreating(true);
    setNewName("");
    setNewDesc("");
    setDraft(["dashboard.view"]);
    setPickerOpen(false);
  };

  const toggle = (perm: string) =>
    setDraft((cur) => (cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm]));

  const closePanel = () => {
    setRoleId(null);
    setCreating(false);
    setDeleteOpen(false);
    setConfirmOpen(false);
    onClose();
  };

  const remove = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
      toast.success(`Role "${role.name}" deleted`);
      await qc.invalidateQueries({ queryKey: ["roles"] });
      closePanel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (creating) {
      setSaving(true);
      try {
        await apiFetch("/api/roles", { method: "POST", json: { name: newName.trim(), description: newDesc.trim(), permissions: draft } });
        toast.success(`Role "${newName.trim()}" created`);
        await qc.invalidateQueries({ queryKey: ["roles"] });
        closePanel();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create role");
        setConfirmOpen(false);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!role) return;
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "PATCH", json: { permissions: draft } });
      toast.success(`Permissions saved for "${role.name}"`);
      await qc.invalidateQueries({ queryKey: ["roles"] });
      closePanel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* step 1 — choose the role */}
      <Dialog open={pickerOpen} onOpenChange={(v) => { if (!v) { setPickerOpen(false); if (!roleId) onClose(); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto custom-scrollbar sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage roles</DialogTitle>
            <DialogDescription>Choose the role whose permissions you want to change.</DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : roles.length === 0 ? (
            <EmptyState icon="ShieldCheck" title="No roles configured" />
          ) : (
            <ul className="space-y-2">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-navy-600/60 hover:bg-navy-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
                      <AtomIcon name="ShieldCheck" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {r.name}
                        {r.system ? <Badge variant="outline" className="border-navy-200 bg-navy-50 text-navy-700">System</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.userCount} user{r.userCount === 1 ? "" : "s"} · {r.permissions.length} permissions
                      </span>
                    </span>
                    <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={startCreate}>
              <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> Create role
            </Button>
            <Button variant="outline" onClick={() => { setPickerOpen(false); onClose(); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* step 2 — edit that role in the side panel */}
      <SidePanel
        open={!!role || creating}
        onOpenChange={(v) => (!v ? closePanel() : null)}
        size="lg"
        title={creating ? "Create role" : role ? `Edit role — ${role.name}` : "Edit role"}
        description={creating ? "Name the role and choose what it can do. It will appear in the staff role list." : role?.description || "Switch permissions on or off. Changes apply to everyone with this role once saved."}
        headerExtra={role?.system && !creating ? <Badge variant="outline" className="border-navy-200 bg-navy-50 text-navy-700">System</Badge> : null}
      >
        <SidePanelBody className="space-y-5">
          {creating ? (
            <div className="grid grid-cols-1 gap-3 *:min-w-0">
              <div className="space-y-1.5">
                <Label htmlFor="new-role-name">Role name</Label>
                <Input id="new-role-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Receptionist" maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-role-desc">Description (optional)</Label>
                <Input id="new-role-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What this role is for" maxLength={200} />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-muted/60 text-muted-foreground">{creating ? 0 : role?.userCount ?? 0} users</Badge>
            <Badge variant="outline" className="bg-navy-50 text-navy-800">{draft.length} permissions on</Badge>
            {dirty ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Unsaved changes</Badge> : null}
          </div>
          {PERM_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.perms.map((p) => {
                  const on = draft.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p.key)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600",
                        on
                          ? "border-navy-800 bg-navy-800 text-white shadow-sm hover:bg-navy-900"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </SidePanelBody>
        <SidePanelFooter className="justify-end">
          {role && !creating && !role.system ? (
            <Button
              variant="outline"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={saving || role.userCount > 0 || (role.staffCount ?? 0) > 0}
              title={role.userCount > 0 || (role.staffCount ?? 0) > 0 ? "Reassign its users and staff before deleting" : undefined}
              onClick={() => setDeleteOpen(true)}
            >
              Delete role
            </Button>
          ) : null}
          <Button variant="outline" onClick={closePanel}>Cancel</Button>
          <Button onClick={() => (creating ? void save() : setConfirmOpen(true))} disabled={!dirty || saving}>{creating ? (saving ? "Creating…" : "Create role") : "Save permissions"}</Button>
        </SidePanelFooter>
      </SidePanel>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{role?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This role has no users or staff assigned. It will be removed from the staff role list. This is recorded in the audit log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void remove(); }} disabled={saving}>{saving ? "Deleting…" : "Delete role"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen && !creating} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save permissions for “{role?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {role?.system
                ? "This is a system role — users with this role gain/lose access immediately after saving. The change is recorded in the audit log."
                : "Users with this role gain or lose access immediately. The change is recorded in the audit log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save permissions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
