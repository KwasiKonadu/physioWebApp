// ============ GMRS Shared Constants & Enums (SQLite: no native enums) ============

export const APP = {
  name: "GMRS Physiotherapy",
  fullName: "GMRS Physiotherapy Clinic Management",
  currency: "GHS",
  currencySymbol: "₵",
  timezone: "Africa/Accra",
};

// ---- Permissions ----
export const PERMS = {
  dashboardView: "dashboard.view",
  patientsView: "patients.view",
  patientsManage: "patients.manage",
  appointmentsView: "appointments.view",
  appointmentsManage: "appointments.manage",
  clinicalView: "clinical.view",
  clinicalManage: "clinical.manage",
  billingView: "billing.view",
  billingManage: "billing.manage",
  billingRefund: "billing.refund",
  packagesManage: "packages.manage",
  insuranceManage: "insurance.manage",
  inventoryView: "inventory.view",
  inventoryManage: "inventory.manage",
  staffView: "staff.view",
  staffManage: "staff.manage",
  leaveApply: "leave.apply",
  reportsView: "reports.view",
  settingsManage: "settings.manage",
} as const;

export const ALL_PERMS = Object.values(PERMS);

// ---- Roles ----
export const ROLE_NAMES = {
  admin: "Clinic Administrator",
  physiotherapist: "Physiotherapist",
} as const;

// Legacy staff-role codes, kept only so older rows/filters keep working. Roles now live in the Role table
// (Settings → Manage roles); only Admin and Physiotherapist are built-in system roles.
export const LEGACY_STAFF_ROLE_BY_NAME: Record<string, string> = {
  [ROLE_NAMES.admin]: "ADMIN",
  [ROLE_NAMES.physiotherapist]: "PHYSIOTHERAPIST",
  Receptionist: "RECEPTIONIST",
  Management: "MANAGEMENT",
};

export const LEAVE_TYPES = ["ANNUAL", "SICK", "OFF_DUTY"] as const;
export const LEAVE_TYPE_LABELS: Record<string, string> = { ANNUAL: "Annual leave", SICK: "Sick day", OFF_DUTY: "Off duty" };
export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLE_NAMES.admin]: ALL_PERMS,
  [ROLE_NAMES.physiotherapist]: [
    PERMS.dashboardView, PERMS.patientsView,
    PERMS.appointmentsView, PERMS.appointmentsManage,
    PERMS.clinicalView, PERMS.clinicalManage,
    PERMS.reportsView, PERMS.leaveApply,
  ],
};

// ---- Patient ----
export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;
export const PAYMENT_ARRANGEMENTS = ["PAYG", "PACKAGE", "INSURANCE"] as const;
export const REFERRAL_SOURCES = ["DOCTOR", "HOSPITAL", "PROFESSIONAL", "PATIENT", "FAMILY_FRIEND", "SOCIAL_MEDIA", "WEBSITE", "WALK_IN", "OTHER"] as const;
export const MEDICAL_HISTORY_TYPES = ["CONDITION", "SURGERY", "INJURY", "MEDICATION", "ALLERGY", "OTHER"] as const;
export const PATIENT_STATUSES = ["NO_EPISODE", "AWAITING_ASSESSMENT", "IN_TREATMENT", "ON_HOLD", "UNDER_REVIEW", "DISCHARGED"] as const;

// ---- Episodes ----
export const EPISODE_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW", "DISCHARGED", "DISCONTINUED"] as const;

// ---- Appointments ----
export const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED", "ATTENDED_NO_TREATMENT"] as const;
export const APPOINTMENT_PURPOSES = ["Initial Assessment", "Follow-up Session", "Progress Review", "Re-assessment", "Discharge Review"] as const;

// ---- Sessions ----
export const SESSION_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

// ---- Plans ----
export const PLAN_STATUSES = ["DRAFT", "ACTIVE", "UNDER_REVIEW", "REVISED", "COMPLETED", "DISCONTINUED"] as const;
export const OBJECTIVE_STATUSES = ["PENDING", "IN_PROGRESS", "ACHIEVED", "NOT_ACHIEVED", "NLA"] as const;
export const MILESTONE_STATUSES = ["PENDING", "IN_PROGRESS", "ACHIEVED", "NOT_ACHIEVED"] as const;
export const PLAN_INTERVENTIONS = ["Manual therapy", "Therapeutic exercises", "Electrotherapy", "Ultrasound", "Heat therapy", "Cold therapy", "Stretching", "Strengthening", "Gait training", "Balance training", "Postural correction"] as const;

// ---- Assessments ----
export const DIAGNOSIS_CATEGORIES = ["MUSCULOSKELETAL", "NEUROLOGICAL", "SPORTS_INJURY", "POST_SURGICAL", "OTHER"] as const;
export const SEVERITIES = ["MILD", "MODERATE", "SEVERE"] as const;
export const SIDES = ["LEFT", "RIGHT", "BILATERAL", "N/A"] as const;
export const BODY_PARTS = ["Cervical spine", "Thoracic spine", "Lumbar spine", "Shoulder", "Elbow", "Wrist/Hand", "Hip", "Knee", "Ankle/Foot", "General"] as const;
export const FUNCTIONAL_ACTIVITIES = ["Walking", "Standing", "Sitting", "Climbing stairs", "Lifting", "Bending", "Sleeping", "Dressing", "Bathing", "Running"] as const;
export const FUNCTIONAL_DIFFICULTY_LABELS = ["No difficulty", "Mild difficulty", "Moderate difficulty", "Severe difficulty", "Unable to perform"] as const;

