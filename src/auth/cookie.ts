/**
 * Só o nome do cookie, num arquivo sem nenhum import: o proxy.ts precisa dele e
 * não deve arrastar drizzle/postgres/next-headers pro bundle do proxy.
 */
export const SESSION_COOKIE = "session";
