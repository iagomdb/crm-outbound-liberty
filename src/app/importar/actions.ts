"use server";

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
  executeImport,
  loadWorkbook,
  previewImport,
  validateMapping,
  type ColumnMapping,
  type ImportField,
} from "@/core/import";
import { UPLOAD_DIR, cleanupOldUploads, isValidToken, metaPath, readSheet, sheetPath } from "./storage";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Passo 1: recebe o .xlsx, guarda no tmp e vai pra tela de mapeamento. */
export async function uploadSheet(fd: FormData) {
  await requireUser();

  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) redirect(`/importar?err=${encodeURIComponent("escolha um arquivo")}`);
  if (!/\.xlsx$/i.test(file.name)) redirect(`/importar?err=${encodeURIComponent("envie um arquivo .xlsx")}`);

  await cleanupOldUploads();
  const token = randomBytes(16).toString("hex");
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(sheetPath(token), Buffer.from(await file.arrayBuffer()));
  await writeFile(metaPath(token), JSON.stringify({ name: file.name, size: file.size }));

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

/** Passo 2: simula (dryRun) ou executa o import com o mapeamento escolhido. */
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

  const buffer = await readSheet(token);
  if (!buffer) back(token, { err: "upload expirou — envie a planilha de novo" });
  const ws = await loadWorkbook(buffer!);
  const { headerRowIdx } = analyzeSheet(ws);

  if (dryRun) {
    const preview = await previewImport(ws, headerRowIdx, mapping);
    back(token, { p: JSON.stringify(preview), m: stateParam });
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

  const result = await executeImport(ws, headerRowIdx, mapping, campaign.id);

  await unlink(sheetPath(token)).catch(() => {});
  await unlink(metaPath(token)).catch(() => {});
  revalidatePath("/", "layout");

  back(token, {
    done: JSON.stringify({
      ...result,
      skips: result.skips.slice(0, 10),
      campaignName: campaign.name,
      campaignSlug: campaign.slug ?? "",
    }),
  });
}
