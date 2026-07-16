import "dotenv/config";
import { eq, like } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns, companies, targets } from "../src/db/schema";

/**
 * Carteira SANDBOX pra aprender a dinâmica do CRM sem medo de estragar nada.
 * Cria a campanha "carteira-teste" + 6 empresas fictícias (CNPJ prefixo 99…,
 * razão social com [TESTE]) já como alvos, todas SEM triagem — o fluxo começa
 * na triagem de ICP, como na vida real.
 *
 *   criar:  npx tsx scripts/seed-teste.ts
 *   limpar: npx tsx scripts/seed-teste.ts --limpar
 */

const SLUG = "carteira-teste";

// 4 dentro do ICP (indústria/distribuidora média) + 2 fora (micro e grande)
// pra você exercitar o "aprovar/reprovar" na triagem.
const EMPRESAS = [
  {
    cnpj: "99000000000101",
    razaoSocial: "[TESTE] Metalurgica Aurora LTDA",
    nomeFantasia: "Aurora Metais",
    porte: "MEDIA",
    capitalSocial: "800000.00",
    cnaePrincipal: "2451-2/00 Fundição de ferro e aço",
    uf: "RS",
    municipio: "Caxias do Sul",
    telefones: ["5133330101"],
    prioridade: 10, // decisor conhecido — sobe pro topo do estado zero
  },
  {
    cnpj: "99000000000202",
    razaoSocial: "[TESTE] Distribuidora Horizonte de Alimentos LTDA",
    nomeFantasia: "Horizonte Alimentos",
    porte: "MEDIA",
    capitalSocial: "1200000.00",
    cnaePrincipal: "4639-7/01 Comércio atacadista de produtos alimentícios",
    uf: "SP",
    municipio: "Campinas",
    telefones: ["1933330202", "19999990202"],
    prioridade: 0,
  },
  {
    cnpj: "99000000000303",
    razaoSocial: "[TESTE] Industria de Plasticos Vale Verde SA",
    nomeFantasia: "Vale Verde Plásticos",
    porte: "MEDIA",
    capitalSocial: "950000.00",
    cnaePrincipal: "2222-6/00 Fabricação de embalagens de plástico",
    uf: "PR",
    municipio: "Maringá",
    telefones: ["4433330303"],
    prioridade: 0,
  },
  {
    cnpj: "99000000000404",
    razaoSocial: "[TESTE] Atacado Serra Azul LTDA",
    nomeFantasia: "Serra Azul Atacado",
    porte: "MEDIA",
    capitalSocial: "600000.00",
    cnaePrincipal: "4646-0/01 Comércio atacadista de cosméticos",
    uf: "MG",
    municipio: "Uberlândia",
    telefones: ["3433330404"],
    prioridade: 0,
  },
  {
    cnpj: "99000000000505",
    razaoSocial: "[TESTE] Padaria Pao Quente ME",
    nomeFantasia: "Pão Quente",
    porte: "MICRO", // fora do ICP — reprove na triagem
    capitalSocial: "15000.00",
    cnaePrincipal: "1091-1/02 Fabricação de produtos de padaria",
    uf: "RS",
    municipio: "Porto Alegre",
    telefones: ["5133330505"],
    prioridade: 0,
  },
  {
    cnpj: "99000000000606",
    razaoSocial: "[TESTE] Mega Corp Global SA",
    nomeFantasia: "Mega Corp",
    porte: "GRANDE", // fora do ICP (tem jurídico interno) — reprove na triagem
    capitalSocial: "250000000.00",
    cnaePrincipal: "4711-3/02 Hipermercados",
    uf: "SP",
    municipio: "São Paulo",
    telefones: ["1133330606"],
    prioridade: 0,
  },
];

async function limpar() {
  const db = getDb();
  await db.delete(campaigns).where(eq(campaigns.slug, SLUG)); // cascata leva os alvos
  await db.delete(companies).where(like(companies.razaoSocial, "[TESTE]%")); // cascata leva o resto
  console.log("Carteira de teste e empresas [TESTE] removidas.");
}

async function criar() {
  const db = getDb();

  let [camp] = await db.select().from(campaigns).where(eq(campaigns.slug, SLUG));
  if (!camp) {
    [camp] = await db
      .insert(campaigns)
      .values({
        name: "Carteira Teste — Sandbox",
        slug: SLUG,
        description: "Carteira fictícia pra treinar a dinâmica: triagem → fila → ligação → ciclo.",
        offerTerms: "Nenhuma — é treino. Apague com: npx tsx scripts/seed-teste.ts --limpar",
        icp: "Indústria/distribuidora MÉDIA. Micro e grande estão aqui de propósito: reprove na triagem.",
        status: "ativa",
      })
      .returning();
    console.log("Campanha criada:", camp.name);
  } else {
    console.log("Campanha já existia:", camp.name);
  }

  let alvos = 0;
  for (const e of EMPRESAS) {
    const { prioridade, ...dados } = e;
    const [c] = await db
      .insert(companies)
      .values({ ...dados, source: "manual" })
      .onConflictDoUpdate({ target: companies.cnpj, set: { updatedAt: new Date() } })
      .returning({ id: companies.id });

    const t = await db
      .insert(targets)
      .values({ campaignId: camp.id, companyId: c.id, priority: prioridade })
      .onConflictDoNothing({ target: [targets.campaignId, targets.companyId] })
      .returning({ id: targets.id });
    if (t.length) alvos++;
  }

  const port = process.env.WEB_PORT ?? 3000;
  console.log(
    `${EMPRESAS.length} empresas [TESTE], ${alvos} alvos novos.` +
      `\n\ncomece pela triagem → http://localhost:${port}/campaigns/${SLUG}/triagem`,
  );
}

(process.argv.includes("--limpar") ? limpar() : criar())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