// ---- Reviews ----
export const REVIEW_STATUSES = ["DUE", "DRAFT", "COMPLETED"] as const;
export const REVIEW_DECISIONS = ["CONTINUE", "MODIFY_INTERVENTIONS", "MODIFY_OBJECTIVES", "ADJUST_FREQUENCY", "REVISE_PLAN", "REFER", "DISCHARGE"] as const;
export const REVIEW_RESULT_STATUSES = ["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "NLA"] as const;
export const DEFAULT_REVIEW_THRESHOLD = 15;

// ---- Discharge ----
export const DISCHARGE_STATUSES = ["DRAFT", "PENDING_SIGNOFF", "COMPLETED"] as const;
export const DISCHARGE_REASONS = ["Treatment objectives achieved", "Significant improvement", "Patient requested to stop", "Referral to another healthcare provider", "Treatment no longer clinically indicated", "Patient unable or unwilling to continue", "Other"] as const;
export const FOLLOW_UP_TYPES = ["FURTHER_PHYSIO", "CLINIC", "TELEPHONE", "MEDICAL_REFERRAL", "OTHER"] as const;

// ---- Billing ----
export const PAYMENT_METHODS = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "INSURANCE"] as const;
export const INVOICE_STATUSES = ["DRAFT", "UNPAID", "PARTIAL", "PAID", "CANCELLED"] as const;
export const PACKAGE_STATUSES = ["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"] as const;
export const PACKAGE_TX_TYPES = ["PURCHASE", "DEDUCTION", "REVERSAL", "REFUND", "ADJUSTMENT", "EXPIRY"] as const;
export const CLAIM_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "PAID"] as const;

// ---- Staff ----
export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "TERMINATED"] as const;
export const REMUNERATION_METHODS = ["FIXED", "PER_PATIENT", "PER_SESSION"] as const;

// ---- Navigation ----
export type ViewKey =
  | "dashboard" | "patients" | "appointments" | "assessments"
  | "treatment-plans" | "therapy-sessions" | "progress-reviews"
  | "discharges" | "billing" | "inventory" | "reports" | "staff" | "settings";

export const NAV_ITEMS: { key: ViewKey; label: string; icon: string; permission: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: PERMS.dashboardView },
  { key: "patients", label: "Patients", icon: "Users", permission: PERMS.patientsView },
  { key: "appointments", label: "Appointments", icon: "CalendarDays", permission: PERMS.appointmentsView },
  { key: "assessments", label: "Assessments", icon: "ClipboardList", permission: PERMS.clinicalView },
  { key: "treatment-plans", label: "Treatment Plans", icon: "Map", permission: PERMS.clinicalView },
  { key: "therapy-sessions", label: "Therapy Sessions", icon: "Activity", permission: PERMS.clinicalView },
  { key: "progress-reviews", label: "Progress Reviews", icon: "TrendingUp", permission: PERMS.clinicalView },
  { key: "discharges", label: "Discharges", icon: "LogOut", permission: PERMS.clinicalView },
  { key: "billing", label: "Billing & Payments", icon: "Receipt", permission: PERMS.billingView },
  { key: "inventory", label: "Inventory", icon: "Package", permission: PERMS.inventoryView },
  { key: "reports", label: "Reports", icon: "BarChart3", permission: PERMS.reportsView },
  { key: "staff", label: "Staff", icon: "BadgeCheck", permission: PERMS.staffView },
  { key: "settings", label: "Settings", icon: "Settings", permission: PERMS.settingsManage },
];

// ---- Status label/color maps (shared) ----
export const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger" | "teal"> = {
  // appointments
  SCHEDULED: "info", CONFIRMED: "teal", COMPLETED: "success", CANCELLED: "neutral",
  NO_SHOW: "danger", RESCHEDULED: "warning", ATTENDED_NO_TREATMENT: "warning",
  // sessions
  PLANNED: "info", IN_PROGRESS: "teal",
  // episodes / patients
  AWAITING_ASSESSMENT: "warning", ASSESSMENT_IN_PROGRESS: "info", AWAITING_PLAN: "warning",
  ACTIVE_TREATMENT: "success", ON_HOLD: "warning", UNDER_REVIEW: "info",
  DISCHARGED: "neutral", DISCONTINUED: "danger", NO_EPISODE: "neutral", IN_TREATMENT: "success",
  // billing
  UNPAID: "danger", PARTIAL: "warning", PAID: "success", DRAFT: "neutral", ACTIVE: "success",
  EXHAUSTED: "warning", EXPIRED: "neutral", EXHAUSTED_PKG: "warning",
  SUBMITTED: "info", APPROVED: "success", PARTIALLY_APPROVED: "warning", REJECTED: "danger",
  // plans
  REVISED: "info", DISCONTINUED_PLAN: "danger",
  // reviews
  DUE: "warning",
  // staff
  ON_LEAVE: "warning", TERMINATED: "danger",
  PENDING_SIGNOFF: "warning", PENDING: "info",
};

export function labelize(s?: string | null): string {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
