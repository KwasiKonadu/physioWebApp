"use client";
// Inventory + sales client: types, constants and react-query hooks over /api/inventory and /api/sales.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export const INVENTORY_CATEGORIES = ["Consumables", "Equipment", "Exercise & Rehab", "Taping & Bandages", "Hygiene", "Office", "Other"] as const;
export const INVENTORY_UNITS = ["pcs", "box", "pack", "roll", "bottle", "pair", "set"] as const;

export type StockStatus = "OUT" | "LOW" | "OK";
export type MovementType = "IN" | "OUT" | "ADJUST";
export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "CARD" | "BANK_TRANSFER";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" }, { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "CARD", label: "Card" }, { value: "BANK_TRANSFER", label: "Bank transfer" },
];

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: number;
  /** flagged as low at or below this */
  reorderLevel: number;
  unitCostCents: number;
  /** 0 = fall back to the unit cost when selling */
  sellPriceCents: number;
  supplier: string;
  location: string;
  notes: string;
  status: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export type ItemInput = Omit<InventoryItem, "id" | "status" | "createdAt" | "updatedAt">;

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: MovementType;
  /** signed change applied to the quantity */
  change: number;
  quantityAfter: number;
  reason: string;
  createdAt: string;
}

export interface SaleLine {
  id?: string;
  itemId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Sale {
  id: string;
  number: string;
  patientId: string | null;
  /** patient name, "" for a walk-in */
  customer: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  note: string;
  voided: boolean;
  soldByName: string | null;
  createdAt: string;
  lines: SaleLine[];
}

interface Paged<T, S> { items: T[]; total: number; page: number; pageSize: number; stats: S }

export interface StockStats { total: number; low: number; out: number; valueCents: number }
export interface MovementStats { count: number; unitsIn: number; unitsOut: number }
export interface SaleStats { todayCents: number; todayCount: number; totalCents: number; transactions: number; units: number }

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== "all") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ---- queries ----
export function useStock(p: { search?: string; category?: string; status?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ["inventory", "items", p],
    queryFn: () => apiFetch<Paged<InventoryItem, StockStats>>(`/api/inventory${qs(p)}`),
    placeholderData: keepPreviousData,
  });
}

/** every item that still has stock — feeds the item picker on the sale form */
export function useSellableItems(enabled = true) {
  return useQuery({
    queryKey: ["inventory", "sellable"],
    enabled,
    queryFn: () => apiFetch<Paged<InventoryItem, StockStats>>(`/api/inventory?sellable=true&pageSize=200`).then((r) => r.items),
  });
}

export function useMovements(p: { search?: string; type?: string; days?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ["inventory", "movements", p],
    queryFn: () => apiFetch<Paged<StockMovement, MovementStats>>(`/api/inventory/movements${qs({ ...p, days: p.days === "all" ? undefined : p.days })}`),
    placeholderData: keepPreviousData,
  });
}

export function useSales(p: { search?: string; method?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ["inventory", "sales", p],
    queryFn: () => apiFetch<Paged<Sale, SaleStats>>(`/api/sales${qs(p)}`),
    placeholderData: keepPreviousData,
  });
}

// ---- mutations (every one refreshes all inventory data: stock, movements, sales and stats move together) ----
function useInventoryMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }) });
}

export const useCreateItem = () => useInventoryMutation((v: ItemInput) => apiFetch("/api/inventory", { method: "POST", json: v }));
export const useUpdateItem = () => useInventoryMutation((v: { id: string; data: Omit<ItemInput, "quantity"> }) => apiFetch(`/api/inventory/${v.id}`, { method: "PATCH", json: v.data }));
export const useDeleteItem = () => useInventoryMutation((id: string) => apiFetch(`/api/inventory/${id}`, { method: "DELETE" }));
export const useAdjustStock = () => useInventoryMutation((v: { id: string; type: MovementType; amount: number; reason: string }) =>
  apiFetch(`/api/inventory/${v.id}/adjust`, { method: "POST", json: { type: v.type, amount: v.amount, reason: v.reason } }));
export const useRecordSale = () => useInventoryMutation((v: { patientId?: string; paymentMethod: PaymentMethod; note: string; lines: { itemId: string; quantity: number; unitPriceCents: number }[] }) =>
  apiFetch("/api/sales", { method: "POST", json: v }));
export const useVoidSale = () => useInventoryMutation((id: string) => apiFetch(`/api/sales/${id}/void`, { method: "POST" }));
