import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns, emailTemplates } from "../src/db/schema";

const TEMPLATE_PADRAO = {
  name: "Follow-up pós-ligação — outras áreas",
  subject: "Obrigado pela conversa — outras áreas do escritório",
  body: `Obrigado pelo tempo na ligação de hoje.

Aproveitei para apresentar rapidamente outras áreas de atuação do escritório que podem ser úteis no dia a dia da empresa:

• Contratos empresariais — elaboração, revisão e negociação com clientes e fornecedores;

• Trabalhista (empregador) — prevenção de passivos e defesa em reclamações trabalhistas;

• Cível — disputas contratuais, indenizações e cobranças;

• Imobiliário — locações comerciais, regularização de imóveis e outras demandas patrimoniais.

Se surgir alguma situação em que possamos ajudar, basta responder este e-mail ou entrar em contato. O escritório analisa cada caso com transparência e informa, com franqueza, qual o melhor caminho.

Obrigado novamente pela conversa.

Abraço,

Iago Bernardi`,
};

// Idempotente: cria o template padrão de e-mail se ainda não existir.
async function seedTemplates(db: ReturnType<typeof getDb>) {
  const existing = await db.select().from(emailTemplates).where(eq(emailTemplates.name, TEMPLATE_PADRAO.name));
  if (existing.length > 0) {
    console.log("Template já existe:", existing[0].name);
    return;
  }
  await db.insert(emailTemplates).values(TEMPLATE_PADRAO);
  console.log("Template criado:", TEMPLATE_PADRAO.name);
}

// Idempotente: cria a campanha #1 se ainda não existir.
async function main() {
  const db = getDb();
  const slug = "recuperacao-credito";

  await seedTemplates(db);

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
