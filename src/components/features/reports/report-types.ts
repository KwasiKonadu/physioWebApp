// Reports: report types, range presets and API response shapes.

export type ReportType = "patients" | "appointments" | "clinical" | "financial" | "staff";
export type RangePreset = "today" | "week" | "month" | "quarter" | "custom";
export const PRESETS: RangePreset[] = ["today", "week", "month", "quarter", "custom"];

// ---- Report response shapes ----
export interface PatientsReport {
  stats: { totalRegistered: number; newPatients: number; returningPatients: number; activeEpisodes: number; dischargedCount: number };
  referralSources: { source: string; count: number }[];
  registrationsByMonth: { month: string; count: number }[];
  discharged: { id: string; patientName: string; patientCode: string; episodeTitle: string; sessions: number; therapist: string; closedDate: string }[];
}
export interface AppointmentsReport {
  stats: { total: number; completed: number; cancelled: number; noShows: number; attendedNoTreatment: number; upcoming: number };
  byStatus: { status: string; count: number }[];
  byTherapist: { id: string; therapist: string; completed: number; cancelled: number; noShow: number }[];
  byDay: { day: string; total: number; completed: number }[];
}
export interface ClinicalReport {
  stats: { completedSessions: number; activeEpisodes: number; reviewsDue: number; discharges: number; averageSessionsPerEpisode: number };
  sessionsByMonth: { month: string; count: number }[];
  reviewsDueList: { id: string; patientName: string; patientCode: string; episodeTitle: string; sessionsSinceReview: number; threshold: number; totalSessions: number; therapist: string }[];
  dischargeStats: { discharges: number; byReason: { reason: string; count: number }[]; treatmentOutcomes: { objectivesAchieved: number; other: number } };
}
export interface FinancialReport {
  stats: { totalRevenueCents: number; outstandingCents: number; outstandingCount: number; refundsCents: number };
  revenueByMethod: { method: string; amountCents: number }[];
  byArrangement: { paygCents: number; packageCents: number; insuranceCents: number };
  claims: { open: number; submittedCents: number; approvedCents: number; outstandingCents: number };
  packageUtilisation: { usedSessions: number; totalSessions: number; percent: number };
  outstandingList: { id: string; invoiceNumber: string; patientName: string; totalCents: number; paidCents: number; outstandingCents: number; status: string; arrangement: string; dueDate: string | null }[];
}
export interface StaffReport {
  stats: { therapists: number; totalCompletedSessions: number; uniquePatientsSeen: number; estimatedRemunerationCents: number; staffSalariesCents?: number };
  rows: { id: string; name: string; jobTitle: string; completedSessions: number; uniquePatients: number; activeEpisodes: number; remunerationMethod: string; rateCents: number | null; computedCents: number | null }[];
}
export type ReportData = PatientsReport | AppointmentsReport | ClinicalReport | FinancialReport | StaffReport;

export const TABS: { type: ReportType; label: string }[] = [
  { type: "patients", label: "Patients" },
  { type: "appointments", label: "Appointments" },
  { type: "clinical", label: "Clinical" },
  { type: "financial", label: "Financial" },
  { type: "staff", label: "Staff" },
];
