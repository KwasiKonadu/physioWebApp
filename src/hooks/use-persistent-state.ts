"use client";
// useState that remembers its value in localStorage (per browser). Safe when storage is unavailable.
import { useCallback, useEffect, useState } from "react";

export function usePersistentState<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(initial);

  // read after mount so server and client markup match
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key) as T | null;
      // hydration-safe read: localStorage only exists on the client, so it must happen after mount
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored && (!allowed || allowed.includes(stored))) setValue(stored);
    } catch {
      /* storage blocked — keep the default */
    }
  }, [key]);

  const update = useCallback((next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* ignore */
    }
  }, [key]);

  return [value, update] as const;
}
