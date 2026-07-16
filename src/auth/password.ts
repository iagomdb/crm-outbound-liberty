/**
 * Hash de senha com scrypt do node:crypto — sem dependência nativa (bcrypt/argon2
 * quebram fácil no Windows) e parâmetros OWASP (N=2^17, r=8, p=1).
 *
 * Formato armazenado: "scrypt:N:r:p:salt_b64:hash_b64". Os parâmetros vivem no
 * próprio hash, então dá pra endurecer os custos no futuro sem invalidar senhas
 * antigas (verifica com os parâmetros gravados, re-hasheia no próximo login se quiser).
 *
 * Também usado pelo script CLI (scripts/create-user.ts) — não importe nada de
 * next/* aqui.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// promisify não enxerga a sobrecarga com options — promessa feita à mão
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const SCRYPT_N = 131072; // 2^17
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt aloca 128*N*r bytes (~134 MB); o maxmem default do Node (32 MB) não basta
const MAX_MEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split(":");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Hash de uma senha impossível (salt e hash zerados): quando o email não existe,
 * o login verifica contra ele mesmo assim, para o tempo de resposta não entregar
 * quais emails estão cadastrados.
 */
export const DUMMY_HASH = [
  "scrypt",
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  Buffer.alloc(SALT_LENGTH).toString("base64"),
  Buffer.alloc(KEY_LENGTH).toString("base64"),
].join(":");
