"use client";
// ============ Client API wrapper: token injection, auto-refresh on 401, typed errors ============

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
};

let getAuthState: (() => AuthState | null) | null = null;
export function registerAuthState(fn: () => AuthState | null) {
  getAuthState = fn;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const state = getAuthState?.();
  if (!state?.refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        state.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshPromise = null; }, 100);
      }
    })();
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const state = getAuthState?.();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (state?.accessToken && !path.startsWith("/api/auth/login")) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }
  let body = init?.body;
  if (init?.json !== undefined) {
    body = JSON.stringify(init.json);
    headers["Content-Type"] = "application/json";
  }

  const doFetch = () => fetch(path, { ...init, headers, body });

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    const ok = await tryRefresh();
    if (ok) {
      const s2 = getAuthState?.();
      if (s2?.accessToken) headers["Authorization"] = `Bearer ${s2.accessToken}`;
      res = await doFetch();
    }
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload?.error?.message || `Request failed (${res.status})`;
    if (res.status === 401 && !path.startsWith("/api/auth/login")) {
      state?.clear();
    }
    throw new ApiError(res.status, message, payload?.error?.code);
  }
  return payload as T;
}
