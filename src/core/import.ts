import ExcelJS from "exceljs";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { companies, targets } from "../db/schema";

// Núcleo de importação de leads via planilha (.xlsx), compartilhado entre a
// tela web (/importar) e o CLI (scripts/import/index.ts).
//
// Fluxo: analyzeWorkbook() detecta cabeçalho/colunas e sugere um mapeamento
// coluna → campo; previewImport() valida sem gravar; executeImport() faz o
// upsert MERGE por CNPJ (nunca sobrescreve dado preenchido com vazio) e cria
// os alvos na carteira com dedup por (campanha, empresa).

// -------------------------------------------------------------- campos

export const IMPORT_FIELDS = [
  { key: "cnpj", label: "CNPJ" },
  { key: "razaoSocial", label: "Razão social / Nome", required: true },
  { key: "nomeFantasia", label: "Nome fantasia" },
  { key: "dataAbertura", label: "Data de abertura" },
  { key: "porte", label: "Porte" },
  { key: "cnaePrincipal", label: "CNAE principal" },
  { key: "cnaeSecundarios", label: "CNAE secundário", multi: true },
  { key: "naturezaJuridica", label: "Natureza jurídica" },
  { key: "capitalSocial", label: "Capital social" },
  { key: "tipoEmail", label: "Tipo de e-mail" },
  { key: "emails", label: "E-mail", multi: true },
  { key: "telefones", label: "Telefone", multi: true },
  { key: "cep", label: "CEP" },
  { key: "uf", label: "UF" },
  { key: "municipio", label: "Município" },
  { key: "bairro", label: "Bairro" },
  { key: "logradouro", label: "Logradouro" },
  { key: "numero", label: "Número" },
  { key: "complemento", label: "Complemento" },
  { key: "socios", label: "Quadro de sócios" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

/** Campos que aceitam mais de uma coluna mapeada (os valores se acumulam). */
export const MULTI_IMPORT_FIELDS = new Set<ImportField>(["cnaeSecundarios", "emails", "telefones"]);

/** coluna da planilha (1-based) → campo do sistema */
export type ColumnMapping = Record<number, ImportField>;

// -------------------------------------------------------------- helpers de parsing (formatos BR)

const digits = (s: string) => s.replace(/\D/g, "");

const normalizeCnpj = (s: string): string | null => {
  const d = digits(s);
  return d.length === 14 ? d : null;
};

/** "10.000,00" → "10000.00"; aceita também número puro de célula ("10000.5"). */
const parseMoney = (s: string): string | null => {
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n.toFixed(2) : null;
  }
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n.toFixed(2) : null;
};

/** "18/04/2024" → "2024-04-18" */
const parseDateBR = (s: string): string | null => {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** "[NOME => 65-Titular..., OUTRO => 49-Sócio]" → [{nome, qualificacao}] */
const parseSocios = (raw: string): { nome: string; qualificacao?: string }[] => {
  if (!raw) return [];
  try {
    const body = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!body) return [];
    const out = body
      .split(/,(?=[^,]*=>)/)
      .map((p) => {
        const [nome, qual] = p.split("=>");
        return { nome: (nome ?? "").trim(), qualificacao: qual?.trim() || undefined };
      })
      .filter((s) => s.nome);
    return out.length ? out : [{ nome: raw.slice(0, 200) }];
  } catch {
    return [{ nome: raw.slice(0, 200) }];
  }
};

/** Extrai texto de uma célula, lidando com hyperlink / rich text / fórmula / data. */
function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // célula tipada como data → volta pro formato BR que o parseDateBR entende
    const dd = String(v.getUTCDate()).padStart(2, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    const anyv = v as unknown as Record<string, unknown>;
    if (typeof anyv.text === "string") return anyv.text.trim();
    if (Array.isArray(anyv.richText)) return anyv.richText.map((r) => (r as { text: string }).text).join("").trim();
    if ("result" in anyv) return String(anyv.result).trim();
    return String(v).trim();
  }
  return String(v).trim();
}

