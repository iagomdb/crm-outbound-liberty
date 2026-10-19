import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getAccess, isAdmin } from "@/auth/access";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getDb } from "@/db";
import { campaignMembers, campaigns, users } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { resetPassword, toggleActive, updateCarteiras, updateRole, updateUser } from "../actions";

export const dynamic = "force-dynamic";

const card = "flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OK_MSG: Record<string, string> = {
  senha: "Senha alterada. As outras sessões desse usuário foram derrubadas.",
  criado: "Usuário criado. Se for operador, libere abaixo as carteiras que ele pode ver.",
  papel: "Papel atualizado.",
  carteiras: "Carteiras atualizadas — vale na próxima tela que ele abrir.",
};

/**
 * Admin edita qualquer usuário. Operador só chega aqui pela própria conta
 * (nome no topo) e só enxerga o card de trocar senha.
 */
export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const me = await getAccess();
  const admin = isAdmin(me);
  const { id } = await params;
  const { ok } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  if (!admin && id !== me.id) notFound();

  const db = getDb();
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!u) notFound();

  const isMe = u.id === me.id;

  // carteiras (só o admin gerencia o compartilhamento)
  const [todas, minhas] = admin
    ? await Promise.all([
        db
          .select({ id: campaigns.id, name: campaigns.name, conta: campaigns.conta, status: campaigns.status })
          .from(campaigns)
          .orderBy(asc(campaigns.conta), asc(campaigns.name)),
        db.select({ id: campaignMembers.campaignId }).from(campaignMembers).where(eq(campaignMembers.userId, u.id)),
      ])
    : [[], []];
  const liberadas = new Set(minhas.map((m) => m.id));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        {admin && (
          <Link href="/usuarios" className="text-xs text-zinc-400 hover:underline">
            ← usuários
          </Link>
        )}
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {u.name}
          {isMe && <span className="text-sm font-normal text-zinc-400">(você)</span>}
          <Badge tone={u.role === "admin" ? "sky" : "neutral"} pill>
            {u.role}
          </Badge>
        </h1>
        <p className="text-xs text-zinc-400">última alteração {fmtDateTime(u.updatedAt)}</p>
      </div>

      {ok && OK_MSG[ok] && (
        <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {OK_MSG[ok]}
        </p>
      )}

      {admin && (
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
      )}

      {admin && (
        <form action={updateRole} className={card}>
          <h2 className="text-sm font-semibold">Papel</h2>
          <input type="hidden" name="userId" value={u.id} />
          <p className="text-sm text-zinc-500">
            <strong>admin</strong> vê todas as carteiras, gerencia usuários, importa e exclui.{" "}
            <strong>operador</strong> só vê as carteiras liberadas abaixo — liga, tria, arquiva e edita o script delas.
          </p>
          {isMe ? (
            <p className="text-xs text-zinc-400">Você não pode mudar o próprio papel.</p>
          ) : (
            <div className="flex items-center gap-2">
              <Select name="role" defaultValue={u.role} className="w-40">
                <option value="operador">operador</option>
                <option value="admin">admin</option>
              </Select>
              <Button type="submit">Salvar papel</Button>
            </div>
          )}
        </form>
      )}

      {admin && (
        <form action={updateCarteiras} className={card}>
          <h2 className="text-sm font-semibold">Carteiras compartilhadas</h2>
          <input type="hidden" name="userId" value={u.id} />
          {u.role === "admin" ? (
            <p className="text-sm text-zinc-500">Admin vê todas as carteiras — não precisa liberar nenhuma.</p>
          ) : todas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma carteira cadastrada ainda.</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                Marque o que {u.name} pode ver. Fila, agenda, roleta e contadores dele mostram só essas carteiras.
              </p>
              <div className="flex flex-col gap-0.5">
                {todas.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        name="carteira"
                        value={c.id}
                        defaultChecked={liberadas.has(c.id)}
                        className="size-4 accent-zinc-900 dark:accent-white"
                      />
                      {c.name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {c.conta ?? "sem conta"}
                      {c.status !== "ativa" ? ` · ${c.status}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <Button type="submit" className="justify-self-start">
                Salvar carteiras
              </Button>
            </>
          )}
        </form>
      )}

      <form action={resetPassword} className={card}>
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <input type="hidden" name="userId" value={u.id} />
        <Field label="Nova senha * (mín. 10 caracteres)">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="justify-self-start">Trocar senha</Button>
      </form>

      {admin && (
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
      )}
    </div>
  );
}
