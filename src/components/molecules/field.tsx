// MOLECULE: a form field — normal-case label, the control, then an optional hint or error underneath.
// Focus is shown by the control's border colour only (see ui/input, ui/textarea, ui/select).
//
//   <Field label="First name" required error={errors.firstName?.message}>
//     <Input {...register("firstName")} />
//   </Field>
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  /** id of the control, so clicking the label focuses it */
  htmlFor?: string;
  required?: boolean;
  /** helper text; hidden while an error is shown */
  hint?: React.ReactNode;
  error?: string;
  className?: string;
}

export function Field({ label, children, htmlFor, required, hint, error, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
