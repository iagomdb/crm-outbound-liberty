/**
 * Proxy (o middleware.ts antigo — Next 16 renomeou). Faz duas coisas em toda request:
 *
 * 1) Checagem OTIMISTA de auth: só olha a PRESENÇA do cookie de sessão — sem ir ao
 *    banco, porque roda em toda request (inclusive prefetch). Pré-filtra anônimo e
 *    centraliza o redirect; a validação real do token é o requireUser()
 *    (src/auth/dal.ts) que cada página/action protegida chama. O proxy nunca é a
 *    única linha de defesa.
 *
 * 2) Content-Security-Policy com NONCE por request. A app é servida atrás do nginx,
 *    mas a CSP é gerada AQUI (não no nginx) porque o Next injeta automaticamente
 *    este nonce nos scripts inline dele (runtime React + stream RSC). Sem isso, uma
 *    CSP `script-src 'self'` bloqueia a hidratação inteira. O nginx NÃO deve mandar
 *    header CSP próprio pro CRM (senão sobrepõe este). Todas as páginas do CRM já são
 *    `force-dynamic`, então o requisito de render dinâmico do nonce não custa nada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/auth/cookie";

const PUBLIC_PATHS = ["/login"];

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    // 'strict-dynamic' faz o browser confiar nos scripts que o runtime com-nonce
    // carrega (os chunks /_next/*), sem precisar listar cada um. 'unsafe-eval' só
    // em dev (React usa eval pra montar stack traces).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // em dev o Next injeta estilos inline sem nonce; em prod usamos o nonce
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // nonce novo por request (base64 de um UUID — imprevisível)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // o Next lê o nonce do header da REQUEST pra aplicar nos scripts que gera
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // anônimo em rota protegida → redirect pro login (a CSP não importa nessa resposta)
  if (!isPublic && !req.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", req.nextUrl);
    const next = pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // protege/aplica CSP em tudo menos assets estáticos. Ignora prefetches do next/link
  // (não precisam de CSP e gerariam nonces descartados).
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
