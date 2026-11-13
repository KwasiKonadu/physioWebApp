// ============ Treatment Plans: shared DTO types ============

export interface PlanObjectiveDto {
  id: string;
  description: string;
  baseline: string | null;
  target: string | null;
  unit: string | null;
  priority: string | null; // HIGH | MEDIUM | LOW
  expectedDate: string | null;
  status: string; // PENDING | IN_PROGRESS | ACHIEVED | NOT_ACHIEVED | NLA
  notes: string | null;
}

export interface PlanMilestoneDto {
  id: string;
  description: string;
  objectiveId: string | null;
  expectedDate: string | null;
  status: string; // PENDING | IN_PROGRESS | ACHIEVED | NOT_ACHIEVED
  notes: string | null;
}

export interface PlanInterventionDto {
  id: string;
  name: string;
  description: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  notes: string | null;
}

export interface EpisodeSummaryDto {
  id: string;
  title: string;
  status: string;
  episodeNumber?: number;
  openedDate?: string;
  totalCompletedSessions: number;
  sessionsSinceReview: number;
  reviewThreshold: number;
  reviewDue: boolean;
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    currentStatus: string;
  };
  therapist: { id: string; staffCode: string; firstName: string; lastName: string; jobTitle?: string } | null;
}

export interface PlanVersionDto {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  revisedFromId: string | null;
}

export interface TreatmentPlanDto {
  id: string;
  episodeId: string;
  version: number;
  status: string;
  sessionsPerWeek: number | null;
  expectedTotalSessions: number | null;
  sessionDurationMin: number | null;
  startDate: string | null;
  endDate: string | null;
  reviewThresholdSessions: number;
  contraindications: string | null;
  restrictions: string | null;
  activitiesToAvoid: string | null;
  specialPrecautions: string | null;
  patientRecommendations: string | null;
  referralInstructions: string | null;
  activatedAt: string | null;
  revisedFromId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  episode: EpisodeSummaryDto;
  objectives: PlanObjectiveDto[];
  milestones: PlanMilestoneDto[];
  interventions: PlanInterventionDto[];
  versions: PlanVersionDto[];
}

export interface PlanListItemDto {
  id: string;
  version: number;
  status: string;
  sessionsPerWeek: number | null;
  expectedTotalSessions: number | null;
  sessionDurationMin: number | null;
  startDate: string | null;
  endDate: string | null;
  reviewThresholdSessions: number;
  activatedAt: string | null;
  revisedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  episode: {
    id: string;
    title: string;
    status: string;
    totalCompletedSessions: number;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { id: string; patientCode: string; firstName: string; lastName: string };
    therapist: { id: string; staffCode: string; firstName: string; lastName: string } | null;
  };
  objectivesTotal: number;
  objectivesAchieved: number;
  milestonesCount: number;
  interventionsCount: number;
}

export interface PlanListResponse {
  items: PlanListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- form-facing patient / episode lookups (patients module API) ----
export interface PatientOptionDto {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  currentStatus?: string;
  phone?: string;
}

export interface EpisodeOptionDto {
  id: string;
  title: string;
  status: string;
  episodeNumber?: number;
  openedDate?: string;
}
