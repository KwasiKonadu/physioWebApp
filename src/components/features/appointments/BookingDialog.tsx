"use client";
// ============ Booking dialog: react-hook-form + zod, patient search, conflict handling ============
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";
import { timeToMinutes, ymd } from "@/lib/format";
import { APPOINTMENT_PURPOSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AtomIcon } from "@/components/atoms/icon";
import { AppointmentDto, TherapistOption } from "./appointments-shared";

const DURATIONS = ["15", "30", "45", "60"] as const;
const OPEN_EPISODE_BLOCKED = ["DISCHARGED", "DISCONTINUED"];

interface PatientOption {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

interface EpisodeOption {
  id: string;
  title: string;
  status: string;
}

const formSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  episodeId: z.string().optional(),
  therapistId: z.string().min(1, "Select a therapist"),
  date: z.string().min(1, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  duration: z.enum(DURATIONS),
  purpose: z.string().min(1, "Select a purpose"),
  purposeOther: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  walkIn: z.boolean(),
}).refine((v) => v.purpose !== "Other" || (v.purposeOther || "").trim().length > 0, {
  message: "Describe the purpose",
  path: ["purposeOther"],
});

type FormValues = z.infer<typeof formSchema>;

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetPatientId?: string | null;
  presetWalkIn?: boolean;
  defaultDate?: string;
  therapists: TherapistOption[];
}

/** Tolerant extraction — the Patients module API shape may evolve. */
function extractBundle(res: unknown): { patient: PatientOption | null; episodes: EpisodeOption[] } {
  if (!res || typeof res !== "object") return { patient: null, episodes: [] };
  const r = res as Record<string, unknown>;
  const src = (r.patient && typeof r.patient === "object" ? (r.patient as Record<string, unknown>) : r);
  const rawEpisodes = (r.episodes ?? src.episodes ?? []) as Record<string, unknown>[];
  const episodes = Array.isArray(rawEpisodes)
    ? rawEpisodes.filter((e) => e && e.id).map((e) => ({ id: String(e.id), title: String(e.title ?? "Episode"), status: String(e.status ?? "") }))
    : [];
  const p = src as Record<string, unknown>;
  const patient = p.patientCode || p.firstName
    ? { id: String(p.id ?? ""), patientCode: String(p.patientCode ?? ""), firstName: String(p.firstName ?? ""), lastName: String(p.lastName ?? ""), phone: (p.phone as string) ?? null }
    : null;
  return { patient, episodes };
}

