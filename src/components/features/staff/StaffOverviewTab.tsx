"use client";
// Staff profile: overview tab.

import { labelize } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { STAFF_ROLE_TONES } from "./StaffCard";
import { StaffDetail, StatsResponse } from "./staff-profile-model";

export function StaffOverviewTab({ data, s, stats, name }: { data: StaffDetail; s: StaffDetail["staff"]; stats: StatsResponse | undefined; name: string }) {
  return (
    <TabsContent value="overview" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {s.isTherapist ? (
          <>
            <StatCard label="Active episodes" value={data.stats.activeEpisodes} icon="GitBranch" tone="navy" />
            <StatCard label="Completed sessions" value={data.stats.completedSessions} icon="Activity" tone="teal" hint="all time" />
            <StatCard label="Unique patients" value={data.stats.uniquePatients} icon="Users" tone="sky" hint="all time" />
          </>
        ) : (
          <StatCard label="Role" value={labelize(s.staffRole)} icon="BadgeCheck" tone="navy" />
        )}
        <StatCard label="Employed since" value={s.employmentDate ? formatDate(s.employmentDate) : "—"} icon="CalendarDays" tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Employment details" icon="Briefcase" className="flex-1">
          <DetailGrid cols={1}>
            <DetailRow label="Full name" value={name} />
            <DetailRow label="Staff ID" value={<span className="font-mono text-xs">{s.staffCode}</span>} />
            <DetailRow label="Job title" value={s.jobTitle} />
            <DetailRow label="Department" value={s.department} />
            <DetailRow label="Role" value={<Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>} />
            <DetailRow label="Status" value={<StatusBadge status={s.employmentStatus} />} />
            <DetailRow label="Branch" value={data.branchName} />
            <DetailRow label="Employed since" value={s.employmentDate ? formatDate(s.employmentDate) : undefined} />
            <DetailRow label="Email" value={s.email} />
            <DetailRow label="Phone" value={s.phone} />
            <DetailRow label="Therapist" value={s.isTherapist ? "Yes — workload tracked" : "No"} />
          </DetailGrid>
        </SectionCard>

        <div className="flex flex-col gap-4">
          <SectionCard title="Qualifications" icon="GraduationCap">
            {s.professionalDesignation || s.specialization || s.qualifications.length > 0 ? (
              <div className="space-y-2">
                {s.professionalDesignation ? <p className="text-sm"><span className="text-muted-foreground">Designation:</span> {s.professionalDesignation}</p> : null}
                {s.specialization ? <p className="text-sm"><span className="text-muted-foreground">Specialization:</span> {s.specialization}</p> : null}
                {s.qualifications.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.qualifications.map((q, i) => <Badge key={i} variant="outline" className="bg-muted/50 font-normal">{q}</Badge>)}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No qualifications recorded.</p>
            )}
          </SectionCard>

          <SectionCard title="Availability" icon="Clock" className="flex-1">
            {s.availability.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {s.availability.map((a, i) => (
                  <Badge key={i} variant="outline" className="border-navy-200 bg-navy-50 font-normal text-navy-800">
                    {a.day} {a.start || ""}{a.end ? `–${a.end}` : ""}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No availability set.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </TabsContent>
  );
}
