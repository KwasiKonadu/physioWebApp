"use client";
// Shared types, therapist lookup hook and small badges for the sessions list.

import { useQuery } from "@tanstack/react-query";
import { useTherapistOptions } from "@/components/features/staff/use-therapists";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---- Types ----
export interface SessionListItem {
  id: string;
  episodeId: string;
  patientId: string;
  therapistId: string;
  appointmentId: string | null;
  date: string;
  timeMin: number | null;
  durationMin: number | null;
  status: string;
  painLevel: number | null;
  episode: {
    id: string;
    title: string;
    status: string;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { patientCode: string; firstName: string; lastName: string };
  };
  therapist: { firstName: string; lastName: string } | null;
  interventions: { id: string; name: string; details: string | null }[];
  appointment: { id: string; date: string; startMin: number } | null;
}

export interface SessionsListResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: { completed: number; planned: number; today: number };
}

export interface TherapistOption {
  id: string;
  name: string;
  isTherapist: boolean;
}

export interface PatientOption {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  currentStatus?: string | null;
}

export interface EpisodeOption {
  id: string;
  title: string;
  status: string;
  episodeNumber?: number;
  therapistId?: string | null;
}

// ---- Shared hooks ----
const toSessionTherapists = (items: { id: string; firstName: string; lastName: string }[]): TherapistOption[] =>
  items.map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}`.trim(), isTherapist: true })).filter((t) => t.id && t.name);

export function useTherapists() {
  return useTherapistOptions(toSessionTherapists);
}

export function PainBadge({ level }: { level: number | null }) {
  if (level === null || level === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    level <= 3
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : level <= 6
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <Badge variant="outline" className={cn("font-medium", tone)}>
      {level}/10
    </Badge>
  );
}

export function ReviewProgress({ since, threshold, due }: { since: number; threshold: number; due: boolean }) {
  const pct = threshold > 0 ? Math.min(100, Math.round((since / threshold) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 w-14" />
      <span className={cn("text-xs tabular-nums", due ? "font-semibold text-amber-600" : "text-muted-foreground")}>
        {since}/{threshold}
      </span>
      {due ? <AtomIcon name="AlertTriangle" className="h-3.5 w-3.5 text-amber-500" /> : null}
    </div>
  );
}
