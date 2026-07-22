import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getNextInQueue, getTargetDetail } from "@/db/queries";
import { StageBadge } from "@/components/StageBadge";
import { CallLogForm } from "@/components/CallLogForm";
import { ActivityHistory } from "@/components/ActivityHistory";
import { PitchPanel } from "@/components/PitchPanel";
import { Markdown } from "@/components/Markdown";
import { ContactsSection } from "../../targets/[id]/_sections/ContactsSection";
import { CompanySection } from "../../targets/[id]/_sections/CompanySection";
import { logCallAndNext } from "./actions";
import { sortearProxima } from "../../roleta/actions";
import { fmtDateTime, fmtPhone } from "@/lib/format";
import {
  MENTAL_LABELS,
  OBJECTION_LABELS,
  OBJECTIVE_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/core/pipeline";
import { deathFor, deathLabel, DEATH_CLASSES } from "@/core/death";
import { goldenHourLabel } from "@/core/golden-hours";
import { addBusinessDays, DEFAULT_FOLLOWUP_BUSINESS_DAYS, toDatetimeLocal } from "@/core/tasks";
import { activityType, mentalState, objectionType, objectiveHit } from "@/db/schema";
import { Card, Badge, ButtonLink, type BadgeTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const GH_UI: Record<string, { txt: string; tone: BadgeTone }> = {
  golden: { txt: "🔥 golden hour — liga AGORA", tone: "emerald" },
  ok: { txt: "horário ok", tone: "neutral" },
  ruim: { txt: "horário ruim pra ligar", tone: "orange" },
};

const lbl = "text-xs text-zinc-500";

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ targetId: string }>;
  searchParams: Promise<{ roleta?: string }>;
}) {
  await requireUser();
  const { targetId } = await params;
  const { roleta } = await searchParams;
  // modo roleta: veio de /roleta — a "próxima" é sorteada nas carteiras marcadas
  const roletaSlugs = roleta ? roleta.split(",").filter(Boolean) : null;
  const [t, nextId] = await Promise.all([getTargetDetail(targetId), getNextInQueue(targetId)]);
  if (!t) notFound();

  const co = t.company;
  const death = deathFor({ attempts: t.attempts, stageChangedAt: t.stageChangedAt });
  const gh = GH_UI[goldenHourLabel()];
  const decisor = t.primaryContact ?? co.contacts.find((c) => c.papel === "decisor") ?? null;
  const lastCall = t.activities[0] ?? null;

  // telefones: direto do contato primeiro, depois os da empresa (sem repetir)
  const phones = [
    ...co.contacts.filter((c) => c.telefoneDireto).map((c) => ({ n: c.telefoneDireto!, who: c.nome || ROLE_LABELS[c.papel] })),
    ...(co.telefones ?? []).map((n) => ({ n, who: null as string | null })),
  ].filter((p, i, arr) => arr.findIndex((x) => x.n === p.n) === i);

  // cadência teimosa: nunca repetir pretexto
  const usedPretexts = [...new Set(t.activities.map((a) => a.nextActionPretext).filter(Boolean))] as string[];

  const stageOptions = STAGE_ORDER.map((v) => ({ value: v, label: STAGE_LABELS[v] }));
  const objectionOptions = objectionType.enumValues.map((v) => ({ value: v, label: OBJECTION_LABELS[v] ?? v }));
  const objectiveOptions = objectiveHit.enumValues.map((v) => ({ value: v, label: OBJECTIVE_LABELS[v] }));
  const mentalOptions = mentalState.enumValues.map((v) => ({ value: v, label: MENTAL_LABELS[v] ?? v }));
  const typeOptions = activityType.enumValues.map((v) => ({ value: v, label: v }));
  const contacts = co.contacts.map((c) => ({ id: c.id, nome: c.nome, papel: c.papel }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between text-xs">
        {roletaSlugs ? (
          <Link href="/roleta" className="text-zinc-400 hover:underline">
            ← 🎲 roleta ({roletaSlugs.length} carteira{roletaSlugs.length > 1 ? "s" : ""})
          </Link>
        ) : (
          <Link href="/fila" className="text-zinc-400 hover:underline">
            ← fila do dia
          </Link>
        )}
        <div className="flex items-center gap-3">
          <Link href={`/targets/${t.id}`} className="text-zinc-400 hover:underline">
            ficha completa
          </Link>
          {roletaSlugs ? (
            <form action={sortearProxima.bind(null, roletaSlugs, t.id)}>
              <button type="submit" className="cursor-pointer text-zinc-400 hover:underline">
                pular → 🎲 sortear outra
              </button>
            </form>
          ) : (
            nextId && (
              <Link href={`/fila/${nextId}`} className="text-zinc-400 hover:underline">
                pular → próxima da fila
              </Link>
            )
          )}
        </div>
      </div>

      {/* cabeçalho de discagem */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{co.nomeFantasia || co.razaoSocial}</h1>
          <StageBadge stage={t.stage} />
          <span className={`text-xs ${DEATH_CLASSES[death.state].text}`}>
            tentativa nº {t.attempts + 1} · {deathLabel(death)}
          </span>
          <Badge tone={gh.tone} pill className="ml-auto px-3 py-1">
            {gh.txt}
          </Badge>
        </div>
        <p className="text-sm text-zinc-500">
          {co.razaoSocial} · {[co.municipio, co.uf].filter(Boolean).join(" - ") || "—"} · {t.campaign.name}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {phones.length === 0 && <span className="text-sm text-red-500">sem telefone — caça o número primeiro</span>}
          {phones.map((p) => (
            <a
              key={p.n}
              href={`tel:${p.n.replace(/\D/g, "")}`}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-base font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              📞 {fmtPhone(p.n)}
              {p.who && <span className="ml-1.5 text-xs font-normal opacity-70">({p.who})</span>}
            </a>
          ))}
          <ButtonLink href={`/targets/${t.id}/email?back=fila`} variant="secondary" className="rounded-lg px-4 py-2">
            ✉️ e-mail
          </ButtonLink>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className={lbl}>Decisor / contato</dt>
            <dd>
              {decisor ? (
                <>
                  {decisor.nome || "sem nome"}{" "}
                  <span className="text-xs text-zinc-400">
                    {ROLE_LABELS[decisor.papel]}
                    {decisor.cargo ? ` · ${decisor.cargo}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-zinc-400">desconhecido — objetivo: descobrir</span>
              )}
            </dd>
          </div>
          <div>
            <dt className={lbl}>Melhor horário</dt>
            <dd>{decisor?.melhorHorario || "—"}</dd>
          </div>
          <div>
            <dt className={lbl}>Estado mental</dt>
            <dd>{MENTAL_LABELS[t.mentalState] ?? t.mentalState}</dd>
          </div>
        </dl>
      </Card>

      {/* o pretexto DESTA ligação */}
      <section className="rounded-xl border-2 border-sky-300 bg-sky-50 p-5 dark:border-sky-800 dark:bg-sky-950">
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          Pretexto desta ligação {t.nextActionAt ? `· ${fmtDateTime(t.nextActionAt)}` : ""}
        </div>
        <p className="mt-1 text-lg font-medium text-sky-900 dark:text-sky-100">
          {t.nextActionPretext ||
            (t.attempts === 0 ? "Primeira ligação — abrir com a hipótese: “dinheiro já dado como perdido”." : "Sem pretexto definido — invente um motivo NOVO antes de discar.")}
        </p>
        {usedPretexts.length > 0 && (
          <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
            já usados (não repetir): {usedPretexts.join(" · ")}
          </p>
        )}
      </section>

      {/* pitch fixo na direita; operação (registro, contatos, empresa, histórico) na esquerda */}
      <div className="grid gap-6 lg:grid-cols-[1fr_440px] 2xl:grid-cols-[1fr_700px]">
        <div className="flex flex-col gap-6">
          {/* memória da última ligação */}
          <Card title="🧠 Onde parou (última ligação)">
            {!lastCall ? (
              <p className="text-sm text-zinc-500">Nunca ligou. Começa do script: gatekeeper → decisor → hipótese.</p>
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex gap-2 text-xs text-zinc-400">
                  <span>{fmtDateTime(lastCall.occurredAt)}</span>
                  <span>{lastCall.reachedHuman ? "falou com humano" : "não atendeu / não passou"}</span>
                  {lastCall.contact?.nome && <span>com {lastCall.contact.nome}</span>}
                </div>
                {lastCall.outcome && (
                  <div>
                    <dt className={lbl}>Resultado</dt>
                    <dd>{lastCall.outcome}</dd>
                  </div>
                )}
                {lastCall.stalledAt && (
                  <div>
                    <dt className={lbl}>Travou em (retomar daqui)</dt>
                    <dd className="font-medium">“{lastCall.stalledAt}”</dd>
                  </div>
                )}
                {lastCall.objection !== "nenhuma" && (
                  <div>
                    <dt className={lbl}>Objeção</dt>
                    <dd>
                      {OBJECTION_LABELS[lastCall.objection] ?? lastCall.objection}
                      {lastCall.objectionIsReflexo ? " (reflexo, não real)" : ""}
                    </dd>
                  </div>
                )}
                {lastCall.notes && (
                  <div>
                    <dt className={lbl}>Notas</dt>
                    <dd className="text-zinc-600 dark:text-zinc-300">{lastCall.notes}</dd>
                  </div>
                )}
              </dl>
            )}
            {t.notes && <p className="mt-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-900">obs. do alvo: {t.notes}</p>}
          </Card>

          {/* registrar → regra de ouro → próxima (da fila ou sorteada) */}
          <Card title="Registrar ligação">
            <CallLogForm
              key={t.activities.length}
              action={logCallAndNext.bind(null, t.id, roletaSlugs)}
              contacts={contacts}
              stageOptions={stageOptions}
              objectionOptions={objectionOptions}
              objectiveOptions={objectiveOptions}
              mentalOptions={mentalOptions}
              typeOptions={typeOptions}
              roleLabels={ROLE_LABELS}
              defaultNextActionAt={toDatetimeLocal(addBusinessDays(new Date(), DEFAULT_FOLLOWUP_BUSINESS_DAYS))}
              submitLabel={roletaSlugs ? "Registrar → 🎲 sortear próxima" : "Registrar → próxima da fila"}
            />
          </Card>

          <ContactsSection companyId={co.id} contacts={co.contacts} />

          <CompanySection co={co} />

          {/* histórico: uma linha por ligação, clique expande o registro completo */}
          <Card title={`Histórico (${t.activities.length})`}>
            <ActivityHistory activities={t.activities} />
          </Card>
        </div>

        {/* pitch + checklist da carteira sempre visíveis durante a ligação; key zera os checks a cada empresa */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <PitchPanel
            key={t.id}
            campaignName={t.campaign.name}
            editHref={t.campaign.slug ? `/campaigns/${t.campaign.slug}/editar` : null}
            checklist={t.campaign.checklist}
            hasScript={Boolean(t.campaign.script)}
          >
            {t.campaign.script && <Markdown text={t.campaign.script} />}
          </PitchPanel>
        </div>
      </div>
    </div>
  );
}
