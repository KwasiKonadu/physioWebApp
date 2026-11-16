"use client";
// MOLECULE: responsive card grid — auto-fills as many columns as fit, each at least `minItemWidth` wide.
// Reusable for any list shown as cards (patients, staff, packages …).
import { cn } from "@/lib/utils";

interface CardGridProps {
  children: React.ReactNode;
  /** Minimum card width in px before the grid drops a column. */
  minItemWidth?: number;
  /** Gap between cards in px. */
  gap?: number;
  className?: string;
}

export function CardGrid({ children, minItemWidth = 280, gap = 16, className }: CardGridProps) {
  return (
    <div
      className={cn("grid", className)}
      style={{
        gap,
        // min(100%, N) keeps a single column from overflowing on very narrow screens
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minItemWidth}px), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
