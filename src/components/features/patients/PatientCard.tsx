"use client";
// Patient card used by the grid view of the patients directory.
import { StatusBadge } from "@/components/atoms/status-badge";
import { ProfileCard } from "@/components/molecules/profile-card";
import { Badge } from "@/components/ui/badge";
import { calcAge, formatDate, fullName, initials } from "@/lib/format";
import { labelize } from "@/lib/constants";
import type { PatientListItem } from "./hooks";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-navy-50 text-navy-800 border-navy-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

export function PatientCard({ patient: p, onOpen }: { patient: PatientListItem; onOpen: (id: string) => void }) {
  const name = fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName });
  return (
    <ProfileCard
      initials={initials(name)}
      name={name}
      code={p.patientCode}
      status={<StatusBadge status={p.currentStatus} />}
      subtitle={p.activeEpisodeTitle}
      details={[
        { icon: "Phone", text: p.phone || "—" },
        { icon: "User", text: `${p.gender ? labelize(p.gender) : "—"} · ${calcAge(p.dateOfBirth)}` },
        { icon: "Stethoscope", text: p.assignedTherapist?.name || "Unassigned" },
        { icon: "CalendarDays", text: formatDate(p.createdAt) },
      ]}
      footer={<Badge variant="outline" className={PAYMENT_TONES[p.paymentArrangement] || ""}>{labelize(p.paymentArrangement)}</Badge>}
      onOpen={() => onOpen(p.id)}
    />
  );
}
