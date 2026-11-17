"use client";
// MOLECULE: password field with a show / hide toggle. Accepts every <Input> prop (incl. react-hook-form's register).
import { useState } from "react";
import { AtomIcon } from "@/components/atoms/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-9", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <AtomIcon name={visible ? "EyeOff" : "Eye"} className="h-4 w-4" />
      </button>
    </div>
  );
}
