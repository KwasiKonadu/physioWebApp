// New-invoice builder: the draft line-item shape and insurance membership type.

// ---- One billable line in the builder ----
export interface DraftItem {
  key: number;
  serviceId: string;
  description: string;
  quantity: number;
  priceText: string; // GHS
  ratePreview?: { rateCents: number; coveragePercent: number } | null;
}

let itemKey = 1;
export const emptyItem = (): DraftItem => ({ key: itemKey++, serviceId: "", description: "", quantity: 1, priceText: "", ratePreview: null });

export type Membership = {
  id: string; providerId: string; membershipNumber: string; policyNumber?: string | null;
  validFrom?: string | null; validTo?: string | null; principalMember?: string | null;
  relationshipToPrincipal?: string | null; status: string;
};
