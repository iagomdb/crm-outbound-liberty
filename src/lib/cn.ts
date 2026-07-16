/** Junta classes condicionais. Mínimo — sem dependência externa (clsx/cva).
 *  Aceita strings, falsy (ignorados) e objetos { classe: boolean }. */
type ClassArg = string | number | false | null | undefined | Record<string, boolean>;

export function cn(...args: ClassArg[]): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === "string" || typeof a === "number") {
      out.push(String(a));
    } else {
      for (const [key, on] of Object.entries(a)) if (on) out.push(key);
    }
  }
  return out.join(" ");
}
