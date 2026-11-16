"use client";
// Route wrapper for single-plan pages:
//   /treatment-plans/new            → create (patient & episode chosen in a pop-up)
//   /treatment-plans/[id]           → detail
//   /treatment-plans/[id]/edit      → edit draft
//   /treatment-plans/[id]/revise    → revise
import { useRouter, useSearchParams } from "next/navigation";
import { PlanDetail } from "./PlanDetail";
import { PlanForm } from "./PlanForm";

type Kind = "new" | "detail" | "edit" | "revise";

export default function PlanRoute({ kind, id }: { kind: Kind; id?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toList = () => router.push("/treatment-plans");

  if (kind === "detail" && id) {
    return (
      <PlanDetail
        planId={id}
        onBack={toList}
        onEdit={() => router.push(`/treatment-plans/${id}/edit`)}
        onRevise={() => router.push(`/treatment-plans/${id}/revise`)}
        onOpenVersion={(vid) => router.push(`/treatment-plans/${vid}`)}
      />
    );
  }

  const mode = kind === "new" ? "create" : kind;
  const title = kind === "new" ? "New treatment plan" : kind === "edit" ? "Edit plan draft" : "Revise treatment plan";
  const subtitle = kind === "new"
    ? "Define objectives, milestones, interventions and precautions"
    : kind === "edit"
      ? "Draft plans can be edited freely until activated"
      : "Creates a new draft version — the currently active plan stays governing until you activate the revision";

  return (
    <PlanForm
      mode={mode as "create" | "edit" | "revise"}
      title={title}
      subtitle={subtitle}
      sourcePlanId={id || null}
      preselectPatientId={params.get("patientId") || undefined}
      preselectEpisodeId={params.get("episodeId") || undefined}
      onDone={(plan) => router.push(`/treatment-plans/${plan.id}`)}
      onCancel={() => (id ? router.push(`/treatment-plans/${id}`) : toList())}
    />
  );
}
