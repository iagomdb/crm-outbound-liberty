import { headers } from "next/headers";

// Aplica o tema salvo antes da primeira pintura, evitando "flash" de tema errado.
// O código vive em /public/theme-init.js (arquivo estático de mesma origem). Sob a
// CSP com nonce (ver proxy.ts, strict-dynamic), um <script src> no HTML só executa
// se trouxer o nonce da request — então lemos de headers() e repassamos. Sem
// async/defer, roda sincronamente durante o parse do <head>, antes de pintar.
// Mantido em sincronia com ThemeToggle.tsx (via lib/theme.ts).

export async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // suppressHydrationWarning por causa do NONCE, não do tema: a spec de CSP manda
  // o browser esvaziar o atributo `nonce` do DOM assim que processa o elemento
  // (senão dava pra vazar o nonce com um seletor de CSS). Na hidratação o React
  // acha nonce="" no DOM, compara com o nonce real que ele renderizaria e grita.
  // O script já executou — a divergência é da spec, não do nosso HTML, e não tem
  // como conciliar. Só este elemento fica suprimido.
  return <script src="/theme-init.js" nonce={nonce} suppressHydrationWarning />;
}
