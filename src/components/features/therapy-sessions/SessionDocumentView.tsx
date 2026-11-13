"use client";
// FEATURE: Session documentation — vitals, interventions delivered, completion, cancellation, read-only history
import { useState } from "react";
import { z } from "zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { formatDateTime, minutesToTime, formatDate } from "@/lib/format";
import { PERMS, PLAN_INTERVENTIONS, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CUSTOM = "__custom__";
const UNSET = "__none__";
const EDITABLE_STATUSES = ["PLANNED", "IN_PROGRESS"];

// ---- Types ----
interface SessionDetail {
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
  bloodPressure: string | null;
  heartRate: number | null;
  otherVitals: string | null;
  patientResponse: string | null;
  observations: string | null;
  notes: string | null;
  therapistSignature: string | null;
  completedAt: string | null;
  updatedAt: string;
  episode: {
    id: string;
    title: string;
    status: string;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { id: string; patientCode: string; firstName: string; lastName: string };
  };
  patient: { id: string; patientCode: string; firstName: string; lastName: string; phone?: string | null; paymentArrangement?: string | null };
  therapist: { id?: string; firstName: string; lastName: string } | null;
  interventions: { id: string; name: string; details: string | null }[];
  appointment: { id: string; date: string; startMin: number; endMin?: number; status?: string; purpose?: string | null } | null;
}

interface PackageTx {
  id: string;
  type: string;
  sessions: number;
  description: string | null;
  createdAt: string;
  patientPackage?: {
    totalSessions: number;
    usedSessions: number;
    package?: { name?: string; sessions?: number } | null;
  } | null;
}

interface DetailResponse {
  session: SessionDetail;
  packageTransactions: PackageTx[];
}

interface CompleteResponse {
  session: SessionDetail;
  reviewDue: boolean;
  packageInfo: { deducted: boolean; remaining?: number | null };
  sessionsSinceReview: number;
  threshold: number;
  packageTransactions: PackageTx[];
}

// ---- Documentation form helpers ----
const formSchema = z.object({
  painLevel: z.number().min(0).max(10).nullable(),
  bloodPressure: z.string().max(40),
  heartRate: z.string().max(10).refine((v) => v === "" || /^\d+$/.test(v), "Heart rate must be a number"),
  otherVitals: z.string().max(2000),
  patientResponse: z.string().max(2000),
  observations: z.string().max(4000),
  notes: z.string().max(4000),
  durationMin: z.string().max(5).refine((v) => v === "" || /^\d+$/.test(v), "Duration must be a number"),
  therapistSignature: z.string().max(120),
  interventions: z.array(z.object({
    preset: z.string().min(1),
    customName: z.string().max(120),
    details: z.string().max(500),
  })).max(30),
});

type FormValues = z.infer<typeof formSchema>;

function buildDefaults(session: SessionDetail): FormValues {
  return {
    painLevel: session.painLevel ?? null,
    bloodPressure: session.bloodPressure ?? "",
    heartRate: session.heartRate !== null && session.heartRate !== undefined ? String(session.heartRate) : "",
    otherVitals: session.otherVitals ?? "",
    patientResponse: session.patientResponse ?? "",
    observations: session.observations ?? "",
    notes: session.notes ?? "",
    durationMin: session.durationMin !== null && session.durationMin !== undefined ? String(session.durationMin) : "",
    therapistSignature: session.therapistSignature ?? "",
    interventions: session.interventions.length
      ? session.interventions.map((i) => ({
          preset: (PLAN_INTERVENTIONS as readonly string[]).includes(i.name) ? i.name : CUSTOM,
          customName: (PLAN_INTERVENTIONS as readonly string[]).includes(i.name) ? "" : i.name,
          details: i.details ?? "",
        }))
      : [{ preset: UNSET, customName: "", details: "" }],
  };
}

function rowsFrom(values: FormValues) {
  return values.interventions
    .map((r) => ({
      name: r.preset === CUSTOM ? r.customName.trim() : r.preset === UNSET ? "" : r.preset,
      details: r.details.trim() || undefined,
    }))
    .filter((r) => r.name.length > 0);
}

function payloadFrom(values: FormValues): Record<string, unknown> {
  return {
    painLevel: values.painLevel,
    bloodPressure: values.bloodPressure.trim() || null,
    heartRate: values.heartRate.trim() === "" ? null : Number(values.heartRate),
    otherVitals: values.otherVitals.trim() || null,
    patientResponse: values.patientResponse.trim() || null,
    observations: values.observations.trim() || null,
    notes: values.notes.trim() || null,
    durationMin: values.durationMin.trim() === "" ? null : Number(values.durationMin),
    therapistSignature: values.therapistSignature.trim() || null,
    interventions: rowsFrom(values),
  };
}

// ---- Read-only components ----
function ReadOnlyDocumentation({ session }: { session: SessionDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Vitals recorded" icon="HeartPulse">
        {session.painLevel === null && !session.bloodPressure && !session.heartRate && !session.otherVitals ? (
          <p className="text-sm text-muted-foreground">No vitals were recorded for this session.</p>
        ) : (
          <DetailGrid>
            <DetailRow label="Pain level" value={session.painLevel !== null && session.painLevel !== undefined ? `${session.painLevel}/10` : "—"} />
            <DetailRow label="Blood pressure" value={session.bloodPressure || "—"} />
            <DetailRow label="Heart rate" value={session.heartRate !== null && session.heartRate !== undefined ? `${session.heartRate} bpm` : "—"} />
            <DetailRow label="Other vitals" value={session.otherVitals || "—"} />
          </DetailGrid>
        )}
      </SectionCard>

      <SectionCard title="Interventions delivered" icon="Activity" description="What was actually delivered in this session">
        {session.interventions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interventions recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Intervention</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {session.interventions.map((i, idx) => (
                <TableRow key={i.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="text-muted-foreground">{i.details || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Clinical notes" icon="Stethoscope">
        <DetailGrid cols={1}>
          <DetailRow label="Treatment duration" value={session.durationMin ? `${session.durationMin} minutes` : "—"} />
          <DetailRow label="Patient response" value={session.patientResponse || "—"} />
          <DetailRow label="Clinical observations" value={session.observations || "—"} />
          <DetailRow label="Additional notes" value={<span className="whitespace-pre-wrap">{session.notes || "—"}</span>} />
          <DetailRow label="Therapist signature" value={session.therapistSignature ? <span className="italic">{session.therapistSignature}</span> : "—"} />
          <DetailRow label="Completed at" value={session.completedAt ? formatDateTime(session.completedAt) : "—"} />
        </DetailGrid>
      </SectionCard>
    </div>
  );
}

function PackageLedgerCard({ transactions, arrangement }: { transactions: PackageTx[]; arrangement?: string | null }) {
  if (arrangement !== "PACKAGE" && transactions.length === 0) return null;
  return (
    <SectionCard
      title="Package deduction ledger"
      icon="Wallet"
      description={transactions.length ? "Package transactions linked to this session" : "Package patient — no deduction was recorded for this session"}
    >
      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No package transactions linked to this session. Deductions happen automatically when a package-paying patient&apos;s session is completed.
        </p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={cn(
                    tx.type === "DEDUCTION" && "border-amber-200 bg-amber-50 text-amber-700",
                    tx.type === "REVERSAL" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    tx.type === "EXHAUSTED" && "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  {labelize(tx.type)}
                </Badge>
                <div>
                  <p className="text-sm font-medium">
                    {tx.sessions > 0 ? `+${tx.sessions}` : tx.sessions} session{Math.abs(tx.sessions) === 1 ? "" : "s"}
                    {tx.patientPackage?.package?.name ? ` · ${tx.patientPackage.package.name}` : ""}
                  </p>
                  {tx.description ? <p className="text-xs text-muted-foreground">{tx.description}</p> : null}
                </div>
              </div>
              <div className="text-right">
                {tx.patientPackage ? (
                  <p className="text-xs text-muted-foreground">
                    {tx.patientPackage.usedSessions}/{tx.patientPackage.totalSessions} used
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Editable documentation form (remounted per session via key) ----
function SessionEditForm({ session, onBack, onReviewDue }: {
  session: SessionDetail;
  onBack: () => void;
  onReviewDue: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useUIStore((s) => s.navigate);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [markAs, setMarkAs] = useState("CANCELLED");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(session),
    mode: "onSubmit",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "interventions" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["session", session.id] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<SessionDetail>(`/api/sessions/${session.id}`, { method: "PATCH", json: payload }),
    onSuccess: (_data, payload) => {
      const statusOnly = Object.keys(payload).length === 1 && "status" in payload;
      toast.success(statusOnly ? "Session started" : "Session saved");
      invalidate();
    },
    onError: (err: Error) => toast.error("Save failed", { description: err.message }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      apiFetch<CompleteResponse>(`/api/sessions/${session.id}/complete`, {
        method: "POST",
        json: payloadFrom(form.getValues()),
      }),
    onSuccess: (data) => {
      setCompleteOpen(false);
      toast.success(`Session completed. ${data.sessionsSinceReview}/${data.threshold} toward next review`);
      if (data.packageInfo?.deducted) {
        toast.info(`Package session deducted — ${data.packageInfo.remaining ?? 0} remaining`);
      }
      if (data.reviewDue) {
        onReviewDue();
        toast.warning("Progress review now due", {
          description: `${data.sessionsSinceReview} sessions since last review — threshold ${data.threshold} reached.`,
        });
      }
      invalidate();
    },
    onError: (err: Error) => {
      setCompleteOpen(false);
      toast.error("Could not complete session", { description: err.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<SessionDetail>(`/api/sessions/${session.id}/cancel`, {
        method: "POST",
        json: { reason: cancelReason.trim() || undefined, markAs },
      }),
    onSuccess: () => {
      toast.success(markAs === "NO_SHOW" ? "Session marked as no-show" : "Session cancelled");
      setCancelOpen(false);
      setCancelReason("");
      invalidate();
      onBack();
    },
    onError: (err: Error) => toast.error("Could not cancel session", { description: err.message }),
  });

  const handleSave = form.handleSubmit(async (values) => {
    saveMutation.mutate(payloadFrom(values));
  });

  const handleStart = async () => {
    await form.handleSubmit(() => {
      saveMutation.mutate({ status: "IN_PROGRESS" });
    })();
  };

  const handleComplete = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Please check the highlighted fields before completing");
      return;
    }
    completeMutation.mutate();
  };

  const busy = saveMutation.isPending || completeMutation.isPending;

  return (
    <>
      <SectionCard title="Vitals" icon="HeartPulse" description="Recorded at the start of the session">
        <div className="space-y-5">
          <Controller
            control={form.control}
            name="painLevel"
            render={({ field }) => (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Pain level (0–10)</Label>
                  <span className={cn("text-sm font-medium", field.value === null ? "text-muted-foreground" : "text-teal-700")}>
                    {field.value === null ? "Not recorded" : `${field.value}/10`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">0</span>
                  <Slider
                    value={[field.value ?? 5]}
                    min={0}
                    max={10}
                    step={1}
                    onValueChange={(v) => field.onChange(v[0])}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">10</span>
                </div>
              </div>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-bp">Blood pressure</Label>
              <Input id="doc-bp" placeholder="e.g. 120/80" {...form.register("bloodPressure")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-hr">Heart rate (bpm)</Label>
              <Input id="doc-hr" type="number" placeholder="e.g. 72" {...form.register("heartRate")} />
              {form.formState.errors.heartRate ? (
                <p className="text-xs text-rose-600">{form.formState.errors.heartRate.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-ov">Other vitals</Label>
              <Input id="doc-ov" placeholder="SpO₂, temperature, ROM…" {...form.register("otherVitals")} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Interventions delivered"
        icon="Activity"
        description="Document the treatment actually delivered — do not simply copy the planned interventions."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => append({ preset: UNSET, customName: "", details: "" })}
          >
            <AtomIcon name="Plus" className="h-3.5 w-3.5" /> Add intervention
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interventions — add at least one before completing the session.</p>
          ) : null}
          {fields.map((f, index) => {
            return (
              <div key={f.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center">
                <Controller
                  control={form.control}
                  name={`interventions.${index}.preset` as never}
                  render={({ field }) => (
                    <>
                      <div className="w-full sm:w-56">
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue placeholder="Select intervention" /></SelectTrigger>
                          <SelectContent>
                            {PLAN_INTERVENTIONS.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                            <SelectItem value={CUSTOM}>Custom…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {field.value === CUSTOM ? (
                        <div className="w-full sm:w-56">
                          <Input
                            placeholder="Custom intervention name"
                            {...form.register(`interventions.${index}.customName` as never)}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                />
                <Input
                  className="flex-1"
                  placeholder="Details (dosage, sets, reps, area treated…)"
                  {...form.register(`interventions.${index}.details` as never)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => remove(index)}
                  aria-label="Remove intervention"
                >
                  <AtomIcon name="Trash2" className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Clinical record" icon="Stethoscope">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-duration">Treatment duration (minutes)</Label>
              <Input id="doc-duration" type="number" min={1} max={600} placeholder="e.g. 45" {...form.register("durationMin")} />
              {form.formState.errors.durationMin ? (
                <p className="text-xs text-rose-600">{form.formState.errors.durationMin.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-sign">Therapist signature</Label>
              <Input id="doc-sign" placeholder="Type full name to sign" {...form.register("therapistSignature")} />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-response">Patient response</Label>
              <Textarea id="doc-response" rows={4} placeholder="How did the patient tolerate / respond to treatment?" {...form.register("patientResponse")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-obs">Clinical observations</Label>
              <Textarea id="doc-obs" rows={4} placeholder="Objective findings, ROM changes, compensations…" {...form.register("observations")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Additional notes</Label>
            <Textarea id="doc-notes" rows={2} placeholder="Anything else worth recording" {...form.register("notes")} />
          </div>
        </div>
      </SectionCard>

      {/* ---- Action bar ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={handleSave} disabled={busy}>
          <AtomIcon name={saveMutation.isPending ? "Loader2" : "Save"} className={cn("h-4 w-4", saveMutation.isPending && "animate-spin")} />
          Save draft
        </Button>
        {session.status === "PLANNED" ? (
          <Button variant="outline" onClick={handleStart} disabled={busy}>
            <AtomIcon name="Play" className="h-4 w-4" /> Start session
          </Button>
        ) : null}

        <span className="grow" />

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <AtomIcon name="XCircle" className="h-4 w-4" /> Cancel / no-show
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
              <AlertDialogDescription>
                Cancelled and no-show sessions never count toward progress review and never deduct package sessions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Mark as</Label>
                <Select value={markAs} onValueChange={setMarkAs}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="NO_SHOW">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Reason</Label>
                <Textarea
                  id="cancel-reason"
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Patient called in sick, therapist unavailable…"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep session</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : null}
                Confirm {markAs === "NO_SHOW" ? "no-show" : "cancellation"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <AlertDialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
              <AtomIcon name={completeMutation.isPending ? "Loader2" : "CheckCircle2"} className={cn("h-4 w-4", completeMutation.isPending && "animate-spin")} />
              Complete session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete this session?</AlertDialogTitle>
              <AlertDialogDescription>
                Completing is final: the session is locked for editing, counts toward the episode&apos;s progress-review
                threshold{session.patient.paymentArrangement === "PACKAGE" ? ", and deducts one session from the patient's active package" : ""}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={(e) => { e.preventDefault(); handleComplete(); }}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : null}
                Complete session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

// ---- Main view ----
export default function SessionDocumentView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [reviewDueFlag, setReviewDueFlag] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => apiFetch<DetailResponse>(`/api/sessions/${sessionId}`),
  });

  const session = detailQuery.data?.session;
  const ledger = detailQuery.data?.packageTransactions ?? [];
  const editable = !!session && EDITABLE_STATUSES.includes(session.status) && canManage;

  // ---- Loading / error ----
  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (detailQuery.isError || !session) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Session not found"
        description={(detailQuery.error as Error)?.message || "This session may have been removed."}
        action={<Button variant="outline" onClick={onBack}>Back to sessions</Button>}
      />
    );
  }

  const patient = session.patient;
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const reviewDue = reviewDueFlag || session.episode.reviewDue;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <AtomIcon name="ArrowLeft" className="h-4 w-4" /> Back to sessions
        </Button>
        <StatusBadge status={session.status} />
      </div>

      {/* Review-due warning */}
      {reviewDue ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-800">
          <AtomIcon name="AlertTriangle" className="h-4 w-4" />
          <AlertTitle>Progress review now due</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {session.episode.sessionsSinceReview}/{session.episode.reviewThreshold} sessions completed since the last review — a progress review is required before continuing treatment.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
              onClick={() => navigate("progress-reviews", { episodeId: session.episodeId })}
            >
              Go to progress reviews
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Header card */}
      <SectionCard
        title={`Session — ${patientName}`}
        icon="Activity"
        description={session.episode.title}
        actions={
          session.appointment ? (
            <button
              className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
              onClick={() => navigate("appointments", { appointmentId: session.appointment!.id })}
              title="Open linked appointment"
            >
              <AtomIcon name="CalendarDays" className="h-3.5 w-3.5" />
              Appointment · {formatDate(session.appointment.date)} {minutesToTime(session.appointment.startMin)}
            </button>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Walk-in / no linked appointment</Badge>
          )
        }
      >
        <DetailGrid cols={3}>
          <DetailRow label="Patient" value={
            <button className="font-medium text-teal-700 hover:underline" onClick={() => navigate("patients", { patientId: session.patientId })}>
              {patientName}
            </button>
          } />
          <DetailRow label="Patient code" value={<span className="font-mono text-xs">{patient.patientCode}</span>} />
          <DetailRow label="Payment arrangement" value={labelize(patient.paymentArrangement)} />
          <DetailRow label="Episode" value={session.episode.title} />
          <DetailRow label="Therapist" value={session.therapist ? `${session.therapist.firstName} ${session.therapist.lastName}` : "—"} />
          <DetailRow label="Date & time" value={`${formatDate(session.date)} · ${minutesToTime(session.timeMin)}`} />
          <DetailRow label="Review progress" value={
            <span className={cn("text-sm font-medium", session.episode.reviewDue ? "text-amber-600" : "text-foreground")}>
              {session.episode.sessionsSinceReview}/{session.episode.reviewThreshold}
              {session.episode.reviewDue ? " · review due" : " since last review"}
            </span>
          } />
        </DetailGrid>
      </SectionCard>

      {session.status === "CANCELLED" || session.status === "NO_SHOW" ? (
        <>
          <Alert>
            <AtomIcon name="Info" className="h-4 w-4" />
            <AlertTitle>{labelize(session.status)} session</AlertTitle>
            <AlertDescription>
              This session was not delivered. It does not count toward progress-review thresholds and does not deduct any package sessions.
            </AlertDescription>
          </Alert>
          <SectionCard title="Session record" icon="FileText">
            <DetailGrid cols={1}>
              <DetailRow label="Scheduled for" value={`${formatDate(session.date)} ${minutesToTime(session.timeMin)}`} />
              <DetailRow label="Therapist" value={session.therapist ? `${session.therapist.firstName} ${session.therapist.lastName}` : "—"} />
              <DetailRow label="Notes" value={<span className="whitespace-pre-wrap">{session.notes || "—"}</span>} />
            </DetailGrid>
          </SectionCard>
          <PackageLedgerCard transactions={ledger} arrangement={patient.paymentArrangement} />
        </>
      ) : session.status === "COMPLETED" || !editable ? (
        <>
          <ReadOnlyDocumentation session={session} />
          <PackageLedgerCard transactions={ledger} arrangement={patient.paymentArrangement} />
        </>
      ) : (
        <SessionEditForm
          key={session.id}
          session={session}
          onBack={onBack}
          onReviewDue={() => setReviewDueFlag(true)}
        />
      )}
    </div>
  );
}
