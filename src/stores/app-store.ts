"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerAuthState } from "@/lib/api-client";
import { ViewKey } from "@/lib/constants";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  clinicId: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (u: AuthUser, accessToken: string, refreshToken: string) => void;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: "gmrs-auth" }
  )
);

// register with api-client for token injection & refresh
registerAuthState(() => {
  const s = useAuthStore.getState();
  if (!s.user) return null;
  return s;
});

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}

// ============ UI store (navigation between module views on the single page) ============
export interface NavigateOpts {
  patientId?: string;
  episodeId?: string;
  appointmentId?: string;
  sessionId?: string;
  invoiceId?: string;
  focusTab?: string;
}

interface UIState {
  activeView: ViewKey;
  sidebarCollapsed: boolean;
  navOpts: NavigateOpts | null;
  navigate: (view: ViewKey, opts?: NavigateOpts) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  clearOpts: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeView: "dashboard",
      sidebarCollapsed: false,
      navOpts: null,
      navigate: (view, opts) => set({ activeView: view, navOpts: opts || null }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      clearOpts: () => set({ navOpts: null }),
    }),
    { name: "gmrs-ui", partialize: (s) => ({ activeView: s.activeView, sidebarCollapsed: s.sidebarCollapsed }) }
  )
);
