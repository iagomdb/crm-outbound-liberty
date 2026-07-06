import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

// Limpa empresas / contatos / alvos / ligações / reuniões — MANTÉM as campanhas.
// Use antes de importar a lista real, pra remover os dados de demo/fixture.
async function main() {
  const db = getDb();
  await db.execute(
    sql`truncate table companies, contacts, targets, activities, meetings restart identity cascade`,
  );
  console.log("Dados limpos (campanhas mantidas). Rode o importador com a lista real.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
