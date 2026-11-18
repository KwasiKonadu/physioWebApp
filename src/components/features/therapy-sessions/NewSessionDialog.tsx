"use client";
// New session dialog: pick patient, episode, therapist and time.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { formatDate, timeToMinutes, ymd } from "@/lib/format";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { PackageBalanceNotice } from "../patients/PackageBalanceNotice";
import { PatientSearchSelect } from "../assessments/PatientSearchSelect";
import type { PatientLite } from "../assessments/assessments-api";
import { SessionListItem, EpisodeOption, useTherapists } from "./session-list-shared";
import { Field } from "@/components/molecules/field";

// ---- New session dialog ----
export function NewSessionDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (sessionId: string) => void;
}) {
  const qc = useQueryClient();
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);
  const [episodeId, setEpisodeId] = useState("none");
  const [date, setDate] = useState(ymd(new Date()));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("45");
  const [therapistId, setTherapistId] = useState("auto");
  const [status, setStatus] = useState("PLANNED");

  const therapistsQuery = useTherapists();

  const episodesQuery = useQuery({
    queryKey: ["sessions-episodes", selectedPatient?.id],
    queryFn: () => apiFetch<{ items: EpisodeOption[] }>(`/api/episodes?patientId=${selectedPatient!.id}&pageSize=50`),
    enabled: !!selectedPatient,
  });

  const openEpisodes = useMemo(() => {
    const all = episodesQuery.data?.items ?? [];
    return all.filter((e) => e.status !== "DISCHARGED" && e.status !== "DISCONTINUED");
  }, [episodesQuery.data]);

  const reset = () => {
    setSelectedPatient(null);
    setEpisodeId("none");
    setDate(ymd(new Date()));
    setTime("09:00");
    setDuration("45");
    setTherapistId("auto");
    setStatus("PLANNED");
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<SessionListItem>("/api/sessions", { method: "POST", json: payload }),
    onSuccess: (created) => {
      toast.success("Session created", {
        description: `${created.episode.patient.firstName} ${created.episode.patient.lastName} · ${formatDate(created.date)}`,
        action: { label: "Document now", onClick: () => onCreated(created.id) },
      });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => toast.error("Could not create session", { description: err.message }),
  });

  const handleCreate = () => {
    if (!selectedPatient) return toast.error("Select a patient first");
    if (episodeId === "none") return toast.error("Select a treatment episode");
    const payload: Record<string, unknown> = {
      episodeId,
      date,
      status,
    };
    if (time) payload.timeMin = timeToMinutes(time);
    if (duration && Number(duration) > 0) payload.durationMin = Number(duration);
    if (therapistId !== "auto") payload.therapistId = therapistId;
    createMutation.mutate(payload);
  };

  const chosenEpisode = openEpisodes.find((e) => e.id === episodeId);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtomIcon name="PlusCircle" className="h-4 w-4 text-teal-600" />
            New therapy session
          </DialogTitle>
          <DialogDescription>
            Create a session manually — e.g. a walk-in treatment without an appointment.
          </DialogDescription>
        </DialogHeader>

        <PatientSearchSelect
          autoFocus
          selected={selectedPatient}
          onSelect={(p) => { setSelectedPatient(p); setEpisodeId("none"); }}
          onClear={() => { setSelectedPatient(null); setEpisodeId("none"); }}
        />

        {selectedPatient ? (
          <div className="space-y-4">
            <PackageBalanceNotice patientId={selectedPatient.id} />

            <Field label="Episode">
              {episodesQuery.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : openEpisodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {episodesQuery.isError
                    ? "Episode list is unavailable right now."
                    : "No open treatment episodes for this patient (discharged/discontinued episodes cannot receive sessions)."}
                </p>
              ) : (
                <Select value={episodeId} onValueChange={setEpisodeId}>
                  <SelectTrigger><SelectValue placeholder="Select episode" /></SelectTrigger>
                  <SelectContent>
                    {openEpisodes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="ns-date">
                <Input id="ns-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Time" htmlFor="ns-time">
                <Input id="ns-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Duration (min)" htmlFor="ns-duration">
                <Input id="ns-duration" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLANNED">Planned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Therapist">
              <Select value={therapistId} onValueChange={setTherapistId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto{chosenEpisode ? " (episode therapist)" : " — episode therapist"}
                  </SelectItem>
                  {(therapistsQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !selectedPatient || episodeId === "none"}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {createMutation.isPending ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : <AtomIcon name="Plus" className="h-4 w-4" />}
            Create session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
