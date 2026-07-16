/**
 * Rate limit em memória (janela fixa) pra frear força bruta no login.
 * Vale para instância única (é o caso: um processo pm2 / um container web); a
 * contagem zera quando o processo reinicia — suficiente como mínimo, sem Redis.
 *
 * Duas defesas complementares (P1):
 *  - rateLimit(): throttle por janela — quantas tentativas cabem em windowMs.
 *  - checkLockout()/registerFailure(): LOCKOUT progressivo — depois de N falhas
 *    seguidas a chave fica travada por um tempo crescente, mesmo que a janela do
 *    throttle já tenha virado. É o contador que "de fato é lido e aplicado":
 *    checkLockout() barra ANTES de qualquer verificação de senha.
 */
type Bucket = { count: number; resetAt: number };

// mesma tática do src/db: sobrevive ao HMR do dev via globalThis
const globalForRl = globalThis as unknown as {
  __rateBuckets?: Map<string, Bucket>;
  __lockouts?: Map<string, { fails: number; lockedUntil: number }>;
};
const buckets = (globalForRl.__rateBuckets ??= new Map<string, Bucket>());
const lockouts = (globalForRl.__lockouts ??= new Map());

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

// ------------------------------------------------------------ lockout

const LOCKOUT_THRESHOLD = 5; // falhas seguidas antes de travar
const LOCKOUT_BASE_MS = 60 * 1000; // 1ª trava: 1 min…
const LOCKOUT_MAX_MS = 60 * 60 * 1000; // …dobrando até no máx. 1h

/**
 * Diz se a chave está TRAVADA agora (lockout ativo). Chamar ANTES de gastar CPU
 * verificando senha — é o que faz o contador de falhas ser "de fato aplicado".
 * Retorna os ms restantes de trava (0 = livre).
 */
export function checkLockout(key: string): number {
  const rec = lockouts.get(key);
  if (!rec) return 0;
  const remaining = rec.lockedUntil - Date.now();
  if (remaining <= 0) return 0;
  return remaining;
}

/**
 * Registra UMA falha na chave. A partir do 5º erro seguido, trava por um tempo
 * que dobra a cada falha extra (1min, 2min, 4min… até 1h). O sucesso deve chamar
 * clearFailures() pra zerar — senão a próxima falha continua de onde parou.
 */
export function registerFailure(key: string) {
  const now = Date.now();
  const rec = lockouts.get(key) ?? { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= LOCKOUT_THRESHOLD) {
    const over = rec.fails - LOCKOUT_THRESHOLD; // 0 na 5ª falha, 1 na 6ª…
    const wait = Math.min(LOCKOUT_BASE_MS * 2 ** over, LOCKOUT_MAX_MS);
    rec.lockedUntil = now + wait;
  }
  lockouts.set(key, rec);

  // higiene: limpa registros velhos pra Map não crescer sem limite
  if (lockouts.size > 10_000) {
    for (const [k, v] of lockouts) if (v.lockedUntil < now && v.fails < LOCKOUT_THRESHOLD) lockouts.delete(k);
  }
}

/** Zera as falhas de uma chave (chamar no login bem-sucedido). */
export function clearFailures(key: string) {
  lockouts.delete(key);
}
