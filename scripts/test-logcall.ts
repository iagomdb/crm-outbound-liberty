import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { recordCall } from "../src/core/log-call";
import { activities, meetings, targets } from "../src/db/schema";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("✗ FALHOU:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

async function main() {
  const db = getDb();
  const [t] = await db.select().from(targets).orderBy(targets.createdAt).limit(1);
  if (!t) {
    console.error("sem alvo pra testar — rode o importador");
    process.exit(1);
  }
  const before = { attempts: t.attempts };

  // 1) conversa move o funil e grava tudo
  const r1 = await recordCall(db, t.id, {
    reachedHuman: true,
    type: "ligacao",
    outcome: "teste: conversa",
    stalledAt: "manda um e-mail",
    objection: "manda_email",
    objectionIsReflexo: true,
    hypothesisLanded: true,
    objectiveHit: "nenhum",
    qualified: false,
    contactId: null,
    mentalState: "ja_deu_como_perdido",
    stageOverride: null,
    nextActionAt: null,
    nextActionPretext: "mandar resumo de 1 página",
    notes: null,
  });
  const [after1] = await db.select().from(targets).where(eq(targets.id, t.id));
  assert(after1.attempts === before.attempts + 1, `attempts ${before.attempts} → ${after1.attempts}`);
  assert(after1.stage === "conversa", `estágio virou "conversa" (${after1.stage})`);
  assert(after1.mentalState === "ja_deu_como_perdido", "estado mental gravado");
  const [a1] = await db.select().from(activities).where(eq(activities.id, r1.activityId));
  assert(a1.reachedHuman && a1.stalledAt === "manda um e-mail", "atividade gravada (reached_human + stalled_at)");

  // 2) objetivo reunião → estágio + reunião criada
  const when = new Date(Date.now() + 86_400_000);
  await recordCall(db, t.id, {
    reachedHuman: true,
    type: "ligacao",
    outcome: "teste: marcou reunião",
    stalledAt: null,
    objection: "nenhuma",
    objectionIsReflexo: null,
    hypothesisLanded: true,
    objectiveHit: "reuniao",
    qualified: true,
    contactId: null,
    mentalState: null,
    stageOverride: null,
    nextActionAt: when,
    nextActionPretext: null,
    notes: null,
  });
  const [after2] = await db.select().from(targets).where(eq(targets.id, t.id));
  assert(after2.stage === "reuniao_agendada", `estágio = reuniao_agendada (${after2.stage})`);
  assert(after2.qualified === true, "qualified marcado");
  const mtg = await db
    .select()
    .from(meetings)
    .where(eq(meetings.targetId, t.id))
    .orderBy(desc(meetings.createdAt))
    .limit(1);
  assert(mtg.length > 0 && mtg[0].status === "agendada", "reunião criada e agendada");

  console.log("\n✅ TODOS OS TESTES PASSARAM");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
