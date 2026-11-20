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

// URL for each module. The router is registered once by the app frame (see components/app-frame.tsx).
export const VIEW_PATHS: Record<ViewKey, string> = {
  dashboard: "/dashboard",
  patients: "/patients",
  appointments: "/appointments",
  assessments: "/assessments",
  "treatment-plans": "/treatment-plans",
  "therapy-sessions": "/therapy-sessions",
  "progress-reviews": "/progress-reviews",
  discharges: "/discharges",
  billing: "/billing",
  inventory: "/inventory",
  reports: "/reports",
  staff: "/staff",
  settings: "/settings",
};

/** Which module a pathname belongs to (e.g. "/patients/abc" → "patients"). */
export function viewFromPath(pathname: string | null): ViewKey {
  const seg = (pathname || "").split("/")[1] as ViewKey;
  return seg && seg in VIEW_PATHS ? seg : "dashboard";
}

let routerPush: ((href: string) => void) | null = null;
export function registerRouter(push: (href: string) => void) {
  routerPush = push;
}

// Optional navigation guard: a page with unsaved work registers one; navigate() calls it first.
// It returns true when it takes over (e.g. shows a confirm dialog) and will call `proceed` later.
type NavGuard = (proceed: () => void) => boolean;
let navGuard: NavGuard | null = null;
export function setNavGuard(g: NavGuard | null) {
  navGuard = g;
}

interface UIState {
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
      sidebarCollapsed: false,
      navOpts: null,
      // Changes the URL; extra options (episodeId, focusTab …) are handed to the target page through navOpts.
      navigate: (view, opts) => {
        if (navGuard && navGuard(() => useUIStore.getState().navigate(view, opts))) return;
        let href: string = VIEW_PATHS[view];
        let rest = opts || null;
        if (view === "patients" && opts?.patientId) {
          href = `/patients/${opts.patientId}`;
          const { patientId: _omit, ...others } = opts;
          void _omit;
          rest = Object.keys(others).length ? others : null;
        }
        set({ navOpts: rest });
        routerPush?.(href);
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      clearOpts: () => set({ navOpts: null }),
    }),
    { name: "gmrs-ui", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
);
