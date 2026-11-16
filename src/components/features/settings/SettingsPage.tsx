"use client";
// FEATURE: Settings — clinic info, users & roles, configuration, audit log
import { TopBarTabs } from "@/components/templates/topbar-slots";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import SettingsUsersTab from "./settings-users-tab";
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

type TabKey = "clinic" | "users" | "audit";

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

function BranchesCard({ branches }: { branches: BranchRow[] }) {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const openPanel = (b: BranchRow | null) => {
    setEditing(b);
    setName(b?.name || "");
    setAddress(b?.address || "");
    setPhone(b?.phone || "");
    setPanelOpen(true);
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["settings"] });
    await qc.invalidateQueries({ queryKey: ["branches"] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const json = { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null };
      if (editing) await apiFetch(`/api/branches/${editing.id}`, { method: "PATCH", json });
      else await apiFetch("/api/branches", { method: "POST", json });
      toast.success(editing ? "Branch updated" : "Branch added");
      await refresh();
      setPanelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (b: BranchRow, active: boolean) => {
    try {
      await apiFetch(`/api/branches/${b.id}`, { method: "PATCH", json: { active } });
      toast.success(active ? `${b.name} activated` : `${b.name} deactivated`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update branch");
    }
  };

  return (
    <>
      <SectionCard
        title="Branches"
        icon="MapPin"
        description="Locations the clinic operates from. Branches are switched off, never deleted, so staff and records keep their history."
        actions={
          <Button size="sm" onClick={() => openPanel(null)}>
            <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add branch
          </Button>
        }
      >
        {branches.length === 0 ? (
          <EmptyState icon="MapPin" title="No branches registered" description="Add the first branch to assign staff to a location." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <div key={b.id} className={`rounded-lg border p-4 ${b.active ? "" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm font-semibold ${b.active ? "" : "text-muted-foreground"}`}>{b.name}</p>
                  <StatusBadge status={b.active ? "ACTIVE" : "EXPIRED"} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{b.address || "No address"}</p>
                <p className="text-xs text-muted-foreground">{b.phone || "No phone"}</p>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={b.active} onCheckedChange={(v) => void setActive(b, v)} aria-label={`Toggle ${b.name}`} />
                    {b.active ? "Active" : "Inactive"}
                  </label>
                  <Button size="sm" variant="outline" onClick={() => openPanel(b)}>
                    <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        size="md"
        title={editing ? `Edit branch — ${editing.name}` : "Add branch"}
        description="Name, address and phone of the location."
      >
        <SidePanelBody className="space-y-4">
          <Field label="Branch name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. East Legon" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 …" />
          </Field>
        </SidePanelBody>
        <SidePanelFooter className="justify-end">
          <Button variant="outline" onClick={() => setPanelOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add branch"}
          </Button>
        </SidePanelFooter>
      </SidePanel>
    </>
  );
}

// ---------------- Clinic tab ----------------

function ClinicTab({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.clinic.name);
  const [address, setAddress] = useState(data.clinic.address || "");
  const [phone, setPhone] = useState(data.clinic.phone || "");
  const [email, setEmail] = useState(data.clinic.email || "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setName(data.clinic.name);
    setAddress(data.clinic.address || "");
    setPhone(data.clinic.phone || "");
    setEmail(data.clinic.email || "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        json: { clinic: { name, address, phone, email } },
      });
      toast.success("Clinic profile updated");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update clinic");
    } finally {
      setSaving(false);
    }
  };

  const c = data.clinic;
  return (
    <>
      <SectionCard
        title="Clinic information"
        icon="Building2"
        description="Shown across the app and on exported documents"
        actions={
          editing ? null : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )
        }
      >
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 *:min-w-0">
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
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void save()} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        ) : (
          <DetailGrid cols={2}>
            <DetailRow label="Clinic name" value={c.name} />
            <DetailRow label="Clinic code" value={<span className="font-mono text-xs">{c.code}</span>} />
            <DetailRow label="Email" value={c.email} />
            <DetailRow label="Phone" value={c.phone} />
            <DetailRow label="Address" value={c.address} />
            <DetailRow label="Currency" value={c.currency} />
            <DetailRow label="Timezone" value={c.timezone} />
          </DetailGrid>
        )}
      </SectionCard>

      <ConfigCards data={data} />

      <BranchesCard branches={data.branches} />

      <BillingSetupCard />
    </>
  );
}

// ---------------- Configuration tab ----------------

