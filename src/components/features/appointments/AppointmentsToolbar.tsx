"use client";
// Filter / navigation toolbar of the appointments page.

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AtomIcon } from "@/components/atoms/icon";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { APPOINTMENT_STATUS_OPTIONS } from "./appointments-shared";
import { View, ALL, relativeLabel } from "./appointments-dates";
import { TherapistOption } from "./appointments-shared";

export function AppointmentsToolbar({ view, setView, anchor, setAnchor, todayKey, shift, therapistFilter, setTherapistFilter, statusFilter, setStatusFilter, therapists, onRefresh, refreshing, canManage, openBooking }: {
  view: View; setView: (v: View) => void;
  anchor: string; setAnchor: (a: string) => void; todayKey: string; shift: (dir: 1 | -1) => void;
  therapistFilter: string; setTherapistFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  therapists: TherapistOption[];
  onRefresh: () => void; refreshing: boolean;
  canManage: boolean; openBooking: (walkIn: boolean) => void;
}) {
  return (
    <DataToolbar
      filters={
        <>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="h-auto! px-3 text-xs" title={view === "day" ? "Click again to jump to today" : undefined} onClick={() => { if (view === "day") setAnchor(todayKey); }}>Day</TabsTrigger>
              <TabsTrigger value="week" className="h-auto! px-3 text-xs" title={view === "week" ? "Click again to jump to this week" : undefined} onClick={() => { if (view === "week") setAnchor(todayKey); }}>Week</TabsTrigger>
              <TabsTrigger value="month" className="h-auto! px-3 text-xs" title={view === "month" ? "Click again to jump to this month" : undefined} onClick={() => { if (view === "month") setAnchor(todayKey); }}>Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Previous">
              <AtomIcon name="ChevronLeft" className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 min-w-24" onClick={() => setAnchor(todayKey)} title="Jump to today">{relativeLabel(view, anchor)}</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Next">
              <AtomIcon name="ChevronRight" className="h-4 w-4" />
            </Button>
          </div>
          <Select value={therapistFilter} onValueChange={setTherapistFilter}>
            <SelectTrigger className="w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All therapists</SelectItem>
              {therapists.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {APPOINTMENT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {canManage ? (
        <>
          <Button variant="outline" onClick={() => openBooking(true)}>
            <AtomIcon name="Zap" className="h-4 w-4" /> Walk-in
          </Button>
          <Button onClick={() => openBooking(false)}>
            <AtomIcon name="Plus" className="h-4 w-4" /> New appointment
          </Button>
        </>
      ) : null}
    </DataToolbar>
  );
}
