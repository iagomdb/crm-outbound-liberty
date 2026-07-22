import type { ReactNode } from "react";

// Renderizador mínimo de markdown (sem lib externa) pro script das carteiras.
// Cobre o que o playbook usa: títulos, **negrito**, *itálico*, `código`,
// > citações (as falas do script, destacadas), listas -/*/1. e --- separador.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={i} className="rounded bg-zinc-100 px-1 text-[0.85em] dark:bg-zinc-800">
          {part.slice(1, -1)}
        </code>
      );
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const H_CLASSES: Record<number, string> = {
  1: "mt-5 mb-2 text-base font-bold first:mt-0",
  2: "mt-5 mb-1.5 text-sm font-bold uppercase tracking-wide first:mt-0",
  3: "mt-4 mb-1 text-sm font-semibold first:mt-0",
};

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const t = lines[i].trim();

    if (!t) {
      i++;
      continue;
    }

    if (/^-{3,}$/.test(t)) {
      blocks.push(<hr key={key++} className="my-4 border-zinc-200 dark:border-zinc-800" />);
      i++;
      continue;
    }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 3);
      const cls = H_CLASSES[lvl];
      blocks.push(
        lvl === 1 ? (
          <h3 key={key++} className={cls}>{renderInline(h[2])}</h3>
        ) : lvl === 2 ? (
          <h4 key={key++} className={cls}>{renderInline(h[2])}</h4>
        ) : (
          <h5 key={key++} className={cls}>{renderInline(h[2])}</h5>
        ),
      );
      i++;
      continue;
    }

    if (t.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 flex flex-col gap-1 border-l-2 border-sky-400 bg-sky-50 px-3 py-2 dark:border-sky-600 dark:bg-sky-950"
        >
          {quote
            .filter(Boolean)
            .map((q, qi) => (
              <p key={qi} className="text-sm leading-relaxed text-sky-900 dark:text-sky-100">
                {renderInline(q)}
              </p>
            ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1.5 flex list-disc flex-col gap-1 pl-5">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="my-1.5 flex list-decimal flex-col gap-1 pl-5">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // parágrafo: junta linhas consecutivas "comuns"
    const para: string[] = [];
    while (i < lines.length) {
      const pt = lines[i].trim();
      if (!pt || /^(#{1,6}\s|>|[-*]\s|\d+[.)]\s|-{3,}$)/.test(pt)) break;
      para.push(pt);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1.5 text-sm leading-relaxed">
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
