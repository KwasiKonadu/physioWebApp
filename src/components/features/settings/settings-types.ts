// Settings: API payload types and tab keys.

export interface ClinicInfo {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
}
export interface BranchRow { id: string; name: string; address: string | null; phone: string | null; active: boolean }
export interface SettingsData {
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
  billingCounts?: { services: number; serviceCategories: number; packages: number; providers: number };
}

export type TabKey = "clinic" | "users" | "audit";
