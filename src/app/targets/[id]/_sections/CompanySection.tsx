import { Card, Input, Textarea, Button, fieldClasses, labelClasses } from "@/components/ui";
import { MaskedInput } from "@/components/MaskedInput";
import { updateCompany } from "../crud-actions";
import type { TargetDetail } from "@/db/queries";
import { fmtCnpj, fmtDate, fmtMoney, fmtPhone } from "@/lib/format";

type Company = TargetDetail["company"];

function Def({ label, children, span }: { label: string; children: React.ReactNode; span?: string }) {
  return (
    <div className={span}>
      <dt className={labelClasses}>{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function CompanySection({ co }: { co: Company }) {
  const endereco = [co.logradouro, co.numero, co.bairro].filter(Boolean).join(", ");
  const cidade = [co.municipio, co.uf].filter(Boolean).join(" - ");

  return (
    <Card title="Empresa" aside={<span className="text-xs text-zinc-400">{fmtCnpj(co.cnpj)}</span>}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Def label="Porte">{co.porte || "—"}</Def>
        <Def label="Abertura">{fmtDate(co.dataAbertura)}</Def>
        <Def label="Capital">{fmtMoney(co.capitalSocial)}</Def>
        <Def label="CNAE" span="col-span-2 sm:col-span-3">
          {co.cnaePrincipal || "—"}
        </Def>
        <Def label="Telefones">{(co.telefones ?? []).map(fmtPhone).join(" · ") || "—"}</Def>
        <Def label="E-mails" span="col-span-2">
          <span className="break-words">{(co.emails ?? []).join(" · ") || "—"}</span>
        </Def>
        <Def label="Local" span="col-span-2 sm:col-span-3">
          {[endereco, cidade, co.cep].filter(Boolean).join(" — ") || "—"}
        </Def>
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-sky-600 hover:underline dark:text-sky-400">editar empresa</summary>
        <form action={updateCompany.bind(null, co.id)} className="mt-3 grid grid-cols-2 gap-2">
          <Input name="razaoSocial" defaultValue={co.razaoSocial} placeholder="razão social" />
          <Input name="nomeFantasia" defaultValue={co.nomeFantasia ?? ""} placeholder="nome fantasia" />
          <MaskedInput mask="phone" name="tel1" defaultValue={co.telefones?.[0] ?? ""} placeholder="telefone 1" className={fieldClasses} />
          <MaskedInput mask="phone" name="tel2" defaultValue={co.telefones?.[1] ?? ""} placeholder="telefone 2" className={fieldClasses} />
          <Input name="email1" defaultValue={co.emails?.[0] ?? ""} placeholder="e-mail 1" />
          <Input name="email2" defaultValue={co.emails?.[1] ?? ""} placeholder="e-mail 2" />
          <Input name="cnaePrincipal" defaultValue={co.cnaePrincipal ?? ""} placeholder="CNAE" className="col-span-2" />
          <Input name="porte" defaultValue={co.porte ?? ""} placeholder="porte" />
          <MaskedInput mask="uf" name="uf" defaultValue={co.uf ?? ""} maxLength={2} className={fieldClasses} />
          <Input name="municipio" defaultValue={co.municipio ?? ""} placeholder="município" />
          <Textarea name="notes" defaultValue={co.notes ?? ""} placeholder="observações" rows={2} className="col-span-2" />
          <Button type="submit" className="col-span-2 justify-self-start">
            Salvar empresa
          </Button>
        </form>
      </details>
    </Card>
  );
}
