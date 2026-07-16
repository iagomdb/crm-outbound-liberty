"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const inp = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const lbl = "text-xs text-zinc-500";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <input type="hidden" name="next" value={next} />
      <div>
        <div className={lbl}>Email</div>
        <input name="email" type="email" required autoFocus autoComplete="username" className={inp} />
      </div>
      <div>
        <div className={lbl}>Senha</div>
        <input name="password" type="password" required autoComplete="current-password" className={inp} />
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        disabled={pending}
        className="justify-self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
