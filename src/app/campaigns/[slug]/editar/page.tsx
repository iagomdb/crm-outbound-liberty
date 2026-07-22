import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { getCampaignBySlug, getChecklistItems } from "@/db/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { updateCampaign, deleteCampaign } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const items = await getChecklistItems(campaign.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <Link href={`/campaigns/${slug}`} className="text-xs text-zinc-400 hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-semibold">Editar carteira</h1>
        <p className="text-sm text-zinc-500">
          URL fixa: <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">/campaigns/{slug}</code>
        </p>
      </div>

      <form
        action={updateCampaign.bind(null, campaign.id)}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <Field label="Nome *">
          <Input name="name" required defaultValue={campaign.name} />
        </Field>
        <Field label="Descrição">
          <Textarea name="description" rows={2} defaultValue={campaign.description ?? ""} />
        </Field>
        <Field label="Condições da oferta (travadas)">
          <Textarea name="offerTerms" rows={2} defaultValue={campaign.offerTerms ?? ""} />
        </Field>
        <Field label="ICP">
          <Textarea name="icp" rows={2} defaultValue={campaign.icp ?? ""} />
        </Field>
        {/* pitch e checklist lado a lado — são editados juntos */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Script / pitch da carteira (markdown)"
            hint="aba 📜 na tela de discagem, renderizado"
          >
            <Textarea
              name="script"
              rows={18}
              className="font-mono text-xs"
              defaultValue={campaign.script ?? ""}
              placeholder={"# Playbook de Ligação\n\n## 1. Abertura\n> Boa tarde! ..."}
            />
          </Field>
          <Field label="Checklist da ligação" hint="aba ✅ na tela de discagem — objetivos marcáveis, na ordem daqui">
            <ChecklistEditor
              initialItems={items.map((i) => ({
                titulo: i.titulo,
                descricao: i.descricao ?? "",
                opcoes: i.opcoes.map((o) => o.titulo),
              }))}
            />
          </Field>
        </div>
        <Field label="Status" className="max-w-48">
          <Select name="status" defaultValue={campaign.status}>
            <option value="ativa">ativa</option>
            <option value="pausada">pausada</option>
            <option value="arquivada">arquivada</option>
          </Select>
        </Field>
        <Button type="submit" className="self-start">
          Salvar
        </Button>
      </form>

      {/* zona de perigo */}
      <div className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-950 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de perigo</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Apagar a carteira apaga TODOS os alvos, ligações, reuniões e histórico dela — sem volta. As empresas são
          globais e continuam cadastradas. Pra só tirar de circulação, use o status <strong>arquivada</strong> acima.
        </p>
        <form action={deleteCampaign.bind(null, campaign.id)} className="mt-3">
          <ConfirmButton
            message={`Apagar a carteira "${campaign.name}" e TODO o histórico dela (alvos, ligações, reuniões)? Não tem volta.`}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Apagar carteira
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
