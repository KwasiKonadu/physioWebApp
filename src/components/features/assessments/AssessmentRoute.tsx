"use client";
// Route wrapper for a single assessment: /assessments/[id] (open / continue) and /assessments/new (start).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import AssessmentForm, { type AssessmentFormTarget } from "./AssessmentForm";

export default function AssessmentRoute({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [target, setTarget] = useState<AssessmentFormTarget>(() => {
    if (id) return { assessmentId: id };
    // client-only component (the app shell is not server-rendered), so window is available
    const q = new URLSearchParams(window.location.search);
    return { patientId: q.get("patientId") || undefined, episodeId: q.get("episodeId") || undefined };
  });

  const toList = () => router.push("/assessments");

  return (
    <AssessmentForm
      target={target}
      // a new assessment becomes a draft once saved: show its own URL without remounting the form
      onTargetChange={(t) => {
        setTarget(t);
        if (t.assessmentId) window.history.replaceState(null, "", `/assessments/${t.assessmentId}`);
      }}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: ["assessments"] });
        void qc.invalidateQueries({ queryKey: ["patients"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
        toList();
      }}
      onBack={() => {
        void qc.invalidateQueries({ queryKey: ["assessments"] });
        toList();
      }}
    />
  );
}
