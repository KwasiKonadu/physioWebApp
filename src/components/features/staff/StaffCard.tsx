"use client";
// Staff card used by the grid view of the staff directory.
import { StatusBadge } from "@/components/atoms/status-badge";
import { ProfileCard } from "@/components/molecules/profile-card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import type { StaffListItem } from "./StaffPage";

export const STAFF_ROLE_TONES: Record<string, string> = {
  ADMIN: "bg-navy-50 text-navy-800 border-navy-200",
  PHYSIOTHERAPIST: "bg-navy-50 text-navy-800 border-navy-200",
  RECEPTIONIST: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGEMENT: "bg-amber-50 text-amber-700 border-amber-200",
};

export function StaffCard({ staff: s, onOpen }: { staff: StaffListItem; onOpen: (id: string) => void }) {
  const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();
  const account = !s.hasAccount ? "No login" : s.accountActive ? "Login active" : "Login deactivated";
  return (
    <ProfileCard
      initials={initials}
      name={s.name}
      code={s.staffCode}
      status={<StatusBadge status={s.employmentStatus} />}
      subtitle={`${s.jobTitle}${s.department ? ` · ${s.department}` : ""}`}
      details={[
        { icon: "Phone", text: s.phone || "—" },
        { icon: "Mail", text: s.email || "—" },
        { icon: "CalendarDays", text: s.employmentDate ? formatDate(s.employmentDate) : "—" },
        { icon: s.hasAccount ? "Link2" : "Link2Off", text: account },
      ]}
      footer={<Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>}
      onOpen={() => onOpen(s.id)}
    />
  );
}
