"use client";
// ============ AssessmentsPage: clinical assessments + diagnoses module (default export) ============
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";



import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/molecules/page-header";





import { AtomIcon } from "@/components/atoms/icon";
import { PERMS } from "@/lib/constants";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import type { AssessmentFormTarget } from "./AssessmentForm";
import { AssessmentsList } from "./AssessmentsList";
import DiagnosesTab from "./DiagnosesTab";

export default function AssessmentsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);

  const [tab, setTab] = useState<"assessments" | "diagnoses">("assessments");

  // consume navigation options (e.g. patients page → start an assessment for an episode)
  useEffect(() => {
    if (!navOpts) return;
    // one-shot navigation hint from another page: switch tab, then clear it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (navOpts.focusTab === "diagnoses") setTab("diagnoses");
    if (navOpts.episodeId) {
      const q = new URLSearchParams();
      if (navOpts.patientId) q.set("patientId", navOpts.patientId);
      q.set("episodeId", navOpts.episodeId);
      router.push(`/assessments/new?${q.toString()}`);
    }
    clearOpts();
  }, [navOpts, clearOpts, router]);

  // open an existing assessment, or start a new one (own URLs: /assessments/[id], /assessments/new)
  const openForm = (target: AssessmentFormTarget) => {
    if (target.assessmentId) {
      router.push(`/assessments/${target.assessmentId}`);
      return;
    }
    const q = new URLSearchParams();
    if (target.patientId) q.set("patientId", target.patientId);
    if (target.episodeId) q.set("episodeId", target.episodeId);
    const qs = q.toString();
    router.push(qs ? `/assessments/new?${qs}` : "/assessments/new");
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "assessments" | "diagnoses")} className="space-y-1">
      <PageHeader
        title="Assessments"
        description="Clinical assessments and diagnoses for every treatment episode"
        icon="ClipboardList"
        filters={
          <TabsList>
            <TabsTrigger value="assessments"><AtomIcon name="ClipboardList" className="h-4 w-4" />Assessments</TabsTrigger>
            <TabsTrigger value="diagnoses"><AtomIcon name="FileText" className="h-4 w-4" />Diagnoses</TabsTrigger>
          </TabsList>
        }
      />
      <TabsContent value="assessments" className="mt-2">
        <AssessmentsList canManage={canManage} onOpen={openForm} />
      </TabsContent>
      <TabsContent value="diagnoses" className="mt-2">
        <DiagnosesTab />
      </TabsContent>
    </Tabs>
  );
}