// -------------------------------------------------------------- auto-sugestão de mapeamento

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/** Ordem importa: os padrões mais específicos vêm primeiro ("cnae sec" antes de "cnae"). */
const SUGGESTIONS: [RegExp, ImportField][] = [
  [/^cnpj/, "cnpj"],
  [/razao social|^razao$|^nome$/, "razaoSocial"],
  [/fantasia/, "nomeFantasia"],
  [/abertura/, "dataAbertura"],
  [/^porte/, "porte"],
  [/cnae sec/, "cnaeSecundarios"],
  [/cnae|^tipo$|categoria/, "cnaePrincipal"],
  [/natureza/, "naturezaJuridica"],
  [/capital/, "capitalSocial"],
  [/tipo\s*e-?mail/, "tipoEmail"],
  [/e-?mail/, "emails"],
  [/telefone|^fone|celular|whats/, "telefones"],
  [/^cep/, "cep"],
  [/^uf$|^estado$/, "uf"],
  [/municipio|cidade/, "municipio"],
  [/bairro/, "bairro"],
  [/logradouro|endereco/, "logradouro"],
  [/^numero$|^num\b|^nr?\b/, "numero"],
  [/complemento/, "complemento"],
  [/socio/, "socios"],
];

export function suggestField(header: string): ImportField | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const [re, field] of SUGGESTIONS) if (re.test(h)) return field;
  return null;
}

// -------------------------------------------------------------- análise da planilha

export type SheetColumn = {
  col: number;
  header: string;
  suggestion: ImportField | null;
  samples: string[];
};

export type SheetAnalysis = {
  sheetName: string;
  headerRowIdx: number;
  dataRowCount: number;
  columns: SheetColumn[];
};

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("planilha vazia");
  return ws;
}

/**
 * Detecta a linha de cabeçalho (primeira, entre as 20 iniciais, cujas células
 * casam com ≥2 campos conhecidos — pula linhas de lixo/marca d'água) e coleta
 * amostras de cada coluna para a tela de mapeamento.
 */
export function analyzeSheet(ws: ExcelJS.Worksheet): SheetAnalysis {
  let headerRowIdx = -1;
  const scanMax = Math.min(ws.rowCount, 20);
  for (let i = 1; i <= scanMax; i++) {
    let hits = 0;
    ws.getRow(i).eachCell((cell) => {
      if (suggestField(cellStr(cell.value))) hits++;
    });
    if (hits >= 2) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error("cabeçalho não encontrado — a planilha precisa de uma linha de títulos (ex.: CNPJ, Razão Social)");
  }

  const columns: SheetColumn[] = [];
  ws.getRow(headerRowIdx).eachCell((cell, col) => {
    const header = cellStr(cell.value);
    if (!header) return;
    const samples: string[] = [];
    for (let r = headerRowIdx + 1; r <= ws.rowCount && samples.length < 3; r++) {
      const v = cellStr(ws.getRow(r).getCell(col).value);
      if (v) samples.push(v.length > 60 ? `${v.slice(0, 60)}…` : v);
    }
    columns.push({ col, header, suggestion: suggestField(header), samples });
  });

  let dataRowCount = 0;
  for (let i = headerRowIdx + 1; i <= ws.rowCount; i++) {
    let empty = true;
    ws.getRow(i).eachCell(() => {
      empty = false;
    });
    if (!empty) dataRowCount++;
  }

  return { sheetName: ws.name, headerRowIdx, dataRowCount, columns };
}

// -------------------------------------------------------------- validação do mapeamento

/** Retorna mensagens de erro; vazio = mapeamento válido. */
export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  const byField = new Map<ImportField, number[]>();
  for (const [col, field] of Object.entries(mapping)) {
    byField.set(field, [...(byField.get(field) ?? []), Number(col)]);
  }
  for (const f of IMPORT_FIELDS) {
    const cols = byField.get(f.key) ?? [];
    if ("required" in f && f.required && cols.length === 0) errors.push(`o campo "${f.label}" precisa estar mapeado`);
    if (!MULTI_IMPORT_FIELDS.has(f.key) && cols.length > 1)
      errors.push(`o campo "${f.label}" está mapeado em mais de uma coluna`);
  }
  return errors;
}

