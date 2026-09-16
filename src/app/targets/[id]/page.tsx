import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getScriptGraph, getTargetDetail } from "@/db/queries";
import { StageBadge } from "@/components/StageBadge";
import { CallLogForm } from "@/components/CallLogForm";
import { ActivityHistory } from "@/components/ActivityHistory";
import { PitchPanel } from "@/components/PitchPanel";
import { FalaBox } from "@/components/flow/FalaBox";
import { Markdown } from "@/components/Markdown";
import { Card, Button, ButtonLink } from "@/components/ui";
import { ScheduleReturnSection } from "./_sections/ScheduleReturnSection";
import { CompanySection } from "./_sections/CompanySection";
import { ContactsSection } from "./_sections/ContactsSection";
import { TargetSection } from "./_sections/TargetSection";
import { logCall } from "./actions";
import { unarchiveTarget } from "./crud-actions";
import { fmtDate } from "@/lib/format";
import {
  MENTAL_LABELS,
  OBJECTION_LABELS,
  OBJECTIVE_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/core/pipeline";
import { deathFor, deathLabel, DEATH_CLASSES } from "@/core/death";
import { addDays, noAnswerDelayDays, toDatetimeLocal } from "@/core/tasks";
import { activityType, mentalState, objectionType, objectiveHit } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const t = await getTargetDetail(id);
  if (!t) notFound();

  // o fluxo da carteira (grafo do script) — aba 🌳 do painel de discagem
  const graph = await getScriptGraph(t.campaignId);

  const co = t.company;
  const death = deathFor({ attempts: t.attempts, stageChangedAt: t.stageChangedAt, stage: t.stage });
  const stageOptions = STAGE_ORDER.map((v) => ({ value: v, label: STAGE_LABELS[v] }));
  const objectionOptions = objectionType.enumValues.map((v) => ({ value: v, label: OBJECTION_LABELS[v] ?? v }));
  const objectiveOptions = objectiveHit.enumValues.map((v) => ({ value: v, label: OBJECTIVE_LABELS[v] }));
  const mentalOptions = mentalState.enumValues.map((v) => ({ value: v, label: MENTAL_LABELS[v] ?? v }));
  const typeOptions = activityType.enumValues.map((v) => ({ value: v, label: v }));
  const contacts = co.contacts.map((c) => ({ id: c.id, nome: c.nome, papel: c.papel }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${t.campaign.slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {t.campaign.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {/* nomes genéricos ("Advocacia Silva") existem aos montes — com link do Maps, abre O lugar certo */}
            <a
              href={
                co.mapsUrl ||
                `https://www.google.com/search?q=${encodeURIComponent(
                  [co.nomeFantasia || co.razaoSocial, co.municipio, co.uf].filter(Boolean).join(" "),
                )}`
              }
              target="_blank"
              rel="noopener noreferrer"
              title={co.mapsUrl ? "abrir no Google Maps" : "pesquisar no Google"}
              className="hover:underline"
            >
              {co.nomeFantasia || co.razaoSocial}{" "}
              <span className="align-middle text-sm text-zinc-400">{co.mapsUrl ? "📍" : "↗"}</span>
            </a>
          </h1>
          <StageBadge stage={t.stage} />
          <span className={`text-xs ${DEATH_CLASSES[death.state].text}`}>
            {t.attempts} tent · {death.daysStalled}d parado · {deathLabel(death)}
          </span>
          <ButtonLink href={`/targets/${t.id}/email`} variant="secondary" size="sm" className="ml-auto">
            ✉️ e-mail
          </ButtonLink>
        </div>
        <p className="text-sm text-zinc-500">{co.razaoSocial}</p>
      </div>

      {t.archivedAt && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>
            Arquivado em {fmtDate(t.archivedAt)}
            {t.archiveReason ? ` — ${t.archiveReason}` : ""}
          </span>
          <form action={unarchiveTarget.bind(null, t.id)}>
            <Button type="submit" variant="secondary" size="sm" className="border-red-200 bg-white text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800">
              desarquivar
            </Button>
          </form>
        </div>
      )}

      {/* O FLUXO em largura inteira: as colunas da conversa só servem se couberem
          lado a lado. key zera o caminho e os checks a cada empresa. */}
      <PitchPanel
        key={t.id}
        campaignName={t.campaign.name}
        editHref={t.campaign.slug ? `/campaigns/${t.campaign.slug}/editar` : null}
        fluxoHref={t.campaign.slug ? `/campaigns/${t.campaign.slug}/fluxo` : null}
        graph={graph}
        items={t.campaign.checklistItems}
        hasScript={Boolean(t.campaign.script)}
        contentMaxH="max-h-[46vh]"
      >
        {t.campaign.script && <Markdown text={t.campaign.script} />}
      </PitchPanel>

      {/* a fala do passo aberto, em caixa própria: é o texto lido em voz alta,
          então quer largura e altura só dele. Some enquanto nada foi escolhido. */}
      <FalaBox />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px] 2xl:grid-cols-[1fr_560px]">
        <div className="flex flex-col gap-6">
          <ScheduleReturnSection
            targetId={t.id}
            nextActionAt={t.nextActionAt}
            nextActionPretext={t.nextActionPretext}
          />

          <CompanySection co={co} />

          <ContactsSection companyId={co.id} contacts={co.contacts} />

          <TargetSection
            targetId={t.id}
            stage={t.stage}
            mentalState={t.mentalState}
            valorEstimado={t.valorEstimado}
            nextActionPretext={t.nextActionPretext}
            notes={t.notes}
            archived={Boolean(t.archivedAt)}
            stageOptions={stageOptions}
            mentalOptions={mentalOptions}
          />

          <Card title={`Histórico (${t.activities.length})`}>
            <ActivityHistory activities={t.activities} />
          </Card>
        </div>

        {/* coluna direita: o log de ligação, fixo na rolagem. O fluxo não mora
            aqui — ele abre em largura total acima, porque as colunas da conversa
            precisam caber lado a lado. */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <Card title="Registrar ligação">
            <CallLogForm
              key={t.activities.length}
              action={logCall.bind(null, t.id)}
              contacts={contacts}
              stageOptions={stageOptions}
              objectionOptions={objectionOptions}
              objectiveOptions={objectiveOptions}
              mentalOptions={mentalOptions}
              typeOptions={typeOptions}
              roleLabels={ROLE_LABELS}
              defaultNextActionAt={toDatetimeLocal(addDays(new Date(), noAnswerDelayDays(t.noAnswerStreak + 1) ?? 28))}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
