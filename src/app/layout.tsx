import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Outbound — Liberty",
  description: "Prospecção outbound — recuperação de crédito",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                CRM <span className="text-zinc-400">Outbound</span>
              </Link>
              <Link href="/fila" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                Fila do Dia
              </Link>
              <Link href="/agenda" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                Agenda
              </Link>
            </div>
            <span className="text-xs text-zinc-400">Liberty · recuperação de crédito</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
