import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth/dal";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // checagem segura (banco), não a otimista do proxy: cookie velho/inválido
  // não pode prender o usuário fora da tela de login
  if (await getSessionUser()) redirect("/");

  const { next } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 py-10">
      <div>
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="text-sm text-zinc-500">Acesso restrito à equipe Liberty.</p>
      </div>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </div>
  );
}
