import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { campaigns, companies, targets } from "../../src/db/schema";

// Importa lista raspada do Google Maps (colunas: Link google maps | Nome | Tipo |
// Telefone | Endereco | W4Efsd * | URL). Sem CNPJ — dedup por nome (razão social).
// A categoria do Google vai em cnaePrincipal (é o que a triagem de ICP mostra).

// -------------------------------------------------------------- args
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const dryRun = argv.includes("--dry-run");
const campaignSlug = argv.find((a) => a.startsWith("--campaign="))?.split("=")[1] ?? "recuperacao-credito";

if (!file) {
  console.error("uso: npx tsx scripts/import/google.ts <arquivo.xlsx> [--campaign=slug] [--dry-run]");
  process.exit(1);
}

// -------------------------------------------------------------- helpers
/** Extrai o texto de uma célula, lidando com hyperlink / rich text / fórmula. */
function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return "";
  if (typeof v === "object") {
    const anyv = v as unknown as Record<string, unknown>;
    if (typeof anyv.text === "string") return anyv.text.trim();
    if (Array.isArray(anyv.richText)) return anyv.richText.map((r) => (r as { text: string }).text).join("").trim();
    if ("result" in anyv) return String(anyv.result).trim();
    return String(v).trim();
  }
  return String(v).trim();
}

/** Remove os separadores "·" que o scrape traz colados no texto. */
const clean = (s: string) => s.replace(/^[·\s]+|[·\s]+$/g, "").trim();

const isHours = (s: string) => /fecha|reabre|abre às|aberto|fechado|24 horas/i.test(s);
const looksLikeAddress = (s: string) => s.length > 3 && /[a-zà-ú]/i.test(s) && !isHours(s);

/** Tira tracking (?utm_...) do site. */
const cleanUrl = (s: string) => {
  const u = clean(s);
  if (!u) return "";
  return u.includes("utm_") ? u.split("?")[0] : u;
};

const rowSchema = z.object({ nome: z.string().min(1) });

// -------------------------------------------------------------- run
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file!));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("planilha vazia");

  // acha a linha de cabeçalho (a que tem a coluna "Nome")
  let headerRowIdx = -1;
  for (let i = 1; i <= ws.rowCount; i++) {
    let found = false;
    ws.getRow(i).eachCell((cell) => {
      if (cellStr(cell.value).toLowerCase() === "nome") found = true;
    });
    if (found) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("cabeçalho com coluna 'Nome' não encontrado");

  const col = new Map<string, number>();
  ws.getRow(headerRowIdx).eachCell((cell, c) => {
    const h = cellStr(cell.value);
    if (h) col.set(h.toLowerCase(), c);
  });
  const get = (row: ExcelJS.Row, header: string) => {
    const c = col.get(header.toLowerCase());
    return c ? cellStr(row.getCell(c).value) : "";
  };
  // colunas de scrape sem nome estável (endereço/horário caem nelas)
  const extraCols = [...col.entries()].filter(([h]) => /^w4efsd/i.test(h)).map(([, c]) => c);

  const db = getDb();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.slug, campaignSlug));
  if (!camp) throw new Error(`campanha '${campaignSlug}' não encontrada — rode: npm run db:seed`);

  const stats = { read: 0, inserted: 0, duplicated: 0, skipped: 0, targetsCreated: 0 };
  const seen = new Set<string>(); // dedup dentro do próprio arquivo

  for (let i = headerRowIdx + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const nome = clean(get(row, "Nome"));
    if (!nome) continue; // linha vazia do scrape
    stats.read++;

    const ok = rowSchema.safeParse({ nome });
    if (!ok.success || seen.has(nome.toLowerCase())) {
      stats.skipped++;
      continue;
    }
    seen.add(nome.toLowerCase());

    const tipo = clean(get(row, "Tipo"));
    const telefone = clean(get(row, "Telefone"));
    const site = cleanUrl(get(row, "URL"));
    const mapsLink = clean(get(row, "Link google maps"));

    // endereço: coluna "Endereco" ou a primeira coluna de scrape que parecer endereço
    const candidates = [clean(get(row, "Endereco")), ...extraCols.map((c) => clean(cellStr(row.getCell(c).value)))];
    const endereco = candidates.find(looksLikeAddress) ?? null;
    const horario = candidates.map((s) => (isHours(s) ? s : "")).find(Boolean) ?? null;

    const notes =
      [site && `site: ${site}`, horario && `horário: ${horario}`, mapsLink && `maps: ${mapsLink}`]
        .filter(Boolean)
        .join("\n") || null;

    if (dryRun) continue;

    // dedup por nome: reusa a empresa se já existe (não sobrescreve nada)
    const [existing] = await db
      .select({ id: companies.id, icpFit: companies.icpFit })
      .from(companies)
      .where(sql`lower(${companies.razaoSocial}) = ${nome.toLowerCase()}`)
      .limit(1);

    let companyId: string;
    const companyFit = existing?.icpFit === true;
    if (existing) {
      companyId = existing.id;
      stats.duplicated++;
    } else {
      const [c] = await db
        .insert(companies)
        .values({
          cnpj: null,
          razaoSocial: nome,
          cnaePrincipal: tipo || null, // categoria do Google — é o que decide o fit na triagem
          telefones: telefone ? [telefone] : [],
          logradouro: endereco,
          source: "google-maps",
          notes,
        })
        .returning({ id: companies.id });
      companyId = c.id;
      stats.inserted++;
    }

    const t = await db
      .insert(targets)
      .values({ campaignId: camp.id, companyId, ...(companyFit ? { stage: "fit" as const } : {}) })
      .onConflictDoNothing({ target: [targets.campaignId, targets.companyId] })
      .returning({ id: targets.id });
    if (t.length) stats.targetsCreated++;
  }

  console.log(
    `\ncampanha: ${camp.name}` +
      `\nlidas: ${stats.read} | novas: ${stats.inserted} | já existiam: ${stats.duplicated} | ` +
      `puladas: ${stats.skipped} | alvos criados: ${stats.targetsCreated}` +
      (dryRun
        ? "\n(dry-run: nada gravado)"
        : `\n\ntriar agora → http://localhost:${process.env.WEB_PORT ?? 3000}/campaigns/${campaignSlug}/triagem`),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("erro no import:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
