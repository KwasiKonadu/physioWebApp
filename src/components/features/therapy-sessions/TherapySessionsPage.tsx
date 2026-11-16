"use client";
// FEATURE: Therapy Sessions — list + filters + stats + new-session dialog + documentation view
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";


import { useUIStore, type NavigateOpts } from "@/stores/app-store";















import { SessionsList } from "./SessionsList";


// ---- Page root: list ↔ documentation view ----
export default function TherapySessionsPage() {
  const router = useRouter();
  const [episodeFilter, setEpisodeFilter] = useState<string | null>(null);
  const clearOpts = useUIStore((s) => s.clearOpts);

  // Consume navOpts (sessionId / episodeId) via a store subscription so cross-module
  // navigation links open the right view; appointmentId opts are left for the
  // appointments module.
  useEffect(() => {
    const consume = (opts: NavigateOpts | null) => {
      if (!opts) return;
      if (opts.sessionId) router.push(`/therapy-sessions/${opts.sessionId}`);
      else if (opts.episodeId) setEpisodeFilter(opts.episodeId);
      else return;
      clearOpts();
    };
    consume(useUIStore.getState().navOpts);
    return useUIStore.subscribe((s, prev) => {
      if (s.navOpts !== prev.navOpts) consume(s.navOpts);
    });
  }, [clearOpts, router]);

  return (
    <SessionsList
      onOpen={(id) => router.push(`/therapy-sessions/${id}`)}
      episodeFilter={episodeFilter}
      onClearEpisodeFilter={() => setEpisodeFilter(null)}
    />
  );
}
