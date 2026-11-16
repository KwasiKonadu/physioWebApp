"use client";
// Settings: clinic branches card with add / edit panel.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import type { BranchRow } from "./settings-types";
import { Field } from "./SettingsShared";

export function BranchesCard({ branches }: { branches: BranchRow[] }) {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const openPanel = (b: BranchRow | null) => {
    setEditing(b);
    setName(b?.name || "");
    setAddress(b?.address || "");
    setPhone(b?.phone || "");
    setPanelOpen(true);
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["settings"] });
    await qc.invalidateQueries({ queryKey: ["branches"] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const json = { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null };
      if (editing) await apiFetch(`/api/branches/${editing.id}`, { method: "PATCH", json });
      else await apiFetch("/api/branches", { method: "POST", json });
      toast.success(editing ? "Branch updated" : "Branch added");
      await refresh();
      setPanelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (b: BranchRow, active: boolean) => {
    try {
      await apiFetch(`/api/branches/${b.id}`, { method: "PATCH", json: { active } });
      toast.success(active ? `${b.name} activated` : `${b.name} deactivated`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update branch");
    }
  };

  return (
    <>
      <SectionCard
        title="Branches"
        icon="MapPin"
        description="Locations the clinic operates from. Branches are switched off, never deleted, so staff and records keep their history."
        actions={
          <Button size="sm" onClick={() => openPanel(null)}>
            <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add branch
          </Button>
        }
      >
        {branches.length === 0 ? (
          <EmptyState icon="MapPin" title="No branches registered" description="Add the first branch to assign staff to a location." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <div key={b.id} className={`rounded-lg border p-4 ${b.active ? "" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm font-semibold ${b.active ? "" : "text-muted-foreground"}`}>{b.name}</p>
                  <StatusBadge status={b.active ? "ACTIVE" : "EXPIRED"} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{b.address || "No address"}</p>
                <p className="text-xs text-muted-foreground">{b.phone || "No phone"}</p>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={b.active} onCheckedChange={(v) => void setActive(b, v)} aria-label={`Toggle ${b.name}`} />
                    {b.active ? "Active" : "Inactive"}
                  </label>
                  <Button size="sm" variant="outline" onClick={() => openPanel(b)}>
                    <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        size="md"
        title={editing ? `Edit branch — ${editing.name}` : "Add branch"}
        description="Name, address and phone of the location."
      >
        <SidePanelBody className="space-y-4">
          <Field label="Branch name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. East Legon" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 …" />
          </Field>
        </SidePanelBody>
        <SidePanelFooter className="justify-end">
          <Button variant="outline" onClick={() => setPanelOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add branch"}
          </Button>
        </SidePanelFooter>
      </SidePanel>
    </>
  );
}

// ---------------- Clinic tab ----------------
