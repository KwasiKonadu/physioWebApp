"use client";
// ============ DiagnosesTab: clinical diagnoses list, detail + revision history ============
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionCard } from "@/components/molecules/section-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState, EmptyStateCompact } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { DIAGNOSIS_CATEGORIES, SEVERITIES, SIDES, BODY_PARTS, PERMS, labelize } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import * as API from "./assessments-api";
import { PatientSearchSelect } from "./AssessmentForm";

const severityTone: Record<string, string> = {
  MILD: "bg-sky-50 text-sky-700 border-sky-200",
  MODERATE: "bg-amber-50 text-amber-700 border-amber-200",
  SEVERE: "bg-rose-50 text-rose-700 border-rose-200",
};

function severityBadge(sev?: string | null) {
  if (!sev) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant="outline" className={cn("font-medium", severityTone[sev] || "")}>{labelize(sev)}</Badge>;
}

export default function DiagnosesTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [search, setSearch] = useState("");
  const dq = API.useDebounced(search, 300);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [addOpen, setAddOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<API.DiagnosisListItem | null>(null);
  const [reviseItem, setReviseItem] = useState<API.DiagnosisListItem | null>(null);

  const listQ = useQuery({
    queryKey: ["diagnoses", "list", { dq, category, status, page, pageSize }],
    queryFn: () => API.fetchDiagnoses({
      search: dq || undefined,
      category: category === "all" ? undefined : category,
      status: status === "all" ? undefined : status,
      page,
      pageSize,
    }),
  });

  const items = listQ.data?.items || [];
  const total = listQ.data?.total || 0;

  const resetFilters = () => { setSearch(""); setCategory("all"); setStatus("all"); setPage(1); };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Diagnoses"
        description="Clinical diagnoses across episodes — revisions preserve a full audit trail"
        icon="FileText"
        noPadding
        actions={canManage ? (
          <Button size="sm" onClick={() => setAddOpen(true)}><AtomIcon name="Plus" className="h-4 w-4" />Add diagnosis</Button>
        ) : undefined}
      >
        <div className="border-b px-4 py-3">
          <DataToolbar
            search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search diagnosis, patient, episode…" }}
            filters={(
              <>
                <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SUPERSEDED">Superseded</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            onRefresh={() => listQ.refetch()}
            refreshing={listQ.isFetching}
          />
        </div>

        {listQ.isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : total === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="FileText"
              title={dq || category !== "all" || status !== "all" ? "No diagnoses match your filters" : "No diagnoses recorded"}
              description={dq || category !== "all" || status !== "all" ? "Try adjusting the search or filters." : "Add a diagnosis from an episode to get started."}
              action={(dq || category !== "all" || status !== "all") ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Patient</TableHead>
                    <TableHead className="text-xs">Episode</TableHead>
                    <TableHead className="text-xs">Diagnosis</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Body / side</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Prov.</TableHead>
                    <TableHead className="text-xs">Therapist</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((dx) => (
                    <TableRow key={dx.id} className="cursor-pointer" onClick={() => setDetailItem(dx)}>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(dx.diagnosisDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm font-medium">{fullName(dx.episode?.patient || {}) || "—"}</p>
                        <p className="text-xs text-muted-foreground">{dx.episode?.patient?.patientCode || ""}</p>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{dx.episode?.title || "—"}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate text-sm font-medium">{dx.title}</p>
                      </TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{labelize(dx.category)}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{[dx.bodyPart, dx.affectedSide ? labelize(dx.affectedSide) : ""].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell>{severityBadge(dx.severity)}</TableCell>
                      <TableCell>
                        {dx.provisional ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-sky-600"><AtomIcon name="Info" className="h-4 w-4" /></span>
                            </TooltipTrigger>
                            <TooltipContent>Provisional diagnosis — pending confirmation</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dx.therapistName || "—"}</TableCell>
                      <TableCell><StatusBadge status={dx.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </SectionCard>

      <AddDiagnosisDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["diagnoses"] })} />
      <DiagnosisDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onRevise={() => { if (detailItem) { setReviseItem(detailItem); setDetailItem(null); } }}
        canManage={canManage}
      />
      <ReviseDiagnosisDialog
        item={reviseItem}
        onClose={() => setReviseItem(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["diagnoses"] })}
      />
    </div>
  );
}

// ===================== add diagnosis =====================
function AddDiagnosisDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [patient, setPatient] = useState<API.PatientLite | null>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [affectedSide, setAffectedSide] = useState("");
  const [severity, setSeverity] = useState("");
  const [explanation, setExplanation] = useState("");
  const [provisional, setProvisional] = useState(false);

  const bundleQ = useQuery({
    queryKey: ["diagnoses", "bundle", patient?.id],
    queryFn: () => API.fetchPatientBundle(patient!.id),
    enabled: open && !!patient?.id,
  });
  const therapistsQ = useQuery({
    queryKey: ["diagnoses", "therapists"],
    queryFn: API.fetchTherapists,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const episodes = useMemo(() => {
    const eps = bundleQ.data?.episodes || [];
    return eps.filter((e) => API.OPEN_EPISODE_STATUSES.includes(e.status || ""));
  }, [bundleQ.data]);

  const createQ = useMutation({
    mutationFn: () => API.createDiagnosis({
      episodeId,
      title: title.trim(),
      category,
      bodyPart: bodyPart || null,
      affectedSide: affectedSide || null,
      severity: severity || null,
      explanation: explanation.trim() || null,
      provisional,
      therapistId: therapistId || undefined,
    }),
    onSuccess: () => {
      toast.success("Diagnosis added", { description: title.trim() });
      reset();
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add diagnosis"),
  });

  const reset = () => {
    setPatient(null); setEpisodeId(""); setTherapistId(""); setTitle(""); setCategory("");
    setBodyPart(""); setAffectedSide(""); setSeverity(""); setExplanation(""); setProvisional(false);
  };

  const submit = () => {
    if (!episodeId) return toast.error("Select the episode for this diagnosis");
    if (title.trim().length < 2) return toast.error("Enter the diagnosis title");
    if (!category) return toast.error("Select a category");
    createQ.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add diagnosis</DialogTitle>
          <DialogDescription>Multiple diagnoses may coexist on an episode (primary vs secondary).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Patient">
            <PatientSearchSelect autoFocus selected={patient} onSelect={(p) => { setPatient(p); setEpisodeId(""); }} onClear={() => { setPatient(null); setEpisodeId(""); }} />
          </Field>
          {patient ? (
            <Field label="Episode">
              <Select value={episodeId || undefined} onValueChange={setEpisodeId}>
                <SelectTrigger><SelectValue placeholder="Select episode…" /></SelectTrigger>
                <SelectContent>
                  {episodes.length ? episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || "Episode"} {e.status ? `· ${labelize(e.status)}` : ""}</SelectItem>
                  )) : <SelectItem value="_none" disabled>No open episodes for this patient</SelectItem>}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Diagnosis title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lumbar disc herniation with radiculopathy (L4-L5, left)" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Category…" /></SelectTrigger>
                <SelectContent>{DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Body part">
              <Select value={bodyPart || undefined} onValueChange={setBodyPart}>
                <SelectTrigger><SelectValue placeholder="Body part…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Affected side">
              <Select value={affectedSide || undefined} onValueChange={setAffectedSide}>
                <SelectTrigger><SelectValue placeholder="Side…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={severity || undefined} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue placeholder="Severity…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Clinical explanation">
            <Textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Supporting findings, imaging, clinical reasoning…" />
          </Field>
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
            <div>
              <Label className="text-sm">Provisional diagnosis</Label>
              <p className="text-xs text-muted-foreground">Pending confirmation — provisional records allow minor direct edits</p>
            </div>
            <Switch checked={provisional} onCheckedChange={setProvisional} />
          </div>
          {therapistsQ.data?.length ? (
            <Field label="Diagnosing therapist">
              <Select value={therapistId || undefined} onValueChange={setTherapistId}>
                <SelectTrigger><SelectValue placeholder={therapistsQ.data[0] ? `Default: ${fullName(therapistsQ.data[0])}` : "Therapist…"} /></SelectTrigger>
                <SelectContent>
                  {therapistsQ.data.map((t) => <SelectItem key={t.id} value={t.id}>{fullName(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={createQ.isPending} onClick={submit}>{createQ.isPending ? "Saving…" : "Add diagnosis"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}

// ===================== detail dialog + change history =====================
function DiagnosisDetailDialog({ item, onClose, onRevise, canManage }: {
  item: API.DiagnosisListItem | null; onClose: () => void; onRevise: () => void; canManage: boolean;
}) {
  const history = API.parseHistory(item?.changeHistory);
  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                <span>{item.title}</span>
                <StatusBadge status={item.status} />
              </DialogTitle>
              <DialogDescription>
                {fullName(item.episode?.patient || {}) || "—"} · {item.episode?.title || "—"} · {formatDate(item.diagnosisDate)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{labelize(item.category)}</Badge>
                {item.severity ? severityBadge(item.severity) : null}
                {item.provisional ? (
                  <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Provisional</Badge>
                ) : null}
              </div>
              <dl className="rounded-lg border bg-muted/10 px-3 py-2">
                <DRow label="Body part" value={item.bodyPart} />
                <DRow label="Affected side" value={item.affectedSide ? labelize(item.affectedSide) : ""} />
                <DRow label="Diagnosed by" value={item.therapistName} />
                <DRow label="Date" value={formatDate(item.diagnosisDate)} />
              </dl>
              {item.explanation ? (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Clinical explanation</h4>
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/10 p-3 text-sm text-muted-foreground">{item.explanation}</p>
                </div>
              ) : null}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Change history</h4>
                {history.length === 0 ? (
                  <EmptyStateCompact message="No revisions recorded for this diagnosis." />
                ) : (
                  <ol className="space-y-2 border-l-2 border-teal-200 pl-4">
                    {history.map((h, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-teal-500 bg-white" />
                        <p className="text-xs text-muted-foreground">{formatDate(h.date)} · by {h.by}</p>
                        <p className="text-sm font-medium">{h.from} → superseded</p>
                        <p className="text-xs text-muted-foreground">{h.justification}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              {canManage && item.status === "ACTIVE" ? (
                <Button onClick={onRevise}><AtomIcon name="FilePenLine" className="h-4 w-4" />Revise</Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ===================== revise dialog =====================
function ReviseDiagnosisDialog({ item, onClose, onSaved }: {
  item: API.DiagnosisListItem | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [affectedSide, setAffectedSide] = useState("");
  const [severity, setSeverity] = useState("");
  const [explanation, setExplanation] = useState("");
  const [provisional, setProvisional] = useState(false);
  const [justification, setJustification] = useState("");

  // prefill whenever a new item is targeted
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setCategory(item.category);
    setBodyPart(item.bodyPart || "_none");
    setAffectedSide(item.affectedSide || "_none");
    setSeverity(item.severity || "_none");
    setExplanation(item.explanation || "");
    setProvisional(item.provisional);
    setJustification("");
  }

  const reviseQ = useMutation({
    mutationFn: () => API.updateDiagnosis(item!.id, {
      action: "revise",
      title: title.trim(),
      category,
      bodyPart: bodyPart === "_none" ? null : bodyPart,
      affectedSide: affectedSide === "_none" ? null : affectedSide,
      severity: severity === "_none" ? null : severity,
      explanation: explanation.trim() || null,
      provisional,
      justification: justification.trim(),
    }),
    onSuccess: (data) => {
      toast.success("Diagnosis revised", { description: `${item?.title} → ${data.title}. Previous record marked superseded.` });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revise diagnosis"),
  });

  const submit = () => {
    if (title.trim().length < 2) return toast.error("Enter the revised diagnosis title");
    if (!category) return toast.error("Select a category");
    if (justification.trim().length < 3) return toast.error("A justification is required to revise a diagnosis");
    reviseQ.mutate();
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>Revise diagnosis</DialogTitle>
              <DialogDescription>
                “{item.title}” will be marked <strong>superseded</strong> and a new active record created with these changes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Diagnosis title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={category || undefined} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Body part">
                  <Select value={bodyPart || undefined} onValueChange={setBodyPart}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Affected side">
                  <Select value={affectedSide || undefined} onValueChange={setAffectedSide}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select value={severity || undefined} onValueChange={setSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Clinical explanation">
                <Textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
                <div>
                  <Label className="text-sm">Provisional</Label>
                  <p className="text-xs text-muted-foreground">Pending confirmation</p>
                </div>
                <Switch checked={provisional} onCheckedChange={setProvisional} />
              </div>
              <Field label="Justification (required)" hint="Recorded in the diagnosis change history">
                <Textarea rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="e.g. MRI confirms L4-L5 left paracentral disc extrusion — refining diagnosis" />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={reviseQ.isPending} onClick={submit}>{reviseQ.isPending ? "Revising…" : "Create revised diagnosis"}</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
