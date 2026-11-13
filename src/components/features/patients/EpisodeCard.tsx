"use client";
// ============ Episode card: progress, hold/resume/discontinue actions, cross-module nav ============
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { formatDate, fullName } from "@/lib/format";
import { PERMS } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { EpisodeDto } from "./hooks";

const OPEN_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"];

interface Props {
  episode: EpisodeDto;
  patientId: string;
  onChanged: () => void;
}

export default function EpisodeCard({ episode, patientId, onChanged }: Props) {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [holdNotes, setHoldNotes] = useState("");
  const [discontinueOpen, setDiscontinueOpen] = useState(false);
  const [discontinueReason, setDiscontinueReason] = useState("");

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<EpisodeDto>(`/api/episodes/${episode.id}`, { method: "PATCH", json: body }),
    onSuccess: (_data, variables) => {
      const action = (variables as { action?: string }).action;
      if (action === "place_on_hold") toast.success("Episode placed on hold");
      else if (action === "resume") toast.success("Episode resumed");
      else if (action === "discontinue") toast.success("Episode discontinued");
      else toast.success("Episode updated");
      onChanged();
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  const isOpen = OPEN_STATUSES.includes(episode.status);
  const reviewPct = Math.min(100, Math.round(((episode.sessionsSinceReview || 0) / (episode.reviewThreshold || 15)) * 100));
  const therapistName = episode.therapist ? fullName({ firstName: episode.therapist.firstName, lastName: episode.therapist.lastName }) : null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">
              EP{String(episode.episodeNumber).padStart(2, "0")}
            </span>
            <h3 className="truncate text-sm font-semibold">{episode.title}</h3>
            <StatusBadge status={episode.status} />
            {episode.reviewDue && isOpen ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Review due</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Opened {formatDate(episode.openedDate)}
            {episode.closedDate ? ` · Closed ${formatDate(episode.closedDate)}` : ""}
            {therapistName ? ` · ${therapistName}` : " · No therapist assigned"}
            {episode._count ? ` · ${episode._count.sessions} sessions` : ""}
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {episode.status === "ON_HOLD" ? (
              <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ action: "resume" })}>
                <AtomIcon name="Play" className="mr-1.5 h-3.5 w-3.5" /> Resume
              </Button>
            ) : null}
            {isOpen && episode.status !== "ON_HOLD" ? (
              <Button size="sm" variant="outline" onClick={() => { setHoldReason(""); setHoldNotes(""); setHoldOpen(true); }}>
                <AtomIcon name="Pause" className="mr-1.5 h-3.5 w-3.5" /> Place on hold
              </Button>
            ) : null}
            {isOpen ? (
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-rose-50 hover:text-destructive" onClick={() => { setDiscontinueReason(""); setDiscontinueOpen(true); }}>
                <AtomIcon name="XCircle" className="mr-1.5 h-3.5 w-3.5" /> Discontinue
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" aria-label="Open in clinical module">
                  <AtomIcon name="ExternalLink" className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Open in clinical module</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("assessments", { episodeId: episode.id, patientId })}>
                  <AtomIcon name="ClipboardList" className="mr-2 h-4 w-4" /> Assessments
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("treatment-plans", { episodeId: episode.id, patientId })}>
                  <AtomIcon name="Map" className="mr-2 h-4 w-4" /> Treatment plans
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("therapy-sessions", { episodeId: episode.id, patientId })}>
                  <AtomIcon name="Activity" className="mr-2 h-4 w-4" /> Therapy sessions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("progress-reviews", { episodeId: episode.id, patientId })}>
                  <AtomIcon name="TrendingUp" className="mr-2 h-4 w-4" /> Progress reviews
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {/* review progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {episode.sessionsSinceReview}/{episode.reviewThreshold} sessions since last review
            {" · "}
            {episode.totalCompletedSessions} completed in total
          </span>
          <span>{reviewPct}%</span>
        </div>
        <Progress value={reviewPct} className="h-1.5" />
      </div>

      {/* hold history */}
      {episode.holdHistory.length > 0 ? (
        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AtomIcon name="PauseCircle" className="h-3.5 w-3.5" /> Hold history
          </p>
          <ul className="space-y-1">
            {episode.holdHistory.map((h, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{formatDate(h.date)}</span> — {h.reason}
                {h.notes ? ` · ${h.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {episode.notes ? (
        <p className="mt-3 text-xs text-muted-foreground"><span className="font-medium">Notes:</span> {episode.notes}</p>
      ) : null}

      {/* hold dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Place episode on hold</DialogTitle>
            <DialogDescription>
              Pause this episode — e.g. patient travelling, awaiting surgery. The reason is recorded in the hold history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)} rows={3} placeholder="Why is treatment on hold?" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={holdNotes} onChange={(e) => setHoldNotes(e.target.value)} placeholder="Optional, e.g. expected return date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button
              disabled={!holdReason.trim() || patch.isPending}
              onClick={() => patch.mutate({ action: "place_on_hold", reason: holdReason.trim(), notes: holdNotes.trim() || undefined })}
            >
              Place on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* discontinue confirm */}
      <AlertDialog open={discontinueOpen} onOpenChange={setDiscontinueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue episode?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently closes the episode as discontinued. Discharged and discontinued episodes cannot be reopened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Input value={discontinueReason} onChange={(e) => setDiscontinueReason(e.target.value)} placeholder="e.g. Patient relocated, declined treatment" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={!discontinueReason.trim() || patch.isPending}
              onClick={(e) => {
                e.preventDefault();
                patch.mutate({ action: "discontinue", reason: discontinueReason.trim() }, { onSuccess: () => setDiscontinueOpen(false) });
              }}
            >
              Discontinue episode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
