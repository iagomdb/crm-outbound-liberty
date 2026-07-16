"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <Input name="email" type="email" required autoFocus autoComplete="username" />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
