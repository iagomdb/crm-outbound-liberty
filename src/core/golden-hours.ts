/**
 * Golden hours do playbook: cedo (antes das reuniões) e fim de tarde (quando esvazia).
 * Segunda cedo e sexta à tarde não contam. Assume o fuso do servidor = America/Sao_Paulo
 * (definido via TZ no compose).
 */
export function isGoldenHour(d: Date = new Date()): boolean {
  const day = d.getDay(); // 0 dom ... 6 sáb
  const h = d.getHours();
  if (day === 0 || day === 6) return false;

  const manha = h >= 8 && h < 10;
  const fimTarde = h >= 16 && h < 18;
  if (!manha && !fimTarde) return false;

  if (day === 1 && manha) return false; // segunda cedo, esquece
  if (day === 5 && fimTarde) return false; // sexta à tarde, esquece
  return true;
}

/** Rótulo curto pra UI: "golden" / "ok" / "ruim". */
export function goldenHourLabel(d: Date = new Date()): "golden" | "ok" | "ruim" {
  const day = d.getDay();
  const h = d.getHours();
  if (day === 0 || day === 6) return "ruim";
  if (isGoldenHour(d)) return "golden";
  if (h >= 8 && h < 18) return "ok";
  return "ruim";
}
