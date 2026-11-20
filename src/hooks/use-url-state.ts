"use client";
// useState that lives in the address bar (?key=value), so refresh, back/forward and shared links keep list
// filters, search and paging. Writes use history.replaceState (no navigation, no extra renders); a value equal to
// its default is removed from the URL. The app is client-rendered, so reading window.location on first render is safe.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type Widen<T> = T extends string ? string : T extends number ? number : never;

function readParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
}

export function useUrlState<T extends string | number>(
  key: string,
  initial: T,
  allowed?: readonly string[],
): [Widen<T>, Dispatch<SetStateAction<Widen<T>>>] {
  const fallback = initial as unknown as Widen<T>;
  const [value, setValue] = useState<Widen<T>>(() => {
    const raw = readParam(key);
    if (raw === null) return fallback;
    if (typeof initial === "number") {
      const n = Number(raw);
      return (Number.isFinite(n) && n > 0 ? n : fallback) as Widen<T>;
    }
    if (allowed && !allowed.includes(raw)) return fallback;
    return raw as unknown as Widen<T>;
  });

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (String(value) === String(initial) || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch { /* ignore: URL sync is a convenience */ }
  }, [key, value]);

  return [value, setValue];
}
