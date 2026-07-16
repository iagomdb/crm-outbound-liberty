import { logout } from "@/app/login/actions";

/** Botão "Sair" — pronto pra encaixar no header do layout quando conectarmos o módulo. */
export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">Sair</button>
    </form>
  );
}
