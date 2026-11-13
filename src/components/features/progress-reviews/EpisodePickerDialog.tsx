"use client";
// FEATURE: episode picker dialog — shared by progress reviews (early review) and discharges
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { fullName } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AtomIcon } from "@/components/atoms/icon";
import { StatusBadge } from "@/components/atoms/status-badge";
import { EmptyState } from "@/components/molecules/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { PickerEpisode } from "./types";

interface EpisodePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: "/api/reviews/episodes" | "/api/discharges/episodes";
  title: string;
  description?: string;
  preselectedEpisodeId?: string | null;
  onPicked: (episode: PickerEpisode) => void;
}

export function EpisodePickerDialog({ open, onOpenChange, endpoint, title, description, preselectedEpisodeId, onPicked }: EpisodePickerDialogProps) {
  const [q, setQ] = useState("");

  const handleOpenChange = (o: boolean) => {
    if (!o) setQ("");
    onOpenChange(o);
  };

  const query = useQuery({
    queryKey: ["picker-episodes", endpoint, q, preselectedEpisodeId, open],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (!q.trim() && preselectedEpisodeId) params.set("episodeId", preselectedEpisodeId);
      return apiFetch<{ items: PickerEpisode[] }>(`${endpoint}?${params.toString()}`);
    },
    enabled: open,
  });

  const items = query.data?.items || [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="relative">
          <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient name, code or episode…" className="pl-8" />
        </div>
        <div className="custom-scrollbar max-h-80 space-y-2 overflow-y-auto">
          {query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon="FolderOpen" title="No open episodes found" description={q ? "Try a different search term." : "No episodes currently open."} />
          ) : (
            items.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => { onOpenChange(false); onPicked(ep); }}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{fullName(ep.patient)}</p>
                  <StatusBadge status={ep.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {ep.patient.patientCode} · {ep.title}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><AtomIcon name="Activity" className="h-3 w-3" />{ep.totalCompletedSessions} sessions</span>
                  <span className="inline-flex items-center gap-1"><AtomIcon name="TrendingUp" className="h-3 w-3" />{ep.sessionsSinceReview}/{ep.reviewThreshold} since review</span>
                  {ep.therapist ? <span>{ep.therapist.firstName} {ep.therapist.lastName}</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
