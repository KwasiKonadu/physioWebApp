"use client";
// MOLECULE: breadcrumb shown at the top of detail pages, just below the top bar.
// Format: previous page > current page. Earlier items are clickable; the last one is the current page.
import { Fragment } from "react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList className="gap-1.5 text-sm sm:gap-2">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem>
                {last || !c.onClick ? (
                  <BreadcrumbPage className="font-semibold text-slate-800">{c.label}</BreadcrumbPage>
                ) : (
                  <button type="button" onClick={c.onClick} className="font-medium text-slate-500 transition-colors hover:text-teal-700">
                    {c.label}
                  </button>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
