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
    <div role="group" aria-label="Change view" className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground">
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
              "flex h-7! w-9 items-center justify-center rounded-md border border-transparent transition-[color,box-shadow]",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <AtomIcon name={o.icon} className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
