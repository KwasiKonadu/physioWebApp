"use client";
// MOLECULE: segmented toggle for switching a list between views (table / grid …), meant for DataToolbar.
import { AtomIcon } from "@/components/atoms/icon";
import { cn } from "@/lib/utils";

export interface ViewOption<T extends string> {
  value: T;
  label: string;
  icon: string;
}

interface ViewToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: ViewOption<T>[];
}

export function ViewToggle<T extends string>({ value, onChange, options }: ViewToggleProps<T>) {
  return (
    <div role="group" aria-label="Change view" className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={`${o.label} view`}
            aria-pressed={active}
            title={`${o.label} view`}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-8 items-center justify-center rounded-md transition-colors",
              active ? "bg-white text-navy-800 shadow-sm" : "text-slate-400 hover:text-slate-700"
            )}
          >
            <AtomIcon name={o.icon} className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
