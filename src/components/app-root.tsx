"use client";
// AppRoot: auth gate + view registry (single-page internal navigation across 12 modules)
import { useEffect, useState } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/templates/app-shell";
import { LoginScreen } from "@/components/organisms/login-screen";
import DashboardPage from "@/components/features/dashboard/DashboardPage";
import PatientsPage from "@/components/features/patients/PatientsPage";
import AppointmentsPage from "@/components/features/appointments/AppointmentsPage";
import AssessmentsPage from "@/components/features/assessments/AssessmentsPage";
import TreatmentPlansPage from "@/components/features/treatment-plans/TreatmentPlansPage";
import TherapySessionsPage from "@/components/features/therapy-sessions/TherapySessionsPage";
import ProgressReviewsPage from "@/components/features/progress-reviews/ProgressReviewsPage";
import DischargesPage from "@/components/features/discharges/DischargesPage";
import BillingPage from "@/components/features/billing/BillingPage";
import ReportsPage from "@/components/features/reports/ReportsPage";
import StaffPage from "@/components/features/staff/StaffPage";
import SettingsPage from "@/components/features/settings/SettingsPage";
import { useAuthStore, useUIStore } from "@/stores/app-store";
import type { ViewKey } from "@/lib/constants";

const VIEWS: Record<ViewKey, React.ComponentType> = {
  dashboard: DashboardPage,
  patients: PatientsPage,
  appointments: AppointmentsPage,
  assessments: AssessmentsPage,
  "treatment-plans": TreatmentPlansPage,
  "therapy-sessions": TherapySessionsPage,
  "progress-reviews": ProgressReviewsPage,
  discharges: DischargesPage,
  billing: BillingPage,
  reports: ReportsPage,
  staff: StaffPage,
  settings: SettingsPage,
};

function AuthedApp() {
  const activeView = useUIStore((s) => s.activeView);
  const View = VIEWS[activeView] || VIEWS.dashboard;
  return (
    <AppShell>
      <View />
    </AppShell>
  );
}

function Gate() {
  const user = useAuthStore((s) => s.user);
  // zustand persist with sync localStorage hydrates at store creation — safe to read once
  const [hydrated] = useState(() => useAuthStore.persist?.hasHydrated?.() ?? false);
  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-workspace" />;
  }
  return user ? <AuthedApp /> : <LoginScreen />;
}

export default function AppRoot() {
  return (
    <Providers>
      <Gate />
    </Providers>
  );
}
