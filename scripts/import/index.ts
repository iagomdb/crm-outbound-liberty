import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { campaigns, companies, targets } from "../../src/db/schema";

// -------------------------------------------------------------- args
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const dryRun = argv.includes("--dry-run");
const campaignSlug = argv.find((a) => a.startsWith("--campaign="))?.split("=")[1] ?? "recuperacao-credito";

if (!file) {
  console.error("uso: npm run import -- <arquivo.xlsx> [--campaign=slug] [--dry-run]");
  process.exit(1);
}

// -------------------------------------------------------------- helpers
const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const normalizeCnpj = (s?: string | null) => {
  const d = digits(s);
  return d.length === 14 ? d : null;
};
const parseBRNumber = (s?: string | null): string | null => {
  if (!s) return null;
  const cleaned = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n.toFixed(2) : null;
};
const parseDateBR = (s?: string | null): string | null => {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const parseSocios = (raw?: string | null): { nome: string; qualificacao?: string }[] => {
  if (!raw) return [];
  try {
    const body = String(raw).trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!body) return [];
    const out = body
      .split(/,(?=[^,]*=>)/)
      .map((p) => {
        const [nome, qual] = p.split("=>");
        return { nome: (nome ?? "").trim(), qualificacao: qual?.trim() || undefined };
      })
      .filter((s) => s.nome);
    return out.length ? out : [{ nome: String(raw).slice(0, 200) }];
  } catch {
    return [{ nome: String(raw).slice(0, 200) }];
  }
};

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

const rowSchema = z.object({
  cnpj: z.string().length(14),
  razaoSocial: z.string().min(1),
});

// Upsert que faz MERGE por CNPJ: nunca sobrescreve dado preenchido com vazio.
// (texto: mantém o antigo se o novo vier nulo; array: mantém se o novo vier vazio)
const keepText = (colName: string) => sql.raw(`coalesce(excluded.${colName}, companies.${colName})`);
const keepArray = (colName: string) =>
  sql.raw(
    `case when jsonb_array_length(excluded.${colName}) > 0 then excluded.${colName} else companies.${colName} end`,
  );

// -------------------------------------------------------------- run
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file!));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("planilha vazia");

  // acha a linha de cabeçalho (a que tem a coluna "CNPJ") — pula linhas de lixo/marca d'água
  let headerRowIdx = -1;
  for (let i = 1; i <= ws.rowCount; i++) {
    let found = false;
    ws.getRow(i).eachCell((cell) => {
      if (cellStr(cell.value).toUpperCase() === "CNPJ") found = true;
    });
    if (found) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("cabeçalho com coluna 'CNPJ' não encontrado");

  const col = new Map<string, number>();
  ws.getRow(headerRowIdx).eachCell((cell, c) => {
    const h = cellStr(cell.value);
    if (h) col.set(h, c);
  });
  const get = (row: ExcelJS.Row, header: string) => {
    const c = col.get(header);
    return c ? cellStr(row.getCell(c).value) : "";
  };
  const cnaeSecHeaders = [...col.keys()].filter((h) => /^CNAE Sec\./i.test(h)).sort();

  const db = getDb();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.slug, campaignSlug));
  if (!camp) throw new Error(`campanha '${campaignSlug}' não encontrada — rode: npm run db:seed`);

  const stats = { read: 0, inserted: 0, updated: 0, skipped: 0, targetsCreated: 0 };
  const skips: { row: number; cnpj: string }[] = [];

  for (let i = headerRowIdx + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const rawCnpj = get(row, "CNPJ");
    const razaoSocial = get(row, "Razão Social");
    if (!rawCnpj && !razaoSocial) continue; // linha realmente vazia
    stats.read++;

    const cnpj = normalizeCnpj(rawCnpj);
    const ok = rowSchema.safeParse({ cnpj, razaoSocial });
    if (!ok.success) {
      stats.skipped++;
      skips.push({ row: i, cnpj: rawCnpj });
      continue;
    }

    const values = {
      cnpj: cnpj!,
      razaoSocial,
      nomeFantasia: get(row, "Nome Fantasia") || null,
      dataAbertura: parseDateBR(get(row, "Data Abertura")),
      porte: get(row, "Porte") || null,
      cnaePrincipal: get(row, "CNAE Principal") || null,
      cnaeSecundarios: cnaeSecHeaders.map((h) => get(row, h)).filter(Boolean),
      naturezaJuridica: get(row, "Natureza Jurídica") || null,
      capitalSocial: parseBRNumber(get(row, "Capital Social")),
      tipoEmail: get(row, "Tipo Email") || null,
      emails: [get(row, "Email 1"), get(row, "Email 2")].filter(Boolean),
      telefones: [get(row, "Telefone 1"), get(row, "Telefone 2")].filter(Boolean),
      cep: digits(get(row, "CEP")) || null,
      uf: (get(row, "UF") || null)?.slice(0, 2) ?? null,
      municipio: get(row, "Município") || null,
      bairro: get(row, "Bairro") || null,
      logradouro: get(row, "Logradouro") || null,
      numero: get(row, "Número") || null,
      complemento: get(row, "Complemento") || null,
      socios: parseSocios(get(row, "Quadro de Sócios")),
    };

    if (dryRun) continue;

    const [c] = await db
      .insert(companies)
      .values(values)
      .onConflictDoUpdate({
        target: companies.cnpj,
        set: {
          razaoSocial: keepText("razao_social"),
          nomeFantasia: keepText("nome_fantasia"),
          dataAbertura: keepText("data_abertura"),
          porte: keepText("porte"),
          cnaePrincipal: keepText("cnae_principal"),
          cnaeSecundarios: keepArray("cnae_secundarios"),
          naturezaJuridica: keepText("natureza_juridica"),
          capitalSocial: keepText("capital_social"),
          tipoEmail: keepText("tipo_email"),
          emails: keepArray("emails"),
          telefones: keepArray("telefones"),
          cep: keepText("cep"),
          uf: keepText("uf"),
          municipio: keepText("municipio"),
          bairro: keepText("bairro"),
          logradouro: keepText("logradouro"),
          numero: keepText("numero"),
          complemento: keepText("complemento"),
          socios: keepArray("socios"),
          updatedAt: new Date(),
        },
      })
      .returning({ id: companies.id, inserted: sql<boolean>`(xmax = 0)`, icpFit: companies.icpFit });

    if (c.inserted) stats.inserted++;
    else stats.updated++;

    // empresa já triada como fit (em import anterior/outra campanha) pula a triagem
    const t = await db
      .insert(targets)
      .values({ campaignId: camp.id, companyId: c.id, ...(c.icpFit ? { stage: "fit" as const } : {}) })
      .onConflictDoNothing({ target: [targets.campaignId, targets.companyId] })
      .returning({ id: targets.id });
    if (t.length) stats.targetsCreated++;
  }

  console.log(
    `\ncampanha: ${camp.name}` +
      `\nlidas: ${stats.read} | novas: ${stats.inserted} | atualizadas: ${stats.updated} | ` +
      `puladas: ${stats.skipped} | alvos criados: ${stats.targetsCreated}` +
      (dryRun
        ? "\n(dry-run: nada gravado)"
        : `\n\ntriar agora → http://localhost:${process.env.WEB_PORT ?? 3000}/campaigns/${campaignSlug}/triagem`),
  );
  if (skips.length) {
    console.log("puladas (sem CNPJ válido):");
    skips.slice(0, 10).forEach((s) => console.log(`  linha ${s.row}: "${s.cnpj}"`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("erro no import:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
