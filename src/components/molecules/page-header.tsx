"use client";
// MOLECULE: page header — renders actions and tabs/filters into the sticky TopBar (no visible title)
import { TopBarActions, TopBarTabs } from "@/components/templates/topbar-slots";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export function PageHeader({ actions, filters }: PageHeaderProps) {
  return (
    <>
      {actions ? <TopBarActions><div className="flex flex-wrap items-center justify-end gap-2">{actions}</div></TopBarActions> : null}
      {filters ? <TopBarTabs><div className="flex flex-wrap items-center gap-2">{filters}</div></TopBarTabs> : null}
    </>
  );
}
