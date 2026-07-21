import os from "node:os";
import path from "node:path";
import { readFile, readdir, stat, unlink } from "node:fs/promises";

// Guarda o upload entre o passo de análise e o de confirmação (a server action
// não mantém estado). Arquivos ficam no tmp do host/container e são apagados
// após o import — ou por idade, no melhor esforço, a cada novo upload.

export const UPLOAD_DIR = path.join(os.tmpdir(), "crm-imports");

export const isValidToken = (t: string) => /^[a-f0-9]{32}$/.test(t);

export const sheetPath = (token: string) => path.join(UPLOAD_DIR, `${token}.xlsx`);
export const metaPath = (token: string) => path.join(UPLOAD_DIR, `${token}.json`);

export type UploadMeta = { name: string; size: number };

export async function readMeta(token: string): Promise<UploadMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(token), "utf8")) as UploadMeta;
  } catch {
    return null;
  }
}

export async function readSheet(token: string): Promise<Buffer | null> {
  try {
    return await readFile(sheetPath(token));
  } catch {
    return null;
  }
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
