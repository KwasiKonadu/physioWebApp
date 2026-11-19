"use client";
// ORGANISM: full-screen splash shown right after login while the first pages load.
// Same navy background as the login screen's brand panel.
import { useState } from "react";
import { cn } from "@/lib/utils";

// Heart monitor traces. Each loop of the animation picks a different one at random.
const BASE = 40;
// One heartbeat starting at x, straight edges only: small bump, tall spike with a deep dip, then two small bumps.
// amp scales the heights, w stretches it sideways.
function beat(x: number, amp = 1, w = 1) {
  const pts: [number, number][] = [
    [0, 0], [4, 0], [7, -9], [10, 0], [15, 0], // small bump
    [20, -32], [25, 20], [29, 0], [33, 0], // spike and dip
    [36, -7], [39, 0], [43, 0], [46, -10], [49, 0], [53, 0], // two small bumps
  ];
  return pts.map(([dx, dy]) => `L${+(x + dx * w).toFixed(1)} ${+(BASE + dy * amp).toFixed(1)}`).join(" ") + " ";
}
const TRACES = {
  // steady resting rhythm, beats of different heights
  sinus: `M0 ${BASE} ${beat(30, 1)}${beat(130, 0.7)}${beat(230, 1.1)}L300 ${BASE}`,
  // fast, tight beats
  rapid: `M0 ${BASE} ${beat(10, 0.8, 0.7)}${beat(70, 1, 0.7)}${beat(130, 0.6, 0.7)}${beat(190, 0.9, 0.7)}${beat(250, 0.75, 0.7)}L300 ${BASE}`,
  // slow, tall, wide beats
  strong: `M0 ${BASE} ${beat(20, 1.2, 1.4)}${beat(160, 0.85, 1.4)}L300 ${BASE}`,
} as const;
const KEYS = Object.keys(TRACES) as (keyof typeof TRACES)[];

export function SplashScreen({ leaving }: { leaving?: boolean }) {
  // random first trace (safe here: the splash only renders client-side, after login)
  const [trace, setTrace] = useState<keyof typeof TRACES>(() => KEYS[Math.floor(Math.random() * KEYS.length)]);
  // the trace is invisible when a loop restarts, so swap to a different one then
  const next = () =>
    setTrace((cur) => {
      const others = KEYS.filter((k) => k !== cur);
      return others[Math.floor(Math.random() * others.length)];
    });

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "fixed inset-0 z-100 flex flex-col items-center justify-center overflow-hidden bg-navy-900 transition-opacity duration-300",
        leaving && "pointer-events-none opacity-0"
      )}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-navy-800/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-navy-800/10 blur-3xl" />

      <div className="relative flex animate-in flex-col items-center gap-5 duration-500 fade-in zoom-in-95">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <img src="/appicon.svg" alt="" className="h-10 w-10" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">GMRS Physiotherapy</p>
          <p className="mt-0.5 text-xs text-slate-400">Clinic Management System</p>
        </div>
        <svg viewBox="0 0 300 80" className="h-16 w-64" aria-hidden="true">
          <path d={`M0 ${BASE} H300`} stroke="white" strokeOpacity="0.08" strokeWidth="1" fill="none" />
          <path
            key={trace}
            d={TRACES[trace]}
            pathLength={1}
            className="ecg-trace"
            onAnimationIteration={next}
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
