"use client";
// MOLECULE: page header — renders the title, actions and tabs/filters into the sticky TopBar
import { AtomIcon } from "@/components/atoms/icon";
import { TopBarActions, TopBarTabs, TopBarTitle } from "@/components/templates/topbar-slots";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export function PageHeader({ title, description, icon, actions, filters }: PageHeaderProps) {
  return (
    <>
      <TopBarTitle>
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary sm:flex">
              <AtomIcon name={icon} className="h-5 w-5" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground md:text-xl">{title}</h1>
            {description ? <p className="truncate text-xs text-muted-foreground md:text-sm">{description}</p> : null}
          </div>
        </div>
      </TopBarTitle>
      {actions ? <TopBarActions><div className="flex flex-wrap items-center justify-end gap-2">{actions}</div></TopBarActions> : null}
      {filters ? <TopBarTabs><div className="flex flex-wrap items-center gap-2">{filters}</div></TopBarTabs> : null}
    </>
  );
}
