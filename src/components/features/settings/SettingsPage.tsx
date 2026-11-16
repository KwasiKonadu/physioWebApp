"use client";
// FEATURE: Settings — clinic info, users & roles, configuration, audit log
import { TopBarTabs } from "@/components/templates/topbar-slots";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/molecules/page-header";
import { EmptyState } from "@/components/molecules/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import SettingsUsersTab from "./settings-users-tab";
import SettingsAuditTab from "./settings-audit-tab";
import type { SettingsData, TabKey } from "./settings-types";
import { ClinicTab } from "./ClinicTab";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);
  const canManage = hasPermission(user, PERMS.settingsManage);

  const [tab, setTab] = useState<TabKey>("clinic");
  const [highlightEmail, setHighlightEmail] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsData>("/api/settings"),
    enabled: canManage,
  });

  // Deep-link: focusTab "account" → Users & Roles tab with own account highlighted
  useEffect(() => {
    if (navOpts?.focusTab === "account") {
      const t = setTimeout(() => {
        setTab("users");
        setHighlightEmail(user?.email || null);
        clearOpts();
        toast.info("Your account is highlighted in the users list");
      }, 0);
      return () => clearTimeout(t);
    }
  }, [navOpts, clearOpts, user?.email]);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Settings" description="Clinic configuration" icon="Settings" />
        <EmptyState icon="Lock" title="No access" description="You do not have permission to manage settings." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Clinic profile and configuration, users & roles, and the audit trail"
        icon="Settings"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TopBarTabs>
        <TabsList className="flex-wrap">
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="users">Users &amp; Roles</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
        </TopBarTabs>

        <TabsContent value="clinic" className="mt-0 space-y-5">
          {isLoading || !data ? <Skeleton className="h-72 w-full" /> : <ClinicTab data={data} />}
        </TabsContent>

        <TabsContent value="users" className="mt-0">
          <SettingsUsersTab highlightEmail={highlightEmail} />
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <SettingsAuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Branches ----------------
