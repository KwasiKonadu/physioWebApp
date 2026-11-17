"use client";
// New treatment episode dialog.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";
import { useTherapists } from "./hooks";
import { Field } from "@/components/molecules/field";

// ---------- New episode dialog ----------
export function NewEpisodeDialog({ open, onOpenChange, patientId, patientName, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId: string;
  patientName: string;
  onCreated: () => void;
}) {
  const therapists = useTherapists();
  const [title, setTitle] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ id: string; episodeNumber: number }>(`/api/patients/${patientId}/episodes`, { method: "POST", json: body }),
    onSuccess: (ep) => {
      toast.success(`Episode #${ep.episodeNumber} opened`, { description: "Status: awaiting assessment" });
      onOpenChange(false);
      setTitle(""); setTherapistId(""); setNotes("");
      onCreated();
    },
    onError: (e: Error) => toast.error("Could not open episode", { description: e.message }),
  });

  const submit = () => {
    if (!title.trim()) {
      toast.error("Episode title is required");
      return;
    }
    create.mutate({ title: title.trim(), therapistId: therapistId || undefined, notes: notes.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!create.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open treatment episode</DialogTitle>
          <DialogDescription>
            A new episode for <span className="font-medium text-foreground">{patientName}</span> starts at “Awaiting assessment”. Session numbering and review thresholds are set automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lower back pain — mechanical" />
          </Field>
          <Field label="Assign therapist">
            <Select value={therapistId} onValueChange={setTherapistId}>
              <SelectTrigger><SelectValue placeholder="Optional — assign now or later" /></SelectTrigger>
              <SelectContent>
                {therapists.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Context for the assessing therapist" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" />}
            Open episode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Insurance edit dialog ----------
