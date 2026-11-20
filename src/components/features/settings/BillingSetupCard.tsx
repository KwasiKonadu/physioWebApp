"use client";
// Settings: billing setup summary card.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore } from "@/stores/app-store";
import type { SettingsData } from "./settings-types";

export function BillingSetupCard() {
  const navigate = useUIStore((s) => s.navigate);
  // shares the ["settings"] cache entry with SettingsPage — no extra requests
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiFetch<SettingsData>("/api/settings") });
  const counts = settings.data?.billingCounts;

  const tiles = [
    { tab: "services", icon: "Briefcase", label: "Services", total: counts?.services, sub: counts ? `${counts.serviceCategories} categories` : "price list" },
    { tab: "packages", icon: "Package", label: "Packages", total: counts?.packages, sub: "session bundles" },
    { tab: "insurance", icon: "ShieldCheck", label: "Insurance providers", total: counts?.providers, sub: "rates & claims" },
  ];

  return (
    <SectionCard title="Services, Packages & Insurance" icon="Receipt" description="Set up in the billing module — open one to add or edit">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.tab}
            type="button"
            onClick={() => navigate("billing", { focusTab: t.tab })}
            className="group flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-navy-600/60 hover:bg-navy-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
              <AtomIcon name={t.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              {settings.isLoading ? (
                <Skeleton className="mb-1 h-5 w-10" />
              ) : (
                <span className="block text-xl font-semibold leading-tight">{t.total ?? "—"}</span>
              )}
              <span className="block truncate text-sm font-medium">{t.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.sub}</span>
            </span>
            <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
