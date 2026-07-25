"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, like } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { slugify } from "@/lib/slugify";
import {
  IMPORT_FIELDS,
  analyzeSheet,
  applyHeaderMapping,
  executeImport,
  loadWorkbook,
  mappingByHeader,
  previewImport,
  validateMapping,
  type ColumnMapping,
  type ImportField,
  type ImportPreview,
  type ImportResult,
} from "@/core/import";
import { UPLOAD_DIR, cleanupOldUploads, deleteUpload, isValidToken, metaPath, readSheets, sheetPath } from "./storage";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Passo 1: recebe um ou mais .xlsx (mesma estrutura), guarda no tmp e vai pra tela de mapeamento. */
export async function uploadSheet(fd: FormData) {
  await requireUser();

  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) redirect(`/importar?err=${encodeURIComponent("escolha pelo menos um arquivo")}`);
  for (const f of files) {
    if (!/\.xlsx$/i.test(f.name)) redirect(`/importar?err=${encodeURIComponent(`"${f.name}" não é .xlsx`)}`);
  }

  await cleanupOldUploads();
  const token = randomBytes(16).toString("hex");
  await mkdir(UPLOAD_DIR, { recursive: true });
  for (const [i, f] of files.entries()) {
    await writeFile(sheetPath(token, i), Buffer.from(await f.arrayBuffer()));
  }
  await writeFile(metaPath(token), JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size })) }));

  redirect(`/importar/${token}`);
}

/** Estado do form de mapeamento, preservado na URL entre simulação/erros. */
export type MappingState = {
  map: Record<string, ImportField>;
  campaignSlug: string;
  newCampaignName: string;
};

const FIELD_KEYS = new Set<string>(IMPORT_FIELDS.map((f) => f.key));

function back(token: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(`/importar/${token}?${q}`);
}

/** Passo 2: simula (dryRun) ou executa o import — todos os arquivos do upload, mapeados pelo 1º. */
export async function runImport(token: string, dryRun: boolean, fd: FormData) {
  await requireUser();
  if (!isValidToken(token)) redirect("/importar");

  // reconstrói o mapeamento coluna → campo a partir dos selects
  const mapping: ColumnMapping = {};
  const state: MappingState = { map: {}, campaignSlug: s(fd.get("campaignSlug")), newCampaignName: s(fd.get("newCampaignName")) };
  for (const [key, value] of fd.entries()) {
    const m = key.match(/^map_(\d+)$/);
    if (!m || typeof value !== "string" || !FIELD_KEYS.has(value)) continue;
    mapping[Number(m[1])] = value as ImportField;
    state.map[m[1]] = value as ImportField;
  }
  const stateParam = JSON.stringify(state);

  const errors = validateMapping(mapping);
  if (state.campaignSlug && state.newCampaignName) errors.push("escolha uma carteira existente OU dê nome a uma nova — não os dois");
  if (!dryRun && !state.campaignSlug && !state.newCampaignName) errors.push("escolha a carteira de destino (existente ou nova)");
  if (errors.length) back(token, { err: errors.join("; "), m: stateParam });

  const sheets = await readSheets(token);
  if (!sheets.length) back(token, { err: "upload expirou — envie a planilha de novo" });

  // o mapeamento foi feito sobre o 1º arquivo; nos demais reaplica pelo cabeçalho
  const parsed: { ws: Awaited<ReturnType<typeof loadWorkbook>>; headerRowIdx: number; mapping: ColumnMapping }[] = [];
  let byHeader: Map<string, ImportField> | null = null;
  for (const [i, sheet] of sheets.entries()) {
    let ws;
    let analysis;
    try {
      ws = await loadWorkbook(sheet.buffer);
      analysis = analyzeSheet(ws);
    } catch (e) {
      back(token, { err: `arquivo ${i + 1} ilegível: ${e instanceof Error ? e.message : "erro"}`, m: stateParam });
    }
    if (i === 0) {
      byHeader = mappingByHeader(analysis!, mapping);
      parsed.push({ ws: ws!, headerRowIdx: analysis!.headerRowIdx, mapping });
    } else {
      parsed.push({ ws: ws!, headerRowIdx: analysis!.headerRowIdx, mapping: applyHeaderMapping(analysis!, byHeader!) });
    }
  }

  if (dryRun) {
    const total: ImportPreview = { read: 0, valid: 0, invalid: 0, existing: 0, skips: [] };
    for (const p of parsed) {
      const r = await previewImport(p.ws, p.headerRowIdx, p.mapping);
      total.read += r.read;
      total.valid += r.valid;
      total.invalid += r.invalid;
      total.existing += r.existing;
      total.skips = [...total.skips, ...r.skips].slice(0, 10);
    }
    back(token, { p: JSON.stringify(total), m: stateParam });
  }

  // resolve a carteira: existente por slug, ou cria uma nova
  const db = getDb();
  let campaign: { id: string; slug: string | null; name: string };
  if (state.newCampaignName) {
    const base = slugify(state.newCampaignName) || "carteira";
    const taken = new Set(
      (await db.select({ slug: campaigns.slug }).from(campaigns).where(like(campaigns.slug, `${base}%`))).map(
        (r) => r.slug,
      ),
    );
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    [campaign] = await db
      .insert(campaigns)
      .values({ name: state.newCampaignName, slug })
      .returning({ id: campaigns.id, slug: campaigns.slug, name: campaigns.name });
  } else {
    const [found] = await db.select().from(campaigns).where(eq(campaigns.slug, state.campaignSlug));
    if (!found) back(token, { err: `carteira "${state.campaignSlug}" não encontrada`, m: stateParam });
    campaign = found!;
  }

  const total: ImportResult = { read: 0, inserted: 0, updated: 0, skipped: 0, targetsCreated: 0, skips: [] };
  for (const p of parsed) {
    const r = await executeImport(p.ws, p.headerRowIdx, p.mapping, campaign.id);
    total.read += r.read;
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.skipped += r.skipped;
    total.targetsCreated += r.targetsCreated;
    total.skips = [...total.skips, ...r.skips].slice(0, 10);
  }

  await deleteUpload(token);
  revalidatePath("/", "layout");

  back(token, {
    done: JSON.stringify({
      ...total,
      campaignName: campaign.name,
      campaignSlug: campaign.slug ?? "",
      arquivos: sheets.length,
    }),
  });
}
