"use client";
// Patient profile: episodes tab.

import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { type EpisodeDto } from "./hooks";
import EpisodeCard from "./EpisodeCard";
import type { PatientBundle } from "./hooks";

export function EpisodesTab({ bundle, canClinicalManage, invalidate, name, patient, patientId, setNewEpisodeOpen }: { bundle: PatientBundle; canClinicalManage: boolean; invalidate: () => void; name: string; patient: PatientBundle["patient"]; patientId: string; setNewEpisodeOpen: (v: boolean) => void }) {
  return (
    <TabsContent value="episodes" className="space-y-4">
      <SectionCard
        title="Treatment episodes"
        icon="Stethoscope"
        description="Each episode is a distinct course of care — holds, sessions and reviews are tracked per episode."
        actions={
          canClinicalManage ? (
            <Button size="sm" onClick={() => setNewEpisodeOpen(true)}>
              <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> New episode
            </Button>
          ) : undefined
        }
      >
        {bundle.episodes.length === 0 ? (
          <EmptyState
            icon="Stethoscope"
            title="No episodes yet"
            description="Open a treatment episode to start the clinical workflow for this patient."
            action={canClinicalManage ? <Button onClick={() => setNewEpisodeOpen(true)}>New episode</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {bundle.episodes.map((ep: EpisodeDto) => (
              <EpisodeCard key={ep.id} episode={ep} patientId={patientId} onChanged={invalidate} />
            ))}
          </div>
        )}
      </SectionCard>
    </TabsContent>
  );
}
