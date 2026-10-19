import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { requireAdminPage } from "@/auth/access";
import { getDb } from "@/db";
import { campaignMembers, users } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { createUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdminPage();
  const db = getDb();
  const list = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
      carteiras: count(campaignMembers.id),
    })
    .from(users)
    .leftJoin(campaignMembers, eq(campaignMembers.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-zinc-500">
          Quem pode entrar no CRM. Operador só vê as carteiras liberadas pra ele (editar → carteiras). Desativar corta o
          acesso na hora.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Criado em</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2">
                  {u.name}
                  {u.id === me.id && <span className="ml-1.5 text-xs text-zinc-400">(você)</span>}
                </td>
                <td className="px-4 py-2 text-zinc-500">{u.email}</td>
                <td className="px-4 py-2">
                  <Badge tone={u.role === "admin" ? "sky" : "neutral"} pill>
                    {u.role}
                  </Badge>
                  {u.role === "operador" && (
                    <span className={`ml-1.5 text-xs ${u.carteiras === 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-400"}`}>
                      {u.carteiras === 0 ? "sem carteira" : `${u.carteiras} carteira${u.carteiras > 1 ? "s" : ""}`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {u.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      ativo
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-400">
                      inativo
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/usuarios/${u.id}`} className="text-xs text-zinc-500 hover:underline">
                    editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        action={createUser}
        className="grid max-w-xl grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="col-span-2 text-sm font-semibold">Novo usuário</h2>
        <Field label="Nome *">
          <Input name="name" required />
        </Field>
        <Field label="Email *">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Senha * (mín. 10 caracteres)">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Papel">
          <Select name="role" defaultValue="operador">
            <option value="operador">operador — só carteiras liberadas</option>
            <option value="admin">admin — tudo</option>
          </Select>
        </Field>
        <Button type="submit" className="col-span-2 justify-self-start">
          Criar usuário
        </Button>
      </form>
    </div>
  );
}
