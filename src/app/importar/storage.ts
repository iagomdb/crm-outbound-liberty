import os from "node:os";
import path from "node:path";
import { readFile, readdir, stat, unlink } from "node:fs/promises";

// Guarda o upload entre o passo de análise e o de confirmação (a server action
// não mantém estado). Um upload pode ter VÁRIOS arquivos (mesma estrutura,
// ex.: 5 scraps do Maps): ficam como <token>.<n>.xlsx + <token>.json de meta.
// Apagados após o import — ou por idade, no melhor esforço, a cada novo upload.

export const UPLOAD_DIR = path.join(os.tmpdir(), "crm-imports");

export const isValidToken = (t: string) => /^[a-f0-9]{32}$/.test(t);

export const sheetPath = (token: string, idx: number) => path.join(UPLOAD_DIR, `${token}.${idx}.xlsx`);
export const metaPath = (token: string) => path.join(UPLOAD_DIR, `${token}.json`);

export type UploadMeta = { files: { name: string; size: number }[] };

export async function readMeta(token: string): Promise<UploadMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(token), "utf8")) as UploadMeta;
  } catch {
    return null;
  }
}

/** Todos os arquivos do upload, na ordem enviada. Vazio = expirou/já importado. */
export async function readSheets(token: string): Promise<{ idx: number; buffer: Buffer }[]> {
  try {
    const names = await readdir(UPLOAD_DIR);
    const mine = names
      .map((n) => {
        const m = n.match(new RegExp(`^${token}\\.(\\d+)\\.xlsx$`));
        return m ? Number(m[1]) : null;
      })
      .filter((idx): idx is number => idx != null)
      .sort((a, b) => a - b);
    return await Promise.all(mine.map(async (idx) => ({ idx, buffer: await readFile(sheetPath(token, idx)) })));
  } catch {
    return [];
  }
}

/** Apaga todos os arquivos de um upload (após o import). */
export async function deleteUpload(token: string): Promise<void> {
  const sheets = await readSheets(token);
  await Promise.all(sheets.map((s) => unlink(sheetPath(token, s.idx)).catch(() => {})));
  await unlink(metaPath(token)).catch(() => {});
}

/** Remove uploads com mais de 24h (melhor esforço). */
export async function cleanupOldUploads(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const f of await readdir(UPLOAD_DIR)) {
      const p = path.join(UPLOAD_DIR, f);
      try {
        if ((await stat(p)).mtimeMs < cutoff) await unlink(p);
      } catch {
        // arquivo pode ter sido removido em paralelo
      }
    }
  } catch {
    // diretório ainda não existe
  }
}
