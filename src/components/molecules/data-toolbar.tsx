"use client";
// MOLECULE: search + filter toolbar for data tables
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AtomIcon } from "@/components/atoms/icon";

interface DataToolbarProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  filters?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: React.ReactNode;
}

export function DataToolbar({ search, filters, onRefresh, refreshing, children }: DataToolbarProps) {
  return (
    <div
      data-slot="data-toolbar"
      className="flex w-full flex-col gap-2 rounded-lg border bg-white p-1.5 sm:flex-row sm:flex-wrap sm:items-center [&_input]:h-8! [&_button:not([data-slot=tabs-trigger]):not([aria-pressed])]:h-8! [&_button]:text-xs [&_input]:text-xs [&_button[aria-label=Refresh]]:w-8"
    >
      {search ? (
        <div className="relative w-full sm:w-72">
          <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder || "Search…"}
            className="pl-8"
          />
        </div>
      ) : null}
      {filters}
      <div className="flex items-center gap-2 sm:ml-auto">
        {onRefresh ? (
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">
            <AtomIcon name="RefreshCw" className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        ) : null}
        {/* page actions: secondary controls first, the primary button is always last (far right) */}
        {children}
      </div>
    </div>
  );
}
