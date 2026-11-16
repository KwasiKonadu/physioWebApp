// Billing: types mirroring the API payloads.

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PatientLite {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  patientCode: string;
  phone?: string | null;
  paymentArrangement?: string;
}

export interface ServiceLite {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  standardPriceCents: number;
  defaultDurationMin: number;
  active: boolean;
  arrangements: string[];
}

export interface PackageDef {
  id: string;
  name: string;
  description?: string | null;
  sessions: number;
  priceCents: number;
  validityDays: number;
  serviceIds: string[];
  active: boolean;
  _count?: { patientPackages: number };
}

export interface PatientPackageItem {
  id: string;
  purchaseDate: string;
  expiryDate: string;
  totalSessions: number;
  usedSessions: number;
  amountPaidCents: number;
  status: string;
  remaining: number;
  patient: PatientLite;
  package: { id: string; name: string; sessions: number; priceCents: number; validityDays: number };
}

export interface ProviderLite {
  id: string;
  name: string;
  code: string;
  contactName?: string | null;
  contactPhone?: string | null;
  email?: string | null;
  billingArrangement: string;
  coveragePercent: number;
  active: boolean;
  _count?: { rates: number; claims: number };
}

export interface RateItem {
  id: string;
  providerId: string;
  serviceId: string;
  rateCents: number;
  coveragePercent: number;
  active: boolean;
  service: { id: string; name: string; standardPriceCents: number; category: string; active: boolean };
}

export interface ClaimItem {
  id: string;
  claimNumber: string;
  claimedCents: number;
  approvedCents: number;
  status: string;
  submittedDate?: string | null;
  decisionDate?: string | null;
  notes?: string | null;
  createdAt: string;
  provider: { id: string; name: string; code: string; billingArrangement: string };
  invoice: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    paidCents: number;
    status: string;
    insuranceCoveredCents?: number;
    patient: PatientLite;
  };
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  arrangement: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  insuranceCoveredCents: number;
  issuedAt: string;
  dueDate?: string | null;
  patient: PatientLite;
  episode?: { id: string; title: string; episodeNumber: number } | null;
  _count?: { items: number };
  claim?: { id: string; claimNumber: string; status: string } | null;
}

export interface InvoiceItemRow {
  id: string;
  serviceId?: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  appliedRateCents?: number | null;
  coveragePercent?: number | null;
  coveredCents: number;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  arrangement: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  insuranceCoveredCents: number;
  notes?: string | null;
  issuedAt: string;
  dueDate?: string | null;
  patient: PatientLite & { email?: string | null };
  episode?: { id: string; title: string; episodeNumber: number; status: string } | null;
  items: InvoiceItemRow[];
  payments: { id: string; amountCents: number; method: string; reference?: string | null; notes?: string | null; paidAt: string }[];
  refunds: { id: string; amountCents: number; reason: string; refundedAt: string; paymentId?: string | null }[];
  claim?: ClaimItem | null;
}
