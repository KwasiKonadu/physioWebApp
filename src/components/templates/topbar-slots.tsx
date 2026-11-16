"use client";
// Slots that let pages render their title, actions and tabs inside the sticky TopBar
// (via portals, so React context such as Radix <Tabs> keeps working).
import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

interface Slots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  tabs: HTMLElement | null;
  setTitle: (el: HTMLElement | null) => void;
  setActions: (el: HTMLElement | null) => void;
  setTabs: (el: HTMLElement | null) => void;
}

const SlotsContext = createContext<Slots | null>(null);

export function TopBarSlotsProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ title, actions, tabs, setTitle, setActions, setTabs }), [title, actions, tabs]);
  return <SlotsContext.Provider value={value}>{children}</SlotsContext.Provider>;
}

export function useTopBarSlots() {
  return useContext(SlotsContext);
}

/** Renders children into the top bar's tab row. */
export function TopBarTabs({ children }: { children: React.ReactNode }) {
  const slots = useTopBarSlots();
  return slots?.tabs ? createPortal(children, slots.tabs) : null;
}

/** Renders children into the top bar's actions area. */
export function TopBarActions({ children }: { children: React.ReactNode }) {
  const slots = useTopBarSlots();
  return slots?.actions ? createPortal(children, slots.actions) : null;
}

export function TopBarTitle({ children }: { children: React.ReactNode }) {
  const slots = useTopBarSlots();
  return slots?.title ? createPortal(children, slots.title) : null;
}
