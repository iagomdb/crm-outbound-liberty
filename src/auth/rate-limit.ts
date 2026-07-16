/**
 * Rate limit em memória (janela fixa) pra frear força bruta no login.
 * Vale para instância única (é o caso: um container web no compose); a contagem
 * zera quando o processo reinicia — suficiente como mínimo, sem Redis.
 */
type Bucket = { count: number; resetAt: number };

// mesma tática do src/db: sobrevive ao HMR do dev via globalThis
const globalForRl = globalThis as unknown as { __rateBuckets?: Map<string, Bucket> };
const buckets = (globalForRl.__rateBuckets ??= new Map<string, Bucket>());

/** Conta uma tentativa e diz se ainda está dentro do limite da janela. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** Zera a contagem (ex.: login bem-sucedido não deve consumir a cota do email). */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}
