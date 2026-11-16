"use client";
// MOLECULE: side panel — a form / detail surface that slides in from the right.
// Intended for forms and record details across the app (use instead of centred dialogs).
//
//   <SidePanel open onOpenChange title="Appointment" description="…" size="md" headerExtra={<StatusBadge …/>}>
//     <SidePanelBody>…content…</SidePanelBody>
//     <SidePanelFooter>…buttons…</SidePanelFooter>
//   </SidePanel>
//
// The header stays fixed, the body scrolls, and the footer (optional) stays pinned at the bottom.
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type PanelSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<PanelSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-240",
};

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Badges / status shown next to the title. */
  headerExtra?: React.ReactNode;
  size?: PanelSize;
  className?: string;
  children: React.ReactNode;
}

export function SidePanel({ open, onOpenChange, title, description, headerExtra, size = "md", className, children }: SidePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full gap-0 p-0", SIZE[size], className)}>
        <div className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            {title}
            {headerExtra}
          </SheetTitle>
          {description ? (
            <SheetDescription className="mt-1 text-xs">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details panel</SheetDescription>
          )}
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Scrollable content area. */
export function SidePanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

/** Pinned action bar at the bottom of the panel. */
export function SidePanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3", className)}>
      {children}
    </div>
  );
}
