"use client";
// SETTINGS: Roles tab — permission matrix editor per role (with confirm dialog)
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
    label: "Staff",
    perms: [{ key: "staff.view", label: "View staff" }, { key: "staff.manage", label: "Manage staff" }],
  },
  { label: "Reports", perms: [{ key: "reports.view", label: "View reports" }] },
  { label: "Settings", perms: [{ key: "settings.manage", label: "Manage settings" }] },
];

export default function SettingsRolesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: RoleRow[] }>("/api/roles"),
  });

  // local draft state per role: roleId → permissions array
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [confirmRole, setConfirmRole] = useState<RoleRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (data?.items) {
      const map: Record<string, string[]> = {};
      for (const r of data.items) map[r.id] = r.permissions;
      setDrafts(map);
    }
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data?.items) return false;
    return data.items.some((r) => {
      const d = drafts[r.id];
      if (!d) return false;
      return d.length !== r.permissions.length || d.some((p) => !r.permissions.includes(p));
    });
  }, [data, drafts]);

  const toggle = (roleId: string, perm: string) => {
    setDrafts((prev) => {
      const cur = prev[roleId] || [];
      return { ...prev, [roleId]: cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm] };
    });
  };

  const save = async (role: RoleRow) => {
    setSavingId(role.id);
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "PATCH", json: { permissions: drafts[role.id] || [] } });
      toast.success(`Permissions saved for "${role.name}"`);
      await qc.invalidateQueries({ queryKey: ["roles"] });
      setConfirmRole(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    );
  }

  const roles = data?.items || [];
  if (roles.length === 0) {
    return <EmptyState icon="ShieldCheck" title="No roles configured" />;
  }

  return (
    <div className={cn("space-y-5", isDirty && "ring-0")}>
      {roles.map((role) => {
        const draft = drafts[role.id] || role.permissions;
        const dirty = draft.length !== role.permissions.length || draft.some((p) => !role.permissions.includes(p));
        return (
          <SectionCard
            key={role.id}
            title={role.name}
            icon="ShieldCheck"
            description={role.description || undefined}
            actions={
              <div className="flex items-center gap-2">
                {role.system && (
                  <Badge variant="outline" className="border-navy-200 bg-navy-50 text-navy-700">System</Badge>
                )}
                <Badge variant="outline" className="bg-muted/60 text-muted-foreground">{role.userCount} users</Badge>
                <Badge variant="outline" className="bg-teal-50 text-teal-700">{draft.length} permissions</Badge>
                {dirty && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Unsaved</Badge>
                )}
                <Button
                  size="sm"
                  variant={dirty ? "default" : "outline"}
                  className={dirty ? "bg-navy-800 hover:bg-navy-900" : ""}
                  onClick={() => setConfirmRole(role)}
                  disabled={!dirty}
                >
                  Save
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PERM_GROUPS.map((g) => (
                <div key={g.label} className="rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700">{g.label}</p>
                  <div className="space-y-2">
                    {g.perms.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.includes(p.key)}
                          onCheckedChange={() => toggle(role.id, p.key)}
                        />
                        <span className={draft.includes(p.key) ? "font-medium" : "text-muted-foreground"}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })}

      <AlertDialog open={!!confirmRole} onOpenChange={(v) => (!v ? setConfirmRole(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save permissions for “{confirmRole?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRole?.system
                ? "This is a system role — users with this role gain/lose access immediately after saving. The change is recorded in the audit log."
                : "Users with this role gain or lose access immediately. The change is recorded in the audit log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmRole) void save(confirmRole);
              }}
              disabled={savingId !== null}
            >
              {savingId ? "Saving…" : "Save permissions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
