"use client";
// FEATURE: Therapy Sessions — list + filters + stats + new-session dialog + documentation view
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { formatDate, minutesToTime, timeToMinutes, ymd } from "@/lib/format";
import { PERMS, SESSION_STATUSES, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore, type NavigateOpts } from "@/stores/app-store";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import SessionDocumentView from "./SessionDocumentView";

// ---- Types ----
interface SessionListItem {
  id: string;
  episodeId: string;
  patientId: string;
  therapistId: string;
  appointmentId: string | null;
  date: string;
  timeMin: number | null;
  durationMin: number | null;
  status: string;
  painLevel: number | null;
  episode: {
    id: string;
    title: string;
    status: string;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { patientCode: string; firstName: string; lastName: string };
  };
  therapist: { firstName: string; lastName: string } | null;
  interventions: { id: string; name: string; details: string | null }[];
  appointment: { id: string; date: string; startMin: number } | null;
}

interface SessionsListResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: { completed: number; planned: number; today: number };
}

interface TherapistOption {
  id: string;
  name: string;
  isTherapist: boolean;
}

interface PatientOption {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  currentStatus?: string | null;
}

interface EpisodeOption {
  id: string;
  title: string;
  status: string;
  episodeNumber?: number;
  therapistId?: string | null;
}

// ---- Shared hooks ----
function useTherapists() {
  return useQuery({
    queryKey: ["sessions-therapists"],
    queryFn: async (): Promise<TherapistOption[]> => {
      try {
        const data = await apiFetch<unknown>("/api/staff?pageSize=200");
        const raw = Array.isArray(data)
          ? data
          : ((data as { items?: Record<string, unknown>[] })?.items ?? []);
        const mapped = (raw as Record<string, unknown>[])
          .map((s) => ({
            id: String(s.id ?? ""),
            name: [s.firstName, s.lastName].filter(Boolean).join(" "),
            isTherapist:
              s.isTherapist === true ||
              s.staffRole === "PHYSIOTHERAPIST" ||
              (s.isTherapist === undefined && s.staffRole === undefined),
          }))
          .filter((t) => t.id && t.name);
        const therapists = mapped.filter((t) => t.isTherapist);
        return therapists.length ? therapists : mapped;
      } catch {
        // Staff module may not be available — degrade gracefully
        return [];
      }
    },
    staleTime: 60_000,
  });
}

function PainBadge({ level }: { level: number | null }) {
  if (level === null || level === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    level <= 3
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : level <= 6
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <Badge variant="outline" className={cn("font-medium", tone)}>
      {level}/10
    </Badge>
  );
}

