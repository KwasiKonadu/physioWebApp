"use client";
// Step indicator of the patient registration wizard.

import { AtomIcon } from "@/components/atoms/icon";
import { cn } from "@/lib/utils";
import { STEPS } from "./registration-schema";

export function RegistrationStepper({ step, setStep }: { step: number; setStep: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-5 py-3 custom-scrollbar">
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => (i < step ? setStep(i) : undefined)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              i === step && "bg-primary text-primary-foreground",
              i < step && "bg-navy-50 text-navy-800 hover:bg-navy-50",
              i > step && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                i === step ? "bg-primary-foreground/20" : i < step ? "bg-navy-100" : "bg-muted"
              )}
            >
              {i < step ? <AtomIcon name="Check" className="h-3 w-3" /> : i + 1}
            </span>
            {s.title}
          </button>
          {i < STEPS.length - 1 ? <span className="mx-1 h-px w-3 bg-border sm:w-5" /> : null}
        </div>
      ))}
    </div>
  );
}
