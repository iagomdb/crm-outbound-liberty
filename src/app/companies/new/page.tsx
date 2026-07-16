import Link from "next/link";
import { requireUser } from "@/auth/dal";
import { getCampaignsWithStats } from "@/db/queries";
import { MaskedInput } from "@/components/MaskedInput";
import { Button, Field, Input, Select, fieldClasses } from "@/components/ui";
import { createCompany } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  await requireUser();
  const { campaign } = await searchParams;
  const camps = await getCampaignsWithStats();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href={campaign ? `/campaigns/${campaign}` : "/"} className="text-xs text-zinc-400 hover:underline">
          ← voltar
        </Link>
        <h1 className="text-xl font-semibold">Nova empresa</h1>
      </div>

      <form action={createCompany} className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field label="Razão social *" className="col-span-2">
          <Input name="razaoSocial" required />
        </Field>
        <Field label="CNPJ *">
          <MaskedInput mask="cnpj" name="cnpj" required className={fieldClasses} />
        </Field>
        <Field label="Nome fantasia">
          <Input name="nomeFantasia" />
        </Field>
        <Field label="Telefone 1">
          <MaskedInput mask="phone" name="tel1" className={fieldClasses} />
        </Field>
        <Field label="Telefone 2">
          <MaskedInput mask="phone" name="tel2" className={fieldClasses} />
        </Field>
        <Field label="E-mail 1">
          <Input name="email1" />
        </Field>
        <Field label="E-mail 2">
          <Input name="email2" />
        </Field>
        <Field label="CNAE principal" className="col-span-2">
          <Input name="cnaePrincipal" />
        </Field>
        <Field label="Porte">
          <Input name="porte" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="UF">
            <MaskedInput mask="uf" name="uf" maxLength={2} className={fieldClasses} />
          </Field>
          <Field label="Município">
            <Input name="municipio" />
          </Field>
        </div>
        <Field label="Adicionar à campanha" className="col-span-2">
          <Select name="campaignSlug" defaultValue={campaign ?? ""}>
            <option value="">— nenhuma (só cadastrar) —</option>
            {camps.map((c) => (
              <option key={c.id} value={c.slug ?? ""}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="col-span-2 justify-self-start">
          Criar empresa
        </Button>
      </form>
    </div>
  );
}
