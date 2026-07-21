import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignsWithStats } from "@/db/queries";
import { ButtonLink, Field, Input, Select } from "@/components/ui";
import { PendingButton, PendingNote } from "@/components/PendingButton";
import { IMPORT_FIELDS, analyzeSheet, loadWorkbook, type ImportPreview, type SheetAnalysis } from "@/core/import";
import { runImport, type MappingState } from "../actions";
import { readMeta, readSheet, isValidToken } from "../storage";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
const td = "px-3 py-2 align-top";

type DoneResult = {
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  targetsCreated: number;
  skips: { rowIdx: number; rawCnpj: string; razaoSocial: string }[];
  campaignName: string;
  campaignSlug: string;
};

const parseJson = <T,>(raw?: string): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export default async function MapeamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ err?: string; p?: string; m?: string; done?: string }>;
}) {
  await requireUser();
  const { token } = await params;
  if (!isValidToken(token)) redirect("/importar");
  const { err, p, m, done } = await searchParams;

  const doneResult = parseJson<DoneResult>(done);
  if (doneResult) return <ResultView r={doneResult} />;

  const buffer = await readSheet(token);
  if (!buffer) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Importar leads</h1>
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Este upload expirou ou já foi importado.
        </p>
        <ButtonLink href="/importar" className="self-start">
          Enviar planilha
        </ButtonLink>
      </div>
    );
  }

  let analysis: SheetAnalysis;
  try {
    analysis = analyzeSheet(await loadWorkbook(buffer));
  } catch (e) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Importar leads</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Não deu pra ler a planilha: {e instanceof Error ? e.message : "erro desconhecido"}
        </p>
        <ButtonLink href="/importar" className="self-start">
          Tentar outra planilha
        </ButtonLink>
      </div>
    );
  }

  const [meta, camps] = await Promise.all([readMeta(token), getCampaignsWithStats()]);
  const state = parseJson<MappingState>(m);
  const preview = parseJson<ImportPreview>(p);

  // default de cada select: escolha anterior do usuário > sugestão automática
  const defaultFor = (col: number, suggestion: string | null) =>
    state ? (state.map[String(col)] ?? "") : (suggestion ?? "");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/importar" className="text-xs text-zinc-400 hover:underline">
          ← importar outra planilha
        </Link>
        <h1 className="text-xl font-semibold">Mapear colunas</h1>
        <p className="text-sm text-zinc-500">
          {meta?.name ?? "planilha"} · aba “{analysis.sheetName}” · {analysis.dataRowCount} linhas de dados ·
          cabeçalho na linha {analysis.headerRowIdx}. Confira o destino de cada coluna — só a Razão social/Nome é
          obrigatória. CNPJ é recomendado quando existir: com ele a deduplicação é exata; sem ele, é pelo nome.
        </p>
      </div>

      {err && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {err}
        </p>
      )}

      {preview && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <p className="font-medium">Simulação (nada foi gravado)</p>
          <p className="mt-1">
            {preview.read} linhas lidas · <strong>{preview.valid} válidas</strong> · {preview.invalid} inválidas
            (sem razão social/nome) · {preview.existing} já existem no sistema e serão mescladas, sem duplicar.
          </p>
          {preview.skips.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs">
              {preview.skips.map((s) => (
                <li key={s.rowIdx}>
                  linha {s.rowIdx}: sem razão social/nome{s.rawCnpj ? ` (CNPJ “${s.rawCnpj}”)` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form action={runImport.bind(null, token, false)} className="flex flex-col gap-5">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={th}>Coluna da planilha</th>
                <th className={th}>Exemplos</th>
                <th className={th}>Vai para o campo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {analysis.columns.map((c) => (
                <tr key={c.col}>
                  <td className={`${td} font-medium whitespace-nowrap`}>{c.header}</td>
                  <td className={`${td} max-w-md text-xs text-zinc-500`}>{c.samples.join(" · ") || "—"}</td>
                  <td className={`${td} w-52`}>
                    <Select name={`map_${c.col}`} defaultValue={defaultFor(c.col, c.suggestion)}>
                      <option value="">— ignorar —</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {"required" in f && f.required ? " *" : ""}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
          <Field label="Carteira de destino">
            <Select name="campaignSlug" defaultValue={state?.campaignSlug ?? ""}>
              <option value="">— escolher —</option>
              {camps.map((c) => (
                <option key={c.id} value={c.slug ?? ""}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="…ou criar carteira nova com o nome">
            <Input name="newCampaignName" placeholder="ex.: Liberty Advogados SP" defaultValue={state?.newCampaignName ?? ""} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <PendingButton formAction={runImport.bind(null, token, true)} variant="secondary">
              Simular (nada é gravado)
            </PendingButton>
            <PendingButton>Importar</PendingButton>
            <PendingNote>
              Processando a planilha — em bases grandes pode levar um minuto. Não feche nem recarregue a página.
            </PendingNote>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResultView({ r }: { r: DoneResult }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Importação concluída</h1>
        <p className="text-sm text-zinc-500">Carteira: {r.campaignName}</p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        {r.read} linhas lidas · <strong>{r.inserted} empresas novas</strong> · {r.updated} atualizadas/mescladas ·{" "}
        {r.skipped} puladas · <strong>{r.targetsCreated} alvos criados</strong> na carteira.
      </div>

      {r.skips.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="mb-1 text-sm font-medium">Linhas puladas (sem razão social/nome):</p>
          <ul className="list-inside list-disc">
            {r.skips.map((s) => (
              <li key={s.rowIdx}>
                linha {s.rowIdx}: sem razão social/nome{s.rawCnpj ? ` (CNPJ “${s.rawCnpj}”)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/campaigns/${r.campaignSlug}/triagem`}>Triar agora</ButtonLink>
        <ButtonLink href={`/campaigns/${r.campaignSlug}`} variant="secondary">
          Ver carteira
        </ButtonLink>
        <ButtonLink href="/importar" variant="ghost">
          Importar outra planilha
        </ButtonLink>
      </div>
    </div>
  );
}