// -------------------------------------------------------------- extração de linhas

type CompanyValues = typeof companies.$inferInsert;

type ExtractedRow =
  | { rowIdx: number; ok: true; values: CompanyValues }
  | { rowIdx: number; ok: false; rawCnpj: string; razaoSocial: string };

function* extractRows(ws: ExcelJS.Worksheet, headerRowIdx: number, mapping: ColumnMapping): Generator<ExtractedRow> {
  const colsFor = (field: ImportField) =>
    Object.entries(mapping)
      .filter(([, f]) => f === field)
      .map(([c]) => Number(c))
      .sort((a, b) => a - b);

  const fieldCols = new Map<ImportField, number[]>();
  for (const f of IMPORT_FIELDS) fieldCols.set(f.key, colsFor(f.key));
  const mappedCols = Object.keys(mapping).map(Number);

  for (let i = headerRowIdx + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const val = (field: ImportField): string => {
      for (const c of fieldCols.get(field)!) {
        const v = cellStr(row.getCell(c).value);
        if (v) return v;
      }
      return "";
    };
    /** campos multi: junta todas as colunas mapeadas e separa por ; ou , */
    const vals = (field: ImportField): string[] =>
      fieldCols
        .get(field)!
        .flatMap((c) => cellStr(row.getCell(c).value).split(/[;,]/))
        .map((v) => v.trim())
        .filter(Boolean);

    const rawCnpj = val("cnpj");
    const razaoSocial = val("razaoSocial");
    if (mappedCols.every((c) => !cellStr(row.getCell(c).value))) continue; // linha realmente vazia

    // CNPJ é opcional (leads de Google Maps não têm) — sem ele o dedup é por nome
    const cnpj = normalizeCnpj(rawCnpj);
    if (!razaoSocial) {
      yield { rowIdx: i, ok: false, rawCnpj, razaoSocial };
      continue;
    }

    yield {
      rowIdx: i,
      ok: true,
      values: {
        cnpj,
        razaoSocial,
        nomeFantasia: val("nomeFantasia") || null,
        dataAbertura: parseDateBR(val("dataAbertura")),
        porte: val("porte") || null,
        cnaePrincipal: val("cnaePrincipal") || null,
        cnaeSecundarios: vals("cnaeSecundarios"),
        naturezaJuridica: val("naturezaJuridica") || null,
        capitalSocial: parseMoney(val("capitalSocial")),
        tipoEmail: val("tipoEmail") || null,
        emails: vals("emails"),
        telefones: vals("telefones").map(digits).filter(Boolean),
        cep: digits(val("cep")) || null,
        uf: val("uf").slice(0, 2).toUpperCase() || null,
        municipio: val("municipio") || null,
        bairro: val("bairro") || null,
        logradouro: val("logradouro") || null,
        numero: val("numero") || null,
        complemento: val("complemento") || null,
        socios: parseSocios(val("socios")),
      },
    };
  }
}

// -------------------------------------------------------------- preview (nada é gravado)

export type ImportPreview = {
  read: number;
  valid: number;
  invalid: number;
  /** CNPJs que já existem no sistema (serão mesclados, não duplicados) */
  existing: number;
  skips: { rowIdx: number; rawCnpj: string; razaoSocial: string }[];
};

