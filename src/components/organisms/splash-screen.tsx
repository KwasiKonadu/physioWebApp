"use client";
// ORGANISM: full-screen splash shown right after login while the first pages load.
// Same navy background as the login screen's brand panel.
import { cn } from "@/lib/utils";

export function SplashScreen({ leaving }: { leaving?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "fixed inset-0 z-100 flex flex-col items-center justify-center overflow-hidden bg-navy-900 transition-opacity duration-300",
        leaving && "pointer-events-none opacity-0"
      )}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative flex animate-in flex-col items-center gap-5 duration-500 fade-in zoom-in-95">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <img src="/appicon.svg" alt="" className="h-10 w-10" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">GMRS Physiotherapy</p>
          <p className="mt-0.5 text-xs text-slate-400">Clinic Management System</p>
        </div>
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="splash-bar h-full w-1/3 rounded-full bg-teal-400" />
        </div>
      </div>
    </div>
  );
}
