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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";


import { SessionListItem, PatientOption, EpisodeOption, useTherapists } from "./session-list-shared";

// ---- New session dialog ----
export function NewSessionDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (sessionId: string) => void;
}) {
  const qc = useQueryClient();
  const [patientQuery, setPatientQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
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
    setPatientQuery("");
    setPatients([]);
    setPatientError(null);
    setSelectedPatient(null);
    setEpisodeId("none");
    setDate(ymd(new Date()));
    setTime("09:00");
    setDuration("45");
    setTherapistId("auto");
    setStatus("PLANNED");
  };

  const searchPatients = async () => {
    const q = patientQuery.trim();
    if (!q) return;
    setSearching(true);
    setPatientError(null);
    try {
      const data = await apiFetch<{ items?: PatientOption[] } | PatientOption[]>(
        `/api/patients?search=${encodeURIComponent(q)}&pageSize=20`
      );
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setPatients(items);
      if (!items.length) setPatientError("No patients matched that search.");
    } catch {
      setPatientError("Patient directory is unavailable right now.");
    } finally {
      setSearching(false);
    }
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

        {!selectedPatient ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="Search patient by name or code…"
                onKeyDown={(e) => { if (e.key === "Enter") searchPatients(); }}
              />
              <Button variant="outline" onClick={searchPatients} disabled={searching || !patientQuery.trim()}>
                {searching ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : <AtomIcon name="Search" className="h-4 w-4" />}
              </Button>
            </div>
            {patientError ? <p className="text-xs text-muted-foreground">{patientError}</p> : null}
            <div className="max-h-56 space-y-1 overflow-y-auto custom-scrollbar">
              {patients.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-teal-50/60"
                  onClick={() => { setSelectedPatient(p); setEpisodeId("none"); }}
                >
                  <span className="font-medium">{p.firstName} {p.lastName}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{p.patientCode}</Badge>
                    {p.currentStatus ? <StatusBadge status={p.currentStatus} /> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                <Badge variant="outline" className="font-mono text-xs">{selectedPatient.patientCode}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedPatient(null); setEpisodeId("none"); }}>
                Change
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Episode</Label>
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ns-date">Date</Label>
                <Input id="ns-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-time">Time</Label>
                <Input id="ns-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-duration">Duration (min)</Label>
                <Input id="ns-duration" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLANNED">Planned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Therapist</Label>
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
            </div>
          </div>
        )}

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
