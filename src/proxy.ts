/**
 * Proxy (o middleware.ts antigo — Next 16 renomeou): checagem OTIMISTA de auth.
 * Só olha a PRESENÇA do cookie de sessão — sem ir ao banco, porque roda em toda
 * request (inclusive prefetch). Serve pra pré-filtrar anônimo e centralizar o
 * redirect; a validação real do token é o requireUser() (src/auth/dal.ts) que
 * cada página/action protegida chama. O proxy nunca é a única linha de defesa.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/auth/cookie";

const PUBLIC_PATHS = ["/login"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic || req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = new URL("/login", req.nextUrl);
  const next = pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // protege tudo menos assets estáticos (rotas de API futuras também ficam atrás do login)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
