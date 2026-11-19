"use client";
// MOLECULE: the app's data table — card, sticky header, sortable columns, loading rows, empty state, pagination.
// Pages describe their columns and rows; the look lives here so every table in the app stays identical.
//
//   <DataTable
//     rows={items} rowKey={(r) => r.id} loading={q.isLoading}
//     columns={[{ id: "name", header: "Name", cell: (r) => r.name }, …]}
//     onRowClick={(r) => open(r.id)}
//     empty={<EmptyState … />}
//     pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
//   />
import { Fragment } from "react";
import { AtomIcon } from "@/components/atoms/icon";
import { TablePagination } from "@/components/molecules/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
  /** hide the column below this breakpoint */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** classes for both the header and body cells */
  className?: string;
  /** field name passed to `onSort` when the header is clicked */
  sortField?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  loadingRows?: number;
  /** shown in place of the rows when there are none (and not loading) */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** content for a full-width detail row shown under a row (return null/undefined for none) */
  expandedRow?: (row: T) => React.ReactNode;
  sort?: { field: string; order: "asc" | "desc" };
  onSort?: (field: string) => void;
  pagination?: {
    page: number; pageSize: number; total: number;
    onPageChange: (p: number) => void; onPageSizeChange?: (s: number) => void;
  };
  /** minimum table width before it scrolls sideways, e.g. "min-w-220" */
  minWidth?: string;
  /** vertical scroll limit; the header stays pinned while rows scroll */
  maxHeight?: string;
  /** render without the card border — for tables already inside a card */
  bare?: boolean;
  /** denser rows with small text — for measurement / form tables */
  compact?: boolean;
  /** add a rounded border around a bare table (e.g. inside a form section) */
  bordered?: boolean;
  className?: string;
}

const HIDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};
const ALIGN = { left: "", center: "text-center", right: "text-right" } as const;

export function DataTable<T>({
  rows, columns, rowKey, loading, loadingRows = 6, empty, onRowClick, rowClassName, expandedRow, sort, onSort, pagination,
  minWidth = "min-w-180", maxHeight = "max-h-150", bare, compact, bordered, className,
}: DataTableProps<T>) {
  const colClass = (c: DataColumn<T>) => cn(c.hideBelow && HIDE[c.hideBelow], ALIGN[c.align ?? "left"], c.className);

  return (
    <div className={cn(!bare && "overflow-hidden rounded-lg border bg-card", bare && bordered && "overflow-hidden rounded-lg border", className)}>
      {/* the outer div is the scroll container so the header can stick (the base Table has its own x-scroller) */}
      <div className={cn("overflow-auto custom-scrollbar **:data-[slot=table-container]:overflow-visible", compact && "[&_td]:text-xs [&_th]:text-xs [&_th]:whitespace-nowrap", maxHeight)}>
        <Table className={minWidth}>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.id} className={colClass(c)}>
                  {c.sortField && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sortField!)}
                      className={cn("inline-flex items-center gap-1 font-semibold hover:text-slate-800", c.align === "right" && "flex-row-reverse")}
                    >
                      {c.header}
                      {sort?.field === c.sortField ? <AtomIcon name={sort.order === "asc" ? "ArrowUp" : "ArrowDown"} className="h-3 w-3" /> : null}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: loadingRows }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.id} className={colClass(c)}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row, i) => (
                  <Fragment key={rowKey(row, i)}>
                    <TableRow
                      className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((c) => (
                        <TableCell key={c.id} className={colClass(c)}>{c.cell(row, i)}</TableCell>
                      ))}
                    </TableRow>
                    {expandedRow?.(row) ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columns.length} className="bg-slate-50 p-4">{expandedRow(row)}</TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && empty ? <div className="p-4">{empty}</div> : null}
      </div>
      {pagination ? <TablePagination {...pagination} /> : null}
    </div>
  );
}
