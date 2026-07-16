import { cn } from "@/lib/cn";

// Server Component puro. Substitui a "casca de card" repetida ~22 vezes:
// "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"

type CardProps = React.ComponentProps<"section"> & {
  /** título opcional renderizado como <h2> no topo do card */
  title?: React.ReactNode;
  /** conteúdo à direita do título (contador, ação, etc) */
  aside?: React.ReactNode;
};

export function Card({ title, aside, className, children, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
      {...props}
    >
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
