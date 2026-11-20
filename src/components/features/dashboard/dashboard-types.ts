// Dashboard: API payload type and date-range option.
import type { TrendPoint } from "./dashboard-viz";

export interface DashboardData {
  metrics: {
    totalPatients: number; newPatients: number; activeEpisodes: number; todaysAppointments: number;
    completedSessions: number; reviewsDue: number; outstandingInvoices: number;
    outstandingAmountCents: number; revenueCollectedCents: number;
  };
  revenue: { paygCents: number; packageCents: number; insuranceCents: number };
  reviewsDue: { id: string; patientId: string; patientName: string; patientCode: string; episodeTitle: string; sessionsSinceReview: number; threshold: number; therapist: string }[];
  todaysAppointments: { id: string; patientId: string; patientName: string; patientCode: string; time: number; status: string; purpose: string | null; therapist: string; episodeTitle: string | null }[];
  upcomingAppointments: { id: string; patientId: string; patientName: string; date: string; time: number; status: string; therapist: string }[];
  activeEpisodesList: { id: string; patientId: string; patientName: string; patientCode: string; title: string; status: string; sessions: number; sinceReview: number; threshold: number; therapist: string }[];
  overdueForReview: { id: string; patientId: string; patientName: string; sessionsSinceReview: number; threshold: number }[];
  recentlyDischarged: { id: string; patientId: string; patientName: string; closedDate: string | null }[];
  activity: {
    registrations: { id: string; name: string; code: string; date: string }[];
    payments: { id: string; patient: string; amountCents: number; method: string; date: string }[];
    sessions: { id: string; patient: string; episode: string; therapist: string; date: string }[];
    audit: { id: string; action: string; userName: string | null; date: string; entityType: string }[];
  };
  charts: { trend: TrendPoint[]; appointmentStatus: { status: string; count: number }[]; windowDays: number };
}

export type Range = "today" | "week" | "month" | "custom";
