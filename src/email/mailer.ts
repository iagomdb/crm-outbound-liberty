/**
 * Transporte SMTP lido do .env (SMTP_HOST/PORT/USER/PASS/FROM). Sem config,
 * emailConfig() retorna null e a UI avisa em vez de quebrar — o CRM funciona
 * sem e-mail até o SMTP ser preenchido.
 */
import nodemailer from "nodemailer";

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
};

export function emailConfig(): EmailConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_FROM) return null;
  const port = Number(SMTP_PORT ?? 587);
  return {
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true" || port === 465, // 465 = TLS implícito; 587 usa STARTTLS
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS ?? "" } : undefined,
    from: SMTP_FROM,
  };
}

export const isEmailConfigured = () => emailConfig() !== null;

export function getTransporter() {
  const cfg = emailConfig();
  if (!cfg) throw new Error("SMTP não configurado — preencha SMTP_HOST e SMTP_FROM no .env");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
}