// A settings card that shows a preview with an Edit button; Edit swaps in the fields with Cancel / Save.
function EditableCard({
  title, icon, description, preview, form, canSave, onStart, onSave,
}: {
  title: string; icon: string; description?: string;
  preview: React.ReactNode; form: React.ReactNode;
  canSave: boolean; onStart: () => void; onSave: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <SectionCard
      title={title}
      icon={icon}
      description={description}
      actions={
        editing ? null : (
          <Button size="sm" variant="outline" onClick={() => { onStart(); setEditing(true); }}>
            <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
        )
      }
    >
      {editing ? (
        <>
          {form}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button
              disabled={saving || !canSave}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave();
                  setEditing(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to save");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      ) : (
        preview
      )}
    </SectionCard>
  );
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function ConfigCards({ data }: { data: SettingsData }) {
  const qc = useQueryClient();
  const cfg = data.settings;

  const [slotMin, setSlotMin] = useState(String(cfg.appointmentSlotMin));
  const [hoursStart, setHoursStart] = useState(cfg.workingHoursStart);
  const [hoursEnd, setHoursEnd] = useState(cfg.workingHoursEnd);
  const [threshold, setThreshold] = useState(String(cfg.reviewThreshold));

  const patch = async (settings: Record<string, unknown>, message: string) => {
    await apiFetch("/api/settings", { method: "PATCH", json: { settings } });
    toast.success(message);
    await qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const invalidThreshold = !Number.isInteger(parseInt(threshold, 10)) || parseInt(threshold, 10) < 1 || parseInt(threshold, 10) > 100;
  const invalidHours = !hoursStart || !hoursEnd || hoursEnd <= hoursStart;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <EditableCard
          title="Appointment defaults"
          icon="CalendarDays"
          description="Used by the appointment booking grid"
          canSave={!invalidHours}
          onStart={() => { setSlotMin(String(cfg.appointmentSlotMin)); setHoursStart(cfg.workingHoursStart); setHoursEnd(cfg.workingHoursEnd); }}
          onSave={() => patch({ appointmentSlotMin: parseInt(slotMin, 10), workingHoursStart: hoursStart, workingHoursEnd: hoursEnd }, "Appointment defaults saved")}
          preview={
            <DetailGrid cols={1}>
              <DetailRow label="Slot length" value={`${cfg.appointmentSlotMin} minutes`} />
              <DetailRow label="Working hours" value={`${fmtTime(cfg.workingHoursStart)} – ${fmtTime(cfg.workingHoursEnd)}`} />
            </DetailGrid>
          }
          form={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 *:min-w-0">
              <Field label="Slot minutes">
                <Select value={slotMin} onValueChange={setSlotMin}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                {invalidHours ? <p className="text-xs text-rose-600">End must be after start.</p> : null}
              </Field>
            </div>
          }
        />

        <EditableCard
          title="Clinical"
          icon="Stethoscope"
          canSave={!invalidThreshold}
          onStart={() => setThreshold(String(cfg.reviewThreshold))}
          onSave={() => patch({ reviewThreshold: parseInt(threshold, 10) }, "Clinical settings saved")}
          preview={
            <>
              <DetailGrid cols={1}>
                <DetailRow label="Review threshold" value={`${cfg.reviewThreshold} sessions`} />
              </DetailGrid>
              <p className="mt-2 text-xs text-muted-foreground">
                Every <span className="font-semibold text-navy-800">{cfg.reviewThreshold}</span> completed therapy sessions, the
                patient&apos;s episode is flagged for a progress review.
              </p>
            </>
          }
          form={
            <>
              <Field label="Review threshold (sessions)">
                <Input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="max-w-40" />
              </Field>
              <p className="mt-2 text-xs text-muted-foreground">
                Every <span className="font-semibold text-navy-800">{threshold || "N"}</span> completed therapy sessions, the
                patient&apos;s episode is flagged for a progress review.
              </p>
              {invalidThreshold ? <p className="mt-1 text-xs text-rose-600">Enter a whole number between 1 and 100.</p> : null}
            </>
          }
        />
      </div>
    </>
  );
}

function BillingSetupCard() {
  const navigate = useUIStore((s) => s.navigate);
  type Counted = { total: number; categories?: string[] };
  const services = useQuery({ queryKey: ["settings", "count", "services"], queryFn: () => apiFetch<Counted>("/api/services?pageSize=1") });
  const packages = useQuery({ queryKey: ["settings", "count", "packages"], queryFn: () => apiFetch<Counted>("/api/packages?pageSize=1") });
  const providers = useQuery({ queryKey: ["settings", "count", "providers"], queryFn: () => apiFetch<Counted>("/api/insurance/providers?pageSize=1") });

  const tiles = [
    { tab: "services", icon: "Briefcase", label: "Services", q: services, sub: (d?: Counted) => (d?.categories ? `${d.categories.length} categories` : "price list") },
    { tab: "packages", icon: "Package", label: "Packages", q: packages, sub: () => "session bundles" },
    { tab: "insurance", icon: "ShieldCheck", label: "Insurance providers", q: providers, sub: () => "rates & claims" },
  ];

  return (
    <SectionCard title="Services, Packages & Insurance" icon="Receipt" description="Set up in the billing module — open one to add or edit">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.tab}
            type="button"
            onClick={() => navigate("billing", { focusTab: t.tab })}
            className="group flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-teal-500/60 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
              <AtomIcon name={t.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              {t.q.isLoading ? (
                <Skeleton className="mb-1 h-5 w-10" />
              ) : (
                <span className="block text-xl font-semibold leading-tight">{t.q.data?.total ?? "—"}</span>
              )}
              <span className="block truncate text-sm font-medium">{t.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.sub(t.q.data)}</span>
            </span>
            <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </SectionCard>
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
