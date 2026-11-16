// Staff profile: API payload types, period options and date-range helper.

export interface StaffDetail {
  staff: {
    id: string; staffCode: string; firstName: string; lastName: string;
    email: string | null; phone: string | null; jobTitle: string; department: string | null;
    staffRole: string; employmentStatus: string; employmentDate: string | null;
    professionalDesignation: string | null; specialization: string | null;
    qualifications: string[]; availability: { day: string; start?: string; end?: string }[];
    remunerationMethod: string; remunerationRateCents: number | null; isTherapist: boolean;
    branchId: string | null;
  };
  branchName: string | null;
  account: { id: string; email: string; name: string; active: boolean; roleName: string } | null;
  stats: { completedSessions: number; uniquePatients: number; activeEpisodes: number };
}

export interface StatsResponse {
  stats: {
    completedSessions: number; uniquePatients: number; activeEpisodes: number;
    appointmentsCompleted: number; noShows: number; upcomingAppointments: number;
  };
  remuneration: { method: string; rateCents: number | null; computedCents: number | null };
  trend: { month: string; sessions: number }[];
  monthly: { month: string; sessions: number; patients: number; booked: number; completed: number; noShows: number; cancelled: number }[];
  statusBreakdown: { status: string; count: number }[];
  byWeekday: { day: string; sessions: number }[];
}

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_7", label: "Last 7 days" },
  { value: "last_30", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

export function periodRange(p: Period): { from: string; to: string } {
  const n = new Date();
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const eod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const addDays = (d: Date, k: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  const today = sod(n);
  const monday = addDays(today, -((today.getDay() + 6) % 7)); // weeks run Monday–Sunday
  const range = (from: Date, to: Date) => ({ from: from.toISOString(), to: eod(to).toISOString() });
  switch (p) {
    case "today": return range(today, today);
    case "yesterday": return range(addDays(today, -1), addDays(today, -1));
    case "this_week": return range(monday, today);
    case "last_week": return range(addDays(monday, -7), addDays(monday, -1));
    case "last_7": return range(addDays(today, -6), today);
    case "last_30": return range(addDays(today, -29), today);
    case "last_month": return range(new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0));
    case "last_3": return range(new Date(n.getFullYear(), n.getMonth() - 2, 1), today);
    case "this_year": return range(new Date(n.getFullYear(), 0, 1), today);
    default: return range(new Date(n.getFullYear(), n.getMonth(), 1), today);
  }
}
