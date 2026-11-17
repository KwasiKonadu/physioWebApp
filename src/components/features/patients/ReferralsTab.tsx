"use client";
// Patient profile: referrals tab.

import { formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import type { PatientBundle } from "./hooks";

export function ReferralsTab({ bundle, patient }: { bundle: PatientBundle; patient: PatientBundle["patient"] }) {
  return (
    <TabsContent value="referrals">
      <SectionCard title="Referrals" icon="Share2" description="How this patient came to the clinic.">
        {bundle.referrals.length === 0 ? (
          <EmptyState icon="Share2" title="No referrals recorded" />
        ) : (
          <ul className="space-y-3">
            {bundle.referrals.map((r) => (
              <li key={r.id} className="rounded-lg border px-3 py-3">
                <div className="toolbar-row">
                  <Badge variant="outline" className="border-slate-200 bg-navy-50 text-navy-800">{labelize(r.source)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(r.referralDate)}</span>
                </div>
                <div className="mt-2">
                  <DetailGrid cols={2}>
                    <DetailRow label="Referrer" value={r.referrerName} />
                    <DetailRow label="Contact" value={r.referrerContact} />
                    <DetailRow label="Notes" value={r.notes} />
                  </DetailGrid>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </TabsContent>
  );
}
