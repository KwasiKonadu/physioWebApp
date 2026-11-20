// ============ Server barrel: one import for all backend helpers ============
export { db } from "@/lib/db";
export { ApiError, json, route, parseBody, getQuery, getQueryInt, audit, notify, getSetting, setSetting, parseJson } from "@/server/api";
export { requireAuth, requirePermission, can, hashPassword } from "@/server/auth";
export {
  nextPatientCode, nextStaffCode, nextInvoiceNumber, nextClaimNumber, nextSaleNumber,
  findTherapistConflict, deductPackageForSession, completeTherapySessionTx,
  recalcInvoiceStatus, syncPatientStatus, completeProgressReviewTx, completeDischargeTx,
  patientTokenOR, patientSearchAnd, tokenizedSearchAnd,
} from "@/server/services/shared";
