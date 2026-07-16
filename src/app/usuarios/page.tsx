import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui";
import { createUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser();
  const db = getDb();
  const list = await db
    .select({ id: users.id, name: users.name, email: users.email, active: users.active, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-zinc-500">Quem pode entrar no CRM. Desativar corta o acesso na hora.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Email</th>
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
        <Field label="Senha * (mín. 10 caracteres)" className="col-span-2">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="col-span-2 justify-self-start">
          Criar usuário
        </Button>
      </form>
    </div>
  );
}
