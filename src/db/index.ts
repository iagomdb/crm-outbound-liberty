import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Cacheia só o POOL de conexão (o caro) entre reloads de HMR. NÃO cacheia o
// wrapper drizzle — reconstruí-lo é barato e garante que mudanças de schema no
// dev sejam refletidas na hora (senão o db.query fica preso a um schema antigo).
const globalForDb = globalThis as unknown as {
  __client?: ReturnType<typeof postgres>;
};

function getClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  if (!globalForDb.__client) globalForDb.__client = postgres(url, { max: 10 });
  return globalForDb.__client;
}

export function getDb() {
  return drizzle(getClient(), { schema, casing: "snake_case" });
}
