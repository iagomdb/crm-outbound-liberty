import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns } from "../src/db/schema";

// Carrega um arquivo markdown no script/pitch de uma carteira.
// uso: npx tsx scripts/set-script.ts <slug-da-carteira> <arquivo.md>
// (rodar via npx tsx direto — npm engole argumentos no Windows)

const [slug, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  if (!slug || !file) {
    console.error("uso: npx tsx scripts/set-script.ts <slug-da-carteira> <arquivo.md>");
    process.exit(1);
  }
  const md = await readFile(path.resolve(file), "utf8");
  const db = getDb();
  const [c] = await db
    .update(campaigns)
    .set({ script: md, updatedAt: new Date() })
    .where(eq(campaigns.slug, slug))
    .returning({ name: campaigns.name });
  if (!c) throw new Error(`carteira '${slug}' não encontrada`);
  console.log(`script carregado em: ${c.name} (${md.length} caracteres)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("erro:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
