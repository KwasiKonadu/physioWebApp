"use client";
// Booking form: patient, episode, therapist, time, purpose — with conflict handling.
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { timeToMinutes } from "@/lib/format";
import { APPOINTMENT_PURPOSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AtomIcon } from "@/components/atoms/icon";
import { AppointmentDto, TherapistOption } from "./appointments-shared";
import { PackageBalanceNotice } from "../patients/PackageBalanceNotice";
import { DURATIONS, OPEN_EPISODE_BLOCKED, PatientOption, EpisodeOption, formSchema, FormValues, extractBundle } from "./booking-shared";
import { BookingPatientPicker } from "./BookingPatientPicker";

export function BookingForm({ onDone, presetPatientId, presetWalkIn, defaultDate, therapists }: {
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
        const res = await apiFetch<unknown>(`/api/patients/${selectedPatientId}?view=summary`);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <SidePanelBody className="space-y-4">
        {errors.root?.message ? (
          <Alert variant="destructive">
            <AtomIcon name="AlertTriangle" className="h-4 w-4" />
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        ) : null}

        <BookingPatientPicker
          effectivePatient={effectivePatient}
          selectedPatientId={selectedPatientId}
          query={query}
          onQueryChange={setQuery}
          search={search}
          onPick={pickPatient}
          onClear={clearPatient}
          error={errors.patientId?.message}
        />

        <PackageBalanceNotice patientId={selectedPatientId} />

        {/* episode + physiotherapist */}
        <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
        <FormField
          control={form.control}
          name="episodeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Episode (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined} disabled={!selectedPatientId}>
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue placeholder={selectedPatientId ? "Link a treatment episode" : "Select a patient first"} /></SelectTrigger>
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
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select therapist" /></SelectTrigger>
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

        </div>

        {/* date + start time + duration */}
        <div className="grid gap-3 sm:grid-cols-3 *:min-w-0">
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
        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
        </div>

        {/* purpose */}
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select purpose" /></SelectTrigger>
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
              <FormLabel className="mt-0! text-sm font-normal">Walk-in patient (no prior booking)</FormLabel>
            </FormItem>
          )}
        />

        </SidePanelBody>

        <SidePanelFooter className="justify-end">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Booking…" : "Book appointment"}
          </Button>
        </SidePanelFooter>
      </form>
    </Form>
  );
}
