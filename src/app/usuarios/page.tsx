import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { createUser } from "./actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";

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
        <div>
          <div className={lbl}>Nome *</div>
          <input name="name" required className={inp} />
        </div>
        <div>
          <div className={lbl}>Email *</div>
          <input name="email" type="email" required className={inp} />
        </div>
        <div className="col-span-2">
          <div className={lbl}>Senha * (mín. 10 caracteres)</div>
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inp} />
        </div>
        <button className="col-span-2 justify-self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          Criar usuário
        </button>
      </form>
    </div>
  );
}
