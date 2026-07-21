import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { campaigns } from "../../src/db/schema";
import {
  MULTI_IMPORT_FIELDS,
  analyzeSheet,
  executeImport,
  loadWorkbook,
  previewImport,
  validateMapping,
  type ColumnMapping,
} from "../../src/core/import";

// CLI fino sobre o núcleo de importação (src/core/import.ts) — o mapeamento
// coluna → campo é o sugerido automaticamente pelos cabeçalhos. Para mapear
// na mão, use a tela web: /importar.

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const dryRun = argv.includes("--dry-run");
const campaignSlug = argv.find((a) => a.startsWith("--campaign="))?.split("=")[1] ?? "recuperacao-credito";

if (!file) {
  console.error("uso: npx tsx scripts/import/index.ts <arquivo.xlsx> [--campaign=slug] [--dry-run]");
  process.exit(1);
}

async function main() {
  const ws = await loadWorkbook(await readFile(path.resolve(file!)));
  const analysis = analyzeSheet(ws);

  // auto-mapeamento: campos únicos ficam com a primeira coluna que casar
  const mapping: ColumnMapping = {};
  const taken = new Set<string>();
  for (const c of analysis.columns) {
    if (!c.suggestion) continue;
    if (!MULTI_IMPORT_FIELDS.has(c.suggestion)) {
      if (taken.has(c.suggestion)) continue;
      taken.add(c.suggestion);
    }
    mapping[c.col] = c.suggestion;
  }
  const errors = validateMapping(mapping);
  if (errors.length) throw new Error(errors.join("; "));

  const db = getDb();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.slug, campaignSlug));
  if (!camp) throw new Error(`campanha '${campaignSlug}' não encontrada — rode: npm run db:seed`);

  if (dryRun) {
    const p = await previewImport(ws, analysis.headerRowIdx, mapping);
    console.log(
      `\ncampanha: ${camp.name}` +
        `\nlidas: ${p.read} | válidas: ${p.valid} | inválidas: ${p.invalid} | já existentes (serão mescladas): ${p.existing}` +
        "\n(dry-run: nada gravado)",
    );
    printSkips(p.skips);
    return;
  }

  const r = await executeImport(ws, analysis.headerRowIdx, mapping, camp.id);
  console.log(
    `\ncampanha: ${camp.name}` +
      `\nlidas: ${r.read} | novas: ${r.inserted} | atualizadas: ${r.updated} | ` +
      `puladas: ${r.skipped} | alvos criados: ${r.targetsCreated}` +
      `\n\ntriar agora → http://localhost:${process.env.WEB_PORT ?? 3000}/campaigns/${campaignSlug}/triagem`,
  );
  printSkips(r.skips);
}

function printSkips(skips: { rowIdx: number; rawCnpj: string }[]) {
  if (!skips.length) return;
  console.log("puladas (sem CNPJ válido):");
  skips.forEach((s) => console.log(`  linha ${s.rowIdx}: "${s.rawCnpj}"`));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("erro no import:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
