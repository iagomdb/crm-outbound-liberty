import "dotenv/config";
import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/auth/password";
import { getDb } from "../src/db";
import { users } from "../src/db/schema";

// Não há cadastro público (CRM interno) — usuário nasce por aqui.
//
// Uso:
//   npm run auth:create-user -- iago@exemplo.com "Iago Bernardi" --admin
//   npm run auth:create-user -- socio@exemplo.com "Fulano"          (nasce operador)
//   npm run auth:create-user -- iago@exemplo.com --reset-password [--admin]
//
// --admin: cria (ou promove, junto com --reset-password) como admin. É também a
// porta de emergência se o último admin perder o papel.
//
// A senha é digitada no prompt (sem eco): não fica no histórico do shell.

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    // silencia o eco do que for digitado (a pergunta já foi escrita acima)
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const reset = process.argv.includes("--reset-password");
  const admin = process.argv.includes("--admin");
  const args = process.argv.slice(2).filter((a) => a !== "--reset-password" && a !== "--admin");
  const email = (args[0] ?? "").trim().toLowerCase();
  const name = (args[1] ?? "").trim();

  if (!email.includes("@")) {
    console.error('uso: npm run auth:create-user -- email@dominio.com "Nome Completo" [--admin] [--reset-password]');
    process.exit(1);
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email));

  if (existing && !reset) {
    console.error(`Usuário ${email} já existe. Para trocar a senha: adicione --reset-password`);
    process.exit(1);
  }
  if (!existing && !name) {
    console.error('Faltou o nome: npm run auth:create-user -- email@dominio.com "Nome Completo"');
    process.exit(1);
  }

  const password = await promptHidden("Senha (mín. 10 caracteres): ");
  if (password.length < 10) {
    console.error("Senha muito curta (mínimo 10 caracteres).");
    process.exit(1);
  }
  const confirm = await promptHidden("Confirme a senha: ");
  if (password !== confirm) {
    console.error("As senhas não conferem.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, active: true, ...(admin ? { role: "admin" as const } : {}) })
      .where(eq(users.id, existing.id));
    console.log(`Senha redefinida: ${existing.name} <${email}>${admin ? " — agora admin" : ""}`);
  } else {
    const [u] = await db
      .insert(users)
      .values({ email, name, passwordHash, role: admin ? "admin" : "operador" })
      .returning();
    console.log(`Usuário criado: ${u.name} <${u.email}> (${u.id}) — ${u.role}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
