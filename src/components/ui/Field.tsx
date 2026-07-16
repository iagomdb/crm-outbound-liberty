import { cn } from "@/lib/cn";

// Server Components puros.

export const labelClasses = "text-xs font-medium text-zinc-500";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn(labelClasses, "block", className)} {...props} />;
}

type FieldProps = {
  label: React.ReactNode;
  /** dica curta abaixo do controle */
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** Rótulo + controle + dica empilhados. Padroniza o "<div className={lbl}>…</div><input/>" repetido. */
export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <div className={labelClasses}>{label}</div>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}
