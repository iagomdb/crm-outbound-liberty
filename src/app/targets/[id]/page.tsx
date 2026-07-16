import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getTargetDetail } from "@/db/queries";
import { StageBadge } from "@/components/StageBadge";
import { CallLogForm } from "@/components/CallLogForm";
import { ActivityHistory } from "@/components/ActivityHistory";
import { MaskedInput } from "@/components/MaskedInput";
import { logCall } from "./actions";
import {
  archiveTargetDetail,
  createContact,
  deleteContact,
  unarchiveTarget,
  updateCompany,
  updateContact,
  updateTarget,
} from "./crud-actions";
import { scheduleReturn } from "@/app/agenda/actions";
import { fmtCnpj, fmtDate, fmtDateTime, fmtMoney, fmtPhone } from "@/lib/format";
import {
  MENTAL_LABELS,
  OBJECTION_LABELS,
  OBJECTIVE_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/core/pipeline";
import { deathFor, deathLabel, DEATH_CLASSES } from "@/core/death";
import { addBusinessDays, DEFAULT_FOLLOWUP_BUSINESS_DAYS, toDatetimeLocal } from "@/core/tasks";
import { activityType, contactRole, mentalState, objectionType, objectiveHit } from "@/db/schema";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";
const btn = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";
const summary = "cursor-pointer text-xs text-sky-600 hover:underline dark:text-sky-400";

type ContactRow = {
  id: string;
  nome: string | null;
  papel: string;
  cargo: string | null;
  telefoneDireto: string | null;
  email: string | null;
  emailGenerico: boolean;
  melhorHorario: string | null;
};

function ContactFields({ c }: { c?: ContactRow }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input name="nome" defaultValue={c?.nome ?? ""} placeholder="nome" className={inp} />
      <select name="papel" defaultValue={c?.papel ?? "desconhecido"} className={inp}>
        {contactRole.enumValues.map((v) => (
          <option key={v} value={v}>
            {ROLE_LABELS[v] ?? v}
          </option>
        ))}
      </select>
      <input name="cargo" defaultValue={c?.cargo ?? ""} placeholder="cargo" className={inp} />
      <MaskedInput mask="phone" name="telefoneDireto" defaultValue={c?.telefoneDireto ?? ""} placeholder="telefone direto" className={inp} />
      <input name="email" defaultValue={c?.email ?? ""} placeholder="e-mail" className={inp} />
      <input name="melhorHorario" defaultValue={c?.melhorHorario ?? ""} placeholder="melhor horário" className={inp} />
      <label className="col-span-2 flex items-center gap-1.5 text-xs">
        <input type="checkbox" name="emailGenerico" defaultChecked={c?.emailGenerico} className="h-4 w-4" /> e-mail genérico
        (financeiro@ = buraco negro)
      </label>
    </div>
  );
}

