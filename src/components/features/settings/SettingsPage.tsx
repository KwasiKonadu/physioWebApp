"use client";
// FEATURE: Settings — clinic info, users & roles, configuration, audit log
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import SettingsUsersTab from "./settings-users-tab";
import SettingsRolesTab from "./settings-roles-tab";
import SettingsAuditTab from "./settings-audit-tab";

interface ClinicInfo {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
}
interface BranchRow { id: string; name: string; address: string | null; phone: string | null; active: boolean }
interface SettingsData {
  clinic: ClinicInfo;
  branches: BranchRow[];
  settings: {
    reviewThreshold: number;
    appointmentSlotMin: number;
    workingHoursStart: string;
    workingHoursEnd: string;
    currency: string;
    timezone: string;
  };
}

type TabKey = "clinic" | "users" | "configuration" | "audit";

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
        description="Clinic profile, users & roles, configuration and audit trail"
        icon="Settings"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-5 flex-wrap">
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="users">Users &amp; Roles</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="mt-0 space-y-5">
          {isLoading || !data ? <Skeleton className="h-72 w-full" /> : <ClinicTab data={data} />}
        </TabsContent>

        <TabsContent value="users" className="mt-0 space-y-6">
          <SettingsUsersTab highlightEmail={highlightEmail} />
          <SettingsRolesTab />
        </TabsContent>

        <TabsContent value="configuration" className="mt-0 space-y-5">
          {isLoading || !data ? <Skeleton className="h-72 w-full" /> : <ConfigurationTab data={data} />}
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <SettingsAuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Clinic tab ----------------

function ClinicTab({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const [name, setName] = useState(data.clinic.name);
  const [address, setAddress] = useState(data.clinic.address || "");
  const [phone, setPhone] = useState(data.clinic.phone || "");
  const [email, setEmail] = useState(data.clinic.email || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        json: { clinic: { name, address, phone, email } },
      });
      toast.success("Clinic profile updated");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update clinic");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionCard title="Clinic information" icon="Building2" description="Shown across the app and on exported documents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Clinic name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void save()} disabled={saving} className="bg-navy-800 hover:bg-navy-900">
            {saving ? "Saving…" : "Save clinic info"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Branches" icon="MapPin" description="Read-only — branch management lives in the clinic setup">
        {data.branches.length === 0 ? (
          <EmptyState icon="MapPin" title="No branches registered" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.branches.map((b) => (
              <div key={b.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{b.name}</p>
                  <StatusBadge status={b.active ? "ACTIVE" : "EXPIRED"} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{b.address || "No address"}</p>
                <p className="text-xs text-muted-foreground">{b.phone || "No phone"}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ---------------- Configuration tab ----------------

function ConfigurationTab({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const navigate = useUIStore((s) => s.navigate);

  const [slotMin, setSlotMin] = useState(String(data.settings.appointmentSlotMin));
  const [hoursStart, setHoursStart] = useState(data.settings.workingHoursStart);
  const [hoursEnd, setHoursEnd] = useState(data.settings.workingHoursEnd);
  const [threshold, setThreshold] = useState(String(data.settings.reviewThreshold));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        json: {
          settings: {
            appointmentSlotMin: parseInt(slotMin, 10),
            workingHoursStart: hoursStart,
            workingHoursEnd: hoursEnd,
            reviewThreshold: parseInt(threshold, 10),
          },
        },
      });
      toast.success("Configuration saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const invalidThreshold = !Number.isInteger(parseInt(threshold, 10)) || parseInt(threshold, 10) < 1 || parseInt(threshold, 10) > 100;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Appointment defaults" icon="CalendarDays" description="Used by the appointment booking grid">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Slot minutes">
              <Select value={slotMin} onValueChange={setSlotMin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 20, 30, 45, 60].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Working hours start">
              <Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
            </Field>
            <Field label="Working hours end">
              <Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Clinical" icon="Stethoscope">
          <Field label="Review threshold (sessions)">
            <Input
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="max-w-40"
            />
          </Field>
          <p className="mt-2 text-xs text-muted-foreground">
            Every <span className="font-semibold text-navy-800">{threshold || "N"}</span> completed therapy sessions, the
            patient&apos;s episode is flagged for a progress review.
          </p>
          {invalidThreshold && <p className="mt-1 text-xs text-rose-600">Enter a whole number between 1 and 100.</p>}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="General" icon="Globe" description="Display defaults (read-only here)">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currency</p>
              <p className="mt-1 text-sm font-semibold">{data.settings.currency} (₵)</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timezone</p>
              <p className="mt-1 text-sm font-semibold">{data.settings.timezone}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Services, Packages & Insurance" icon="Receipt" description="Managed in the billing module">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("billing", { focusTab: "services" })}>
              <AtomIcon name="Briefcase" className="mr-1.5 h-3.5 w-3.5" /> Services
            </Button>
            <Button variant="outline" onClick={() => navigate("billing", { focusTab: "packages" })}>
              <AtomIcon name="Package" className="mr-1.5 h-3.5 w-3.5" /> Packages
            </Button>
            <Button variant="outline" onClick={() => navigate("billing", { focusTab: "insurance" })}>
              <AtomIcon name="ShieldCheck" className="mr-1.5 h-3.5 w-3.5" /> Insurance
            </Button>
          </div>
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || invalidThreshold} className="bg-navy-800 hover:bg-navy-900">
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
