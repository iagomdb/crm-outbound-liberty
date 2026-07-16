import { cn } from "@/lib/cn";

// Server Component puro.

export type BadgeTone = "neutral" | "emerald" | "amber" | "orange" | "red" | "sky";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
};

type BadgeProps = React.ComponentProps<"span"> & {
  tone?: BadgeTone;
  /** true = pílula arredondada (rounded-full); false = cantos suaves */
  pill?: boolean;
};

export function Badge({ tone = "neutral", pill, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium",
        pill ? "rounded-full" : "rounded",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
