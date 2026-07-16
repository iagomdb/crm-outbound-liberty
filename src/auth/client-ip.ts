/**
 * IP confiável do cliente para rate limit (P1: "confie no IP certo").
 *
 * NÃO usar o primeiro IP do X-Forwarded-For: esse header é ANEXÁVEL pelo cliente,
 * que pode forjar `X-Forwarded-For: 1.2.3.4` e trocar de "IP" a cada request,
 * esvaziando o balde por IP. Só vale o IP que UM PROXY CONFIÁVEL escreveu.
 *
 * No deploy (nginx, veja DEPLOY-VPS.md) o proxy injeta `X-Real-IP $remote_addr`
 * = o IP da conexão TCP real, que o cliente não controla. É a fonte primária.
 * Fallback: o ÚLTIMO salto do X-Forwarded-For (o que o proxy mais próximo
 * adicionou), nunca o primeiro. Sem nenhum dos dois (dev local) → "local".
 */
import { headers } from "next/headers";

export async function getClientIp(): Promise<string> {
  const h = await headers();

  // fonte primária: o nginx escreve isto com o IP real da conexão
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // fallback: último IP da cadeia XFF = o salto mais próximo (o proxy confiável),
  // e não o primeiro (que o cliente pode ter forjado)
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts.at(-1);
    if (last) return last;
  }

  return "local";
}
