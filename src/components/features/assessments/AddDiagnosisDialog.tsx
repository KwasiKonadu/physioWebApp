"use client";
// Add-diagnosis side panel.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIAGNOSIS_CATEGORIES, SEVERITIES, SIDES, BODY_PARTS, labelize } from "@/lib/constants";
import { fullName } from "@/lib/format";
import * as API from "./assessments-api";
import { PatientSearchSelect } from "./PatientSearchSelect";
import { Field } from "./DiagnosisShared";

// ===================== add diagnosis =====================
export function AddDiagnosisDialog({ open, onOpenChange, onSaved }: {
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
    <SidePanel
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      size="lg"
      title="Add diagnosis"
      description="Multiple diagnoses may coexist on an episode (primary vs secondary)."
    >
      <SidePanelBody>
        <div className="space-y-4">
          <Field label="Patient">
            <PatientSearchSelect autoFocus selected={patient} onSelect={(p) => { setPatient(p); setEpisodeId(""); }} onClear={() => { setPatient(null); setEpisodeId(""); }} />
          </Field>
          {patient ? (
            <Field label="Episode">
              <Select value={episodeId || undefined} onValueChange={setEpisodeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select episode…" /></SelectTrigger>
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
          <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
            <Field label="Category">
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Category…" /></SelectTrigger>
                <SelectContent>{DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Body part">
              <Select value={bodyPart || undefined} onValueChange={setBodyPart}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Body part…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Affected side">
              <Select value={affectedSide || undefined} onValueChange={setAffectedSide}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Side…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={severity || undefined} onValueChange={setSeverity}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Severity…" /></SelectTrigger>
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
                <SelectTrigger className="w-full"><SelectValue placeholder={therapistsQ.data[0] ? `Default: ${fullName(therapistsQ.data[0])}` : "Therapist…"} /></SelectTrigger>
                <SelectContent>
                  {therapistsQ.data.map((t) => <SelectItem key={t.id} value={t.id}>{fullName(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
      </SidePanelBody>
      <SidePanelFooter className="justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={createQ.isPending} onClick={submit}>{createQ.isPending ? "Saving…" : "Add diagnosis"}</Button>
      </SidePanelFooter>
    </SidePanel>
  );
}
