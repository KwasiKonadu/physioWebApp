"use client";
// Settings: editable card shell, time formatter and labelled field.

import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// A settings card that shows a preview with an Edit button; Edit swaps in the fields with Cancel / Save.
export function EditableCard({
  title, icon, description, preview, form, canSave, onStart, onSave,
}: {
  title: string; icon: string; description?: string;
  preview: React.ReactNode; form: React.ReactNode;
  canSave: boolean; onStart: () => void; onSave: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <SectionCard
      title={title}
      icon={icon}
      description={description}
      actions={
        editing ? null : (
          <Button size="sm" variant="outline" onClick={() => { onStart(); setEditing(true); }}>
            <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
        )
      }
    >
      {editing ? (
        <>
          {form}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button
              disabled={saving || !canSave}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave();
                  setEditing(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to save");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      ) : (
        preview
      )}
    </SectionCard>
  );
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