export function BookingDialog({ open, onOpenChange, presetPatientId, presetWalkIn, defaultDate, therapists }: BookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-scrollbar max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{presetWalkIn ? "Book walk-in appointment" : "Book appointment"}</DialogTitle>
          <DialogDescription>Schedule a session with a physiotherapist. Overlaps are rejected by the server.</DialogDescription>
        </DialogHeader>
        {open ? (
          // keyed mount = fresh form state per opening, no reset effects needed
          <BookingForm
            key={`${presetPatientId || ""}|${presetWalkIn ? 1 : 0}|${defaultDate || ""}`}
            onDone={() => onOpenChange(false)}
            presetPatientId={presetPatientId || null}
            presetWalkIn={!!presetWalkIn}
            defaultDate={defaultDate || ymd(new Date())}
            therapists={therapists}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({ onDone, presetPatientId, presetWalkIn, defaultDate, therapists }: {
  onDone: () => void;
  presetPatientId: string | null;
  presetWalkIn: boolean;
  defaultDate: string;
  therapists: TherapistOption[];
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(presetPatientId);
  const [pickedPatient, setPickedPatient] = useState<PatientOption | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: presetPatientId || "", episodeId: "", therapistId: "", date: defaultDate,
      startTime: "09:00", duration: "30", purpose: "", purposeOther: "", notes: "", walkIn: presetWalkIn,
    },
  });
  const errors = form.formState.errors;
  const purpose = useWatch({ control: form.control, name: "purpose" });

  // debounce the patient search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // patient search (Patients module API — degrade gracefully if absent)
  const search = useQuery<PatientOption[]>({
    queryKey: ["booking-patient-search", debounced],
    queryFn: async () => {
      const res = await apiFetch<unknown>(`/api/patients?search=${encodeURIComponent(debounced)}&pageSize=8`);
      const arr = Array.isArray(res) ? res : ((res as { items?: Record<string, unknown>[] })?.items ?? []);
      return (arr as Record<string, unknown>[])
        .filter((p) => p && p.id)
        .map((p) => ({
          id: String(p.id),
          patientCode: String(p.patientCode ?? ""),
          firstName: String(p.firstName ?? ""),
          lastName: String(p.lastName ?? ""),
          phone: (p.phone as string) ?? null,
        }));
    },
    enabled: debounced.length > 0 && !pickedPatient,
    retry: false,
  });

  // patient bundle → display info + open episodes for the episode Select
  const bundle = useQuery({
    queryKey: ["booking-bundle", selectedPatientId],
    queryFn: async () => {
      try {
        const res = await apiFetch<unknown>(`/api/patients/${selectedPatientId}`);
        return extractBundle(res);
      } catch {
        return { patient: null, episodes: [] as EpisodeOption[] };
      }
    },
    enabled: !!selectedPatientId,
    retry: false,
  });

  const effectivePatient = pickedPatient ?? bundle.data?.patient ?? null;
  const openEpisodes = (bundle.data?.episodes || []).filter((e) => !OPEN_EPISODE_BLOCKED.includes(e.status));

  const pickPatient = (p: PatientOption) => {
    setPickedPatient(p);
    setSelectedPatientId(p.id);
    form.setValue("patientId", p.id, { shouldValidate: true });
    form.setValue("episodeId", "");
    setQuery("");
  };

  const clearPatient = () => {
    setPickedPatient(null);
    setSelectedPatientId(null);
    form.setValue("patientId", "", { shouldValidate: true });
    form.setValue("episodeId", "");
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ appointment: AppointmentDto }>("/api/appointments", { method: "POST", json: body }),
    onSuccess: (data) => {
      toast.success(data.appointment.walkIn ? "Walk-in appointment booked" : "Appointment booked");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
    },
    onError: (err: Error) => form.setError("root", { message: err.message || "Could not book appointment" }),
  });

  const onSubmit = (values: FormValues) => {
    form.clearErrors("root");
    const startMin = timeToMinutes(values.startTime);
    const endMin = startMin + Number(values.duration);
    createMutation.mutate({
      patientId: values.patientId,
      episodeId: values.episodeId || undefined,
      therapistId: values.therapistId,
      date: values.date,
      startMin,
      endMin,
      purpose: values.purpose === "Other" ? (values.purposeOther || "Other") : values.purpose,
      notes: values.notes || undefined,
      walkIn: values.walkIn,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {errors.root?.message ? (
          <Alert variant="destructive">
            <AtomIcon name="AlertTriangle" className="h-4 w-4" />
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* patient picker */}
        <div className="space-y-1.5">
          <Label>Patient</Label>
          {effectivePatient ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{effectivePatient.firstName} {effectivePatient.lastName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {effectivePatient.patientCode}{effectivePatient.phone ? ` · ${effectivePatient.phone}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearPatient}>Change</Button>
            </div>
          ) : selectedPatientId ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
              <p className="truncate text-sm text-muted-foreground">Patient pre-selected (directory unavailable)</p>
              <Button type="button" variant="ghost" size="sm" onClick={clearPatient}>Change</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by name, code or phone…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {query.trim().length > 0 ? (
                <div className="custom-scrollbar max-h-44 overflow-y-auto rounded-md border bg-white">
                  {search.isFetching ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                  ) : (search.data?.length || 0) > 0 ? (
                    search.data!.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickPatient(p)}
                        className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{p.firstName} {p.lastName}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</span>
                        </span>
                        <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  ) : search.isError ? (
                    <p className="px-3 py-2 text-xs text-amber-700">Patient directory unavailable — pick the patient from the Patients module.</p>
                  ) : (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No patients matched “{query.trim()}”.</p>
                  )}
                </div>
              ) : null}
            </>
          )}
          {errors.patientId ? <p className="text-xs font-medium text-destructive">{errors.patientId.message}</p> : null}
        </div>

        {/* episode */}
        <FormField
          control={form.control}
          name="episodeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Episode (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined} disabled={!selectedPatientId}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder={selectedPatientId ? "Link a treatment episode" : "Select a patient first"} /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {openEpisodes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No open episodes for this patient</div>
                  ) : (
                    openEpisodes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* therapist */}
        <FormField
          control={form.control}
          name="therapistId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Physiotherapist</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select therapist" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {therapists.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No therapists available</div>
                  ) : (
                    therapists.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}{t.jobTitle ? ` — ${t.jobTitle}` : ""}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* date + time + duration */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start time</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* purpose */}
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[...APPOINTMENT_PURPOSES, "Other"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {purpose === "Other" ? (
          <FormField
            control={form.control}
            name="purposeOther"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Describe purpose</FormLabel>
                <FormControl><Input placeholder="e.g. Home exercise review" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {/* notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl><Textarea rows={2} placeholder="Anything the therapist should know…" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* walk-in */}
        <FormField
          control={form.control}
          name="walkIn"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <FormLabel className="!mt-0 text-sm font-normal">Walk-in patient (no prior booking)</FormLabel>
            </FormItem>
          )}
        />

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Booking…" : "Book appointment"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
