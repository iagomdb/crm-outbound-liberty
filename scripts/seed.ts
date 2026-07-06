import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns } from "../src/db/schema";

// Idempotente: cria a campanha #1 se ainda não existir.
async function main() {
  const db = getDb();
  const slug = "recuperacao-credito";

  const existing = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
  if (existing.length > 0) {
    console.log("Campanha já existe:", existing[0].name, `(${existing[0].id})`);
    return;
  }

  const [c] = await db
    .insert(campaigns)
    .values({
      name: "Recuperação de Crédito — Liberty",
      slug,
      description:
        "Recuperar créditos antigos já dados como perdidos (indústrias/distribuidoras médias). " +
        "SDR agenda reunião; o escritório tria os casos.",
      offerTerms:
        "Honorário de êxito — só paga se recuperar. Caso único (foot-in-the-door): pega 1 caso " +
        "já dado como perdido pra provar o trabalho antes de qualquer compromisso.",
      icp:
        "Indústria/distribuidora média (não micro, não grande), B2B, sem jurídico interno dono do " +
        "contas a receber. Qualificador real = estado mental: já deu o dinheiro como perdido.",
      scriptRef: "docs/cold-call-recuperacao-credito-v2.md",
      status: "ativa",
    })
    .returning();

  console.log("Campanha criada:", c.name, `(${c.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