function ReviewProgress({ since, threshold, due }: { since: number; threshold: number; due: boolean }) {
  const pct = threshold > 0 ? Math.min(100, Math.round((since / threshold) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 w-14" />
      <span className={cn("text-xs tabular-nums", due ? "font-semibold text-amber-600" : "text-muted-foreground")}>
        {since}/{threshold}
      </span>
      {due ? <AtomIcon name="AlertTriangle" className="h-3.5 w-3.5 text-amber-500" /> : null}
    </div>
  );
}

// ---- New session dialog ----
function NewSessionDialog({ open, onOpenChange, onCreated }: {
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

// ---- Sessions list ----
function SessionsList({ onOpen, episodeFilter, onClearEpisodeFilter }: {
  onOpen: (sessionId: string) => void;
  episodeFilter: string | null;
  onClearEpisodeFilter: () => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [status, setStatus] = useState("all");
  const [therapistId, setTherapistId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);

  const therapistsQuery = useTherapists();

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status !== "all") params.set("status", status);
  if (therapistId !== "all") params.set("therapistId", therapistId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (episodeFilter) params.set("episodeId", episodeFilter);

  const listQuery = useQuery({
    queryKey: ["sessions", status, therapistId, from, to, episodeFilter, page, pageSize],
    queryFn: () => apiFetch<SessionsListResponse>(`/api/sessions?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => {
    const raw = listQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((s) => {
      const p = s.episode.patient;
      return `${p.firstName} ${p.lastName} ${p.patientCode}`.toLowerCase().includes(q);
    });
  }, [listQuery.data, search]);

  const stats = listQuery.data?.stats;

  return (
    <div>
      <PageHeader
        title="Therapy Sessions"
        description="Document delivered treatments, track progress-review counters and package deductions."
        icon="Activity"
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 hover:bg-teal-700">
              <AtomIcon name="Plus" className="h-4 w-4" /> New session
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Completed (filtered range)" value={stats?.completed ?? 0} icon="CheckCircle2" tone="emerald" loading={!listQuery.data} />
        <StatCard label="Planned / active" value={stats?.planned ?? 0} icon="CalendarClock" tone="sky" loading={!listQuery.data} />
        <StatCard label="Today" value={stats?.today ?? 0} icon="Clock" tone="teal" loading={!listQuery.data} hint="Excludes cancellations & no-shows" />
      </div>

      {episodeFilter ? (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by episode</span>
          <Badge variant="outline" className="gap-1 bg-teal-50 text-teal-700">
            <AtomIcon name="Layers" className="h-3 w-3" /> {episodeFilter.slice(0, 10)}…
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClearEpisodeFilter}>
            <AtomIcon name="X" className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      ) : null}

      <SectionCard
        title="All sessions"
        icon="ListChecks"
        description="Most recent first — click a row to document or review the session."
        noPadding
        contentClassName="px-0"
      >
        <div className="px-4 pb-3 pt-1">
          <DataToolbar
            search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search patient name / code…" }}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["sessions"] })}
            refreshing={listQuery.isFetching}
            filters={
              <>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {SESSION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={therapistId} onValueChange={(v) => { setTherapistId(v); setPage(1); }}>
                  <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All therapists</SelectItem>
                    {(therapistsQuery.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-[140px]" aria-label="From date" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-[140px]" aria-label="To date" />
                </div>
              </>
            }
          />
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-2 px-4 pb-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : listQuery.isError ? (
          <EmptyState
            icon="AlertTriangle"
            title="Could not load sessions"
            description={(listQuery.error as Error)?.message || "Please try again."}
            action={<Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["sessions"] })}>Retry</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="Activity"
            title="No sessions found"
            description="Sessions appear here once scheduled or created manually. Adjust the filters to widen your search."
            action={canManage ? <Button variant="outline" onClick={() => setCreateOpen(true)}>Create a session</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date / time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="hidden md:table-cell">Episode</TableHead>
                  <TableHead className="hidden lg:table-cell">Therapist</TableHead>
                  <TableHead className="hidden sm:table-cell">Pain</TableHead>
                  <TableHead className="hidden sm:table-cell">Duration</TableHead>
                  <TableHead className="hidden xl:table-cell">Review progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const p = s.episode.patient;
                  const active = s.status === "PLANNED" || s.status === "IN_PROGRESS";
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => onOpen(s.id)}
                    >
                      <TableCell>
                        <p className="text-sm font-medium">{formatDate(s.date)}</p>
                        <p className="text-xs text-muted-foreground">{minutesToTime(s.timeMin)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{p.patientCode}</p>
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] md:table-cell">
                        <p className="truncate text-sm" title={s.episode.title}>{s.episode.title}</p>
                        {s.interventions.length ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {s.interventions.map((i) => i.name).join(", ")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {s.therapist ? `${s.therapist.firstName} ${s.therapist.lastName}` : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell"><PainBadge level={s.painLevel} /></TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">
                        {s.durationMin ? `${s.durationMin} min` : "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <ReviewProgress since={s.episode.sessionsSinceReview} threshold={s.episode.reviewThreshold} due={s.episode.reviewDue} />
                      </TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {active ? (
                          <Button size="sm" variant="outline" onClick={() => onOpen(s.id)}>
                            <AtomIcon name="PenLine" className="h-3.5 w-3.5" /> Document
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => onOpen(s.id)}>
                            <AtomIcon name="Eye" className="h-3.5 w-3.5" /> View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              page={listQuery.data?.page ?? page}
              pageSize={pageSize}
              total={listQuery.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </SectionCard>

      <NewSessionDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onOpen} />
    </div>
  );
}

// ---- Page root: list ↔ documentation view ----
export default function TherapySessionsPage() {
  const [docSessionId, setDocSessionId] = useState<string | null>(null);
  const [episodeFilter, setEpisodeFilter] = useState<string | null>(null);
  const clearOpts = useUIStore((s) => s.clearOpts);

  // Consume navOpts (sessionId / episodeId) via a store subscription so cross-module
  // navigation links open the right view; appointmentId opts are left for the
  // appointments module.
  useEffect(() => {
    const consume = (opts: NavigateOpts | null) => {
      if (!opts) return;
      if (opts.sessionId) setDocSessionId(opts.sessionId);
      else if (opts.episodeId) setEpisodeFilter(opts.episodeId);
      else return;
      clearOpts();
    };
    consume(useUIStore.getState().navOpts);
    return useUIStore.subscribe((s, prev) => {
      if (s.navOpts !== prev.navOpts) consume(s.navOpts);
    });
  }, [clearOpts]);

  if (docSessionId) {
    return (
      <SessionDocumentView
        key={docSessionId}
        sessionId={docSessionId}
        onBack={() => setDocSessionId(null)}
      />
    );
  }

  return (
    <SessionsList
      onOpen={(id) => setDocSessionId(id)}
      episodeFilter={episodeFilter}
      onClearEpisodeFilter={() => setEpisodeFilter(null)}
    />
  );
}
