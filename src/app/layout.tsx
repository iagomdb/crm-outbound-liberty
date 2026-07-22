import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getSessionUser } from "@/auth/dal";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeScript } from "@/components/ThemeScript";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const navLink = "text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

export const metadata: Metadata = {
  title: "CRM Outbound — Liberty",
  description: "Prospecção outbound — recuperação de crédito",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // só pra montar o header (nome + Sair); a proteção das rotas é do proxy + DAL,
  // não do layout (layout não re-renderiza a cada navegação)
  const user = await getSessionUser();

  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                CRM <span className="text-zinc-400">Outbound</span>
              </Link>
              {user && (
                <>
                  <Link href="/fila" className={`${navLink} font-medium text-zinc-900 dark:text-zinc-100`}>
                    Fila do Dia
                  </Link>
                  <Link href="/agenda" className={navLink}>
                    Agenda
                  </Link>
                  <Link href="/icp" className={navLink}>
                    ICP
                  </Link>
                  <Link href="/templates" className={navLink}>
                    Templates
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link href="/usuarios" className={navLink}>
                    Usuários
                  </Link>
                  <span className="text-zinc-400">{user.name}</span>
                  <LogoutButton />
                </>
              ) : (
                <span className="text-xs text-zinc-400">Liberty · recuperação de crédito</span>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
