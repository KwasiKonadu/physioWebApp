"use client";
// MOLECULE: table pagination footer (client-side or server-driven)
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtomIcon } from "@/components/atoms/icon";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface TablePaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** toolbar-style standalone bar (used under card grids) instead of a table footer */
  standalone?: boolean;
}

export function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, standalone }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn(
      "flex flex-wrap items-center justify-between gap-3",
      standalone ? "min-h-11.5 rounded-lg border bg-white p-1.5 pl-3" : "border-t border-slate-200 bg-slate-50/80 px-4 py-2.5"
    )}>
      <p className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-800">{from}–{to}</span> of <span className="font-semibold text-slate-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8! w-27.5 bg-white text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg bg-white" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <AtomIcon name="ChevronLeft" className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-xs font-medium text-slate-500">Page {page} of {totalPages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg bg-white" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <AtomIcon name="ChevronRight" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
