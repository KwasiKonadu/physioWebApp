"use client";
// MOLECULE: person card for grid views (patients, staff) — avatar, name + code, status, a one-line
// subtitle, icon-led details and a footer badge. Pages pass the data; the look lives here.
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Soft avatar colours; each person always gets the same one (picked from a hash of their code).
const AVATAR_TONES = [
  "bg-navy-100 text-navy-800",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
];
export function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export interface ProfileCardDetail {
  icon: string;
  text: React.ReactNode;
}

interface ProfileCardProps {
  initials: string;
  name: string;
  code: string;
  /** status badge shown top-right */
  status?: React.ReactNode;
  /** one line under the header (episode title, job title …) */
  subtitle?: React.ReactNode;
  details: ProfileCardDetail[];
  /** badge shown bottom-left */
  footer?: React.ReactNode;
  onOpen: () => void;
  className?: string;
}

export function ProfileCard({ initials, name, code, status, subtitle, details, footer, onOpen, className }: ProfileCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col gap-4 rounded-2xl border bg-card p-5 text-left shadow-xs transition-all",
        "hover:-translate-y-0.5 hover:border-navy-600/50 hover:shadow-md focus-visible:border-navy-600 focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className={cn("text-sm font-semibold", avatarTone(code))}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-semibold leading-tight">{name}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{code}</p>
        </div>
        {status}
      </div>

      {subtitle ? <p className="-mt-1 truncate text-xs text-muted-foreground">{subtitle}</p> : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
        {details.map((d, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2 text-slate-600">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
              <AtomIcon name={d.icon} className="h-3.5 w-3.5" />
            </span>
            <dd className="truncate">{d.text}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex items-center justify-between border-t pt-3">
        {footer}
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-navy-800 group-hover:text-white">
          <AtomIcon name="ArrowRight" className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
