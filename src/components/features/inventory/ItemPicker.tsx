"use client";
// Searchable item dropdown for a sale line. Same look as CustomerPicker: type in the field to filter, pick from the list below.
import { useState } from "react";
import { AtomIcon } from "@/components/atoms/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { InventoryItem } from "./inventory-api";

const itemCls = "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50";

interface Props {
  items: InventoryItem[];
  value: string; // item id, "" = none
  onChange: (item: InventoryItem) => void;
  /** ids that can't be picked (already on another line) */
  disabledIds?: string[];
}

export default function ItemPicker({ items, value, onChange, disabledIds = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = not typing, show the selected item
  const selected = items.find((i) => i.id === value);

  const q = (query ?? "").trim().toLowerCase();
  const matches = q ? items.filter((i) => [i.name, i.sku, i.category].some((v) => v.toLowerCase().includes(q))) : items;

  const pick = (i: InventoryItem) => { onChange(i); setQuery(null); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(null); }}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            role="combobox"
            aria-expanded={open}
            value={query ?? selected?.name ?? ""}
            placeholder="Search item…"
            autoComplete="off"
            className="pr-8"
            onClick={(e) => { setOpen(true); e.currentTarget.select(); }}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); setQuery(null); }
              else if (e.key === "ArrowDown") setOpen(true);
            }}
          />
          <AtomIcon name="ChevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="custom-scrollbar max-h-64 w-(--radix-popover-trigger-width) min-w-64 overflow-y-auto rounded-md p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => { if ((e.target as HTMLElement).closest("[role=combobox]")) e.preventDefault(); }}
      >
        {matches.map((i) => (
          <button key={i.id} type="button" className={itemCls} disabled={disabledIds.includes(i.id)} onClick={() => pick(i)}>
            <span className="min-w-0">
              <span className="block truncate font-medium">{i.name}</span>
              <span className="block text-xs text-muted-foreground">{[i.sku, `${i.quantity} ${i.unit} in stock`].filter(Boolean).join(" · ")}</span>
            </span>
            {i.id === value ? <AtomIcon name="Check" className="ml-auto h-4 w-4 shrink-0" /> : null}
          </button>
        ))}
        {matches.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No items found</p> : null}
      </PopoverContent>
    </Popover>
  );
}
