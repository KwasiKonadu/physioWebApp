"use client";
// Settings: clinic information tab.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsData } from "./settings-types";
import { Field } from "./SettingsShared";
import { BranchesCard } from "./BranchesCard";
import { ConfigCards } from "./ConfigCards";
import { BillingSetupCard } from "./BillingSetupCard";

export function ClinicTab({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.clinic.name);
  const [address, setAddress] = useState(data.clinic.address || "");
  const [phone, setPhone] = useState(data.clinic.phone || "");
  const [email, setEmail] = useState(data.clinic.email || "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setName(data.clinic.name);
    setAddress(data.clinic.address || "");
    setPhone(data.clinic.phone || "");
    setEmail(data.clinic.email || "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        json: { clinic: { name, address, phone, email } },
      });
      toast.success("Clinic profile updated");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update clinic");
    } finally {
      setSaving(false);
    }
  };

  const c = data.clinic;
  return (
    <>
      <SectionCard
        title="Clinic information"
        icon="Building2"
        description="Shown across the app and on exported documents"
        actions={
          editing ? null : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )
        }
      >
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 *:min-w-0">
              <Field label="Clinic name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void save()} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        ) : (
          <DetailGrid cols={2}>
            <DetailRow label="Clinic name" value={c.name} />
            <DetailRow label="Clinic code" value={<span className="font-mono text-xs">{c.code}</span>} />
            <DetailRow label="Email" value={c.email} />
            <DetailRow label="Phone" value={c.phone} />
            <DetailRow label="Address" value={c.address} />
            <DetailRow label="Currency" value={c.currency} />
            <DetailRow label="Timezone" value={c.timezone} />
          </DetailGrid>
        )}
      </SectionCard>

      <ConfigCards data={data} />

      <BranchesCard branches={data.branches} />

      <BillingSetupCard />
    </>
  );
}

// ---------------- Configuration tab ----------------
