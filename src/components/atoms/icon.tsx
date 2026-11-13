"use client";
// ATOM: dynamic Lucide icon by name (used by sidebar & menus)
import { createElement } from "react";
import * as Icons from "lucide-react";

const cache = new Map<string, Icons.LucideIcon>();

export function getIcon(name: string): Icons.LucideIcon {
  if (cache.has(name)) return cache.get(name)!;
  const icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.Circle;
  cache.set(name, icon);
  return icon;
}

export function AtomIcon({ name, className }: { name: string; className?: string }) {
  return createElement(getIcon(name), { className });
}
