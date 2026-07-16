import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui";
import { resetPassword, toggleActive, updateUser } from "../actions";

export const dynamic = "force-dynamic";

const card = "flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const { ok } = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const db = getDb();
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, active: users.active, updatedAt: users.updatedAt })
    .from(users)
    .where(eq(users.id, id));
  if (!u) notFound();

  const isMe = u.id === me.id;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <Link href="/usuarios" className="text-xs text-zinc-400 hover:underline">
          ← usuários
        </Link>
        <h1 className="text-xl font-semibold">
          {u.name}
          {isMe && <span className="ml-2 text-sm font-normal text-zinc-400">(você)</span>}
        </h1>
        <p className="text-xs text-zinc-400">última alteração {fmtDateTime(u.updatedAt)}</p>
      </div>

      {ok === "senha" && (
        <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          Senha alterada. As outras sessões desse usuário foram derrubadas.
        </p>
      )}

      <form action={updateUser} className={card}>
        <h2 className="text-sm font-semibold">Dados</h2>
        <input type="hidden" name="userId" value={u.id} />
        <Field label="Nome *">
          <Input name="name" defaultValue={u.name} required />
        </Field>
        <Field label="Email *">
          <Input name="email" type="email" defaultValue={u.email} required />
        </Field>
        <Button type="submit" className="justify-self-start">Salvar</Button>
      </form>

      <form action={resetPassword} className={card}>
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <input type="hidden" name="userId" value={u.id} />
        <Field label="Nova senha * (mín. 10 caracteres)">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="justify-self-start">Trocar senha</Button>
      </form>

      <form action={toggleActive} className={card}>
        <h2 className="text-sm font-semibold">Acesso</h2>
        <input type="hidden" name="userId" value={u.id} />
        <p className="text-sm text-zinc-500">
          {u.active ? "Usuário ativo — pode entrar no CRM." : "Usuário inativo — login bloqueado."}
        </p>
        {isMe ? (
          <p className="text-xs text-zinc-400">Você não pode desativar o próprio usuário.</p>
        ) : u.active ? (
          <ConfirmButton
            message={`Desativar ${u.name}? O acesso é cortado na hora (sessões abertas caem).`}
            className="justify-self-start rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Desativar usuário
          </ConfirmButton>
        ) : (
          <Button type="submit" className="justify-self-start">Reativar usuário</Button>
        )}
      </form>
    </div>
  );
}
