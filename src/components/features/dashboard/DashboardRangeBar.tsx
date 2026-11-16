"use client";
// Date-range tabs and custom from/to pickers of the dashboard.

import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AtomIcon } from "@/components/atoms/icon";
import type { Range } from "./dashboard-types";

export function DashboardRangeBar({ range, setRange, customFrom, setCustomFrom, customTo, setCustomTo }: {
  range: Range; setRange: (r: Range) => void;
  customFrom: Date | undefined; setCustomFrom: (d: Date | undefined) => void;
  customTo: Date | undefined; setCustomTo: (d: Date | undefined) => void;
}) {
  return (
  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-1.5">
    <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
      <TabsList className="h-8">
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">This week</TabsTrigger>
        <TabsTrigger value="month">This month</TabsTrigger>
        <TabsTrigger value="custom" className="gap-1">
          <AtomIcon name="CalendarRange" className="h-3.5 w-3.5" />
          {range === "custom" && customFrom && customTo
            ? `${formatDate(customFrom, { month: "short", day: "numeric" })} – ${formatDate(customTo, { month: "short", day: "numeric" })}`
            : "Custom"}
        </TabsTrigger>
      </TabsList>
    </Tabs>
    {range === "custom" && (
      <>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-40 justify-start font-normal">
              <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
              {customFrom ? formatDate(customFrom) : "From date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-40 justify-start font-normal">
              <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
              {customTo ? formatDate(customTo) : "To date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus />
          </PopoverContent>
        </Popover>
      </>
    )}
  </div>
  );
}