export default async function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const t = await getTargetDetail(id);
  if (!t) notFound();

  const co = t.company;
  const death = deathFor({ attempts: t.attempts, stageChangedAt: t.stageChangedAt });
  const stageOptions = STAGE_ORDER.map((v) => ({ value: v, label: STAGE_LABELS[v] }));
  const objectionOptions = objectionType.enumValues.map((v) => ({ value: v, label: OBJECTION_LABELS[v] ?? v }));
  const objectiveOptions = objectiveHit.enumValues.map((v) => ({ value: v, label: OBJECTIVE_LABELS[v] }));
  const mentalOptions = mentalState.enumValues.map((v) => ({ value: v, label: MENTAL_LABELS[v] ?? v }));
  const typeOptions = activityType.enumValues.map((v) => ({ value: v, label: v }));
  const contacts = co.contacts.map((c) => ({ id: c.id, nome: c.nome, papel: c.papel }));
  const endereco = [co.logradouro, co.numero, co.bairro].filter(Boolean).join(", ");
  const cidade = [co.municipio, co.uf].filter(Boolean).join(" - ");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/campaigns/${t.campaign.slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {t.campaign.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{co.nomeFantasia || co.razaoSocial}</h1>
          <StageBadge stage={t.stage} />
          <span className={`text-xs ${DEATH_CLASSES[death.state].text}`}>
            {t.attempts} tent · {death.daysStalled}d parado · {deathLabel(death)}
          </span>
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
            <button className="rounded bg-white px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-200">
              desarquivar
            </button>
          </form>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          {/* agendar retorno */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-2 text-sm font-semibold">⏰ Agendar retorno</h2>
            <form action={scheduleReturn.bind(null, t.id)} className="flex flex-wrap items-end gap-2">
              <div>
                <div className={lbl}>Voltar em</div>
                <input type="datetime-local" name="dueAt" className={inp} />
              </div>
              <div className="min-w-40 flex-1">
                <div className={lbl}>Pretexto novo</div>
                <input name="pretext" defaultValue={t.nextActionPretext ?? ""} placeholder="motivo do retorno" className={inp} />
              </div>
              <button className={btn}>Agendar</button>
            </form>
            {t.nextActionAt && (
              <p className="mt-2 text-xs text-zinc-500">
                Atual: {fmtDateTime(t.nextActionAt)}
                {t.nextActionPretext ? ` — ${t.nextActionPretext}` : ""}
              </p>
            )}
          </section>

          {/* empresa */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Empresa</h2>
              <span className="text-xs text-zinc-400">{fmtCnpj(co.cnpj)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><dt className={lbl}>Porte</dt><dd className="text-sm">{co.porte || "—"}</dd></div>
              <div><dt className={lbl}>Abertura</dt><dd className="text-sm">{fmtDate(co.dataAbertura)}</dd></div>
              <div><dt className={lbl}>Capital</dt><dd className="text-sm">{fmtMoney(co.capitalSocial)}</dd></div>
              <div className="col-span-2 sm:col-span-3"><dt className={lbl}>CNAE</dt><dd className="text-sm">{co.cnaePrincipal || "—"}</dd></div>
              <div><dt className={lbl}>Telefones</dt><dd className="text-sm">{(co.telefones ?? []).map(fmtPhone).join(" · ") || "—"}</dd></div>
              <div className="col-span-2"><dt className={lbl}>E-mails</dt><dd className="break-words text-sm">{(co.emails ?? []).join(" · ") || "—"}</dd></div>
              <div className="col-span-2 sm:col-span-3"><dt className={lbl}>Local</dt><dd className="text-sm">{[endereco, cidade, co.cep].filter(Boolean).join(" — ") || "—"}</dd></div>
            </dl>
            <details className="mt-3">
              <summary className={summary}>editar empresa</summary>
              <form action={updateCompany.bind(null, co.id)} className="mt-3 grid grid-cols-2 gap-2">
                <input name="razaoSocial" defaultValue={co.razaoSocial} placeholder="razão social" className={inp} />
                <input name="nomeFantasia" defaultValue={co.nomeFantasia ?? ""} placeholder="nome fantasia" className={inp} />
                <MaskedInput mask="phone" name="tel1" defaultValue={co.telefones?.[0] ?? ""} placeholder="telefone 1" className={inp} />
                <MaskedInput mask="phone" name="tel2" defaultValue={co.telefones?.[1] ?? ""} placeholder="telefone 2" className={inp} />
                <input name="email1" defaultValue={co.emails?.[0] ?? ""} placeholder="e-mail 1" className={inp} />
                <input name="email2" defaultValue={co.emails?.[1] ?? ""} placeholder="e-mail 2" className={inp} />
                <input name="cnaePrincipal" defaultValue={co.cnaePrincipal ?? ""} placeholder="CNAE" className={`${inp} col-span-2`} />
                <input name="porte" defaultValue={co.porte ?? ""} placeholder="porte" className={inp} />
                <MaskedInput mask="uf" name="uf" defaultValue={co.uf ?? ""} maxLength={2} className={inp} />
                <input name="municipio" defaultValue={co.municipio ?? ""} placeholder="município" className={inp} />
                <textarea name="notes" defaultValue={co.notes ?? ""} placeholder="observações" rows={2} className={`${inp} col-span-2`} />
                <button className={`${btn} col-span-2 justify-self-start`}>Salvar empresa</button>
              </form>
            </details>
          </section>

          {/* contatos */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold">Contatos ({co.contacts.length})</h2>
            {co.contacts.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum contato. O gatekeeper existe pra achar o decisor.</p>
            )}
            <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
              {co.contacts.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 py-2 first:pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      <strong className="font-medium">{c.nome || "sem nome"}</strong>{" "}
                      <span className="text-xs text-zinc-400">{ROLE_LABELS[c.papel] ?? c.papel}</span>
                      {c.emailGenerico && <span className="ml-1 text-xs text-orange-500">(genérico)</span>}
                    </span>
                    <span className="text-zinc-500">{fmtPhone(c.telefoneDireto) || c.email || "—"}</span>
                  </div>
                  <div className="flex gap-3">
                    <details>
                      <summary className={summary}>editar</summary>
                      <form action={updateContact.bind(null, c.id)} className="mt-2 flex flex-col gap-2">
                        <ContactFields c={c} />
                        <button className={`${btn} self-start`}>Salvar</button>
                      </form>
                    </details>
                    <form action={deleteContact.bind(null, c.id)}>
                      <button className="text-xs text-red-500 hover:underline">remover</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className={summary}>+ adicionar contato</summary>
              <form action={createContact.bind(null, co.id)} className="mt-2 flex flex-col gap-2">
                <ContactFields />
                <button className={`${btn} self-start`}>Adicionar</button>
              </form>
            </details>
          </section>

          {/* editar / arquivar alvo */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold">Alvo</h2>
            <form action={updateTarget.bind(null, t.id)} className="grid grid-cols-2 gap-2">
              <div>
                <div className={lbl}>Estágio</div>
                <select name="stage" defaultValue={t.stage} className={inp}>
                  {stageOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={lbl}>Estado mental</div>
                <select name="mentalState" defaultValue={t.mentalState} className={inp}>
                  {mentalOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={lbl}>Próxima ação</div>
                <input type="datetime-local" name="nextActionAt" className={inp} />
              </div>
              <div>
                <div className={lbl}>Valor estimado (perda)</div>
                <input type="number" step="0.01" name="valorEstimado" defaultValue={t.valorEstimado ?? ""} className={inp} />
              </div>
              <div className="col-span-2">
                <div className={lbl}>Pretexto do próximo contato</div>
                <input name="nextActionPretext" defaultValue={t.nextActionPretext ?? ""} className={inp} />
              </div>
              <div className="col-span-2">
                <div className={lbl}>Observações</div>
                <textarea name="notes" defaultValue={t.notes ?? ""} rows={2} className={inp} />
              </div>
              <button className={`${btn} col-span-2 justify-self-start`}>Salvar alvo</button>
            </form>
            {!t.archivedAt && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-red-500 hover:underline">arquivar lead</summary>
                <form action={archiveTargetDetail.bind(null, t.id)} className="mt-2 flex gap-2">
                  <input name="reason" placeholder="motivo (ex: sem caso, morreu)" className={inp} />
                  <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                    Arquivar
                  </button>
                </form>
              </details>
            )}
          </section>

          {/* histórico: uma linha por ligação, clique expande o registro completo */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold">Histórico ({t.activities.length})</h2>
            <ActivityHistory activities={t.activities} />
          </section>
        </div>

        {/* coluna direita: log de ligação */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-sm font-semibold">Registrar ligação</h2>
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
              defaultNextActionAt={toDatetimeLocal(addBusinessDays(new Date(), DEFAULT_FOLLOWUP_BUSINESS_DAYS))}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