export async function previewImport(
  ws: ExcelJS.Worksheet,
  headerRowIdx: number,
  mapping: ColumnMapping,
): Promise<ImportPreview> {
  const preview: ImportPreview = { read: 0, valid: 0, invalid: 0, existing: 0, skips: [] };
  const rows: { cnpj: string | null; nameLower: string }[] = [];

  for (const r of extractRows(ws, headerRowIdx, mapping)) {
    preview.read++;
    if (r.ok) {
      preview.valid++;
      rows.push({ cnpj: r.values.cnpj ?? null, nameLower: r.values.razaoSocial.toLowerCase() });
    } else {
      preview.invalid++;
      if (preview.skips.length < 10) preview.skips.push({ rowIdx: r.rowIdx, rawCnpj: r.rawCnpj, razaoSocial: r.razaoSocial });
    }
  }

  // já existentes: com CNPJ o dedup é pelo CNPJ; sem, pelo nome (como no import de Maps)
  const db = getDb();
  const cnpjs = [...new Set(rows.filter((r) => r.cnpj).map((r) => r.cnpj!))];
  const names = [...new Set(rows.filter((r) => !r.cnpj).map((r) => r.nameLower))];
  const foundCnpjs = new Set<string>();
  const foundNames = new Set<string>();
  for (let i = 0; i < cnpjs.length; i += 500) {
    const found = await db
      .select({ cnpj: companies.cnpj })
      .from(companies)
      .where(inArray(companies.cnpj, cnpjs.slice(i, i + 500)));
    for (const f of found) if (f.cnpj) foundCnpjs.add(f.cnpj);
  }
  for (let i = 0; i < names.length; i += 500) {
    const found = await db
      .select({ nome: sql<string>`lower(${companies.razaoSocial})` })
      .from(companies)
      .where(inArray(sql`lower(${companies.razaoSocial})`, names.slice(i, i + 500)));
    for (const f of found) foundNames.add(f.nome);
  }
  preview.existing = rows.filter((r) => (r.cnpj ? foundCnpjs.has(r.cnpj) : foundNames.has(r.nameLower))).length;

  return preview;
}

// -------------------------------------------------------------- execução

export type ImportResult = {
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  targetsCreated: number;
  skips: { rowIdx: number; rawCnpj: string; razaoSocial: string }[];
};

// Upsert que faz MERGE por CNPJ: nunca sobrescreve dado preenchido com vazio.
// (texto: mantém o antigo se o novo vier nulo; array: mantém se o novo vier vazio)
const keepText = (colName: string) => sql.raw(`coalesce(excluded.${colName}, companies.${colName})`);
const keepArray = (colName: string) =>
  sql.raw(
    `case when jsonb_array_length(excluded.${colName}) > 0 then excluded.${colName} else companies.${colName} end`,
  );

export async function executeImport(
  ws: ExcelJS.Worksheet,
  headerRowIdx: number,
  mapping: ColumnMapping,
  campaignId: string,
): Promise<ImportResult> {
  const db = getDb();
  const result: ImportResult = { read: 0, inserted: 0, updated: 0, skipped: 0, targetsCreated: 0, skips: [] };

  for (const r of extractRows(ws, headerRowIdx, mapping)) {
    result.read++;
    if (!r.ok) {
      result.skipped++;
      if (result.skips.length < 10) result.skips.push({ rowIdx: r.rowIdx, rawCnpj: r.rawCnpj, razaoSocial: r.razaoSocial });
      continue;
    }

    let company: { id: string; icpFit: boolean | null };

    if (!r.values.cnpj) {
      // sem CNPJ (ex.: Google Maps): dedup por nome — reusa a empresa sem sobrescrever nada
      const [existing] = await db
        .select({ id: companies.id, icpFit: companies.icpFit })
        .from(companies)
        .where(sql`lower(${companies.razaoSocial}) = ${r.values.razaoSocial.toLowerCase()}`)
        .limit(1);
      if (existing) {
        company = existing;
        result.updated++;
      } else {
        const [c] = await db.insert(companies).values(r.values).returning({ id: companies.id, icpFit: companies.icpFit });
        company = c;
        result.inserted++;
      }
    } else {
      // com CNPJ: upsert MERGE — nunca sobrescreve dado preenchido com vazio
      const [c] = await db
        .insert(companies)
        .values(r.values)
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

      if (c.inserted) result.inserted++;
      else result.updated++;
      company = c;
    }

    // empresa já triada como fit (em import anterior/outra carteira) pula a triagem
    const t = await db
      .insert(targets)
      .values({ campaignId, companyId: company.id, ...(company.icpFit ? { stage: "fit" as const } : {}) })
      .onConflictDoNothing({ target: [targets.campaignId, targets.companyId] })
      .returning({ id: targets.id });
    if (t.length) result.targetsCreated++;
  }

  return result;
}
