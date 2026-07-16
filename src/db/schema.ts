/**
 * Schema Drizzle — o modelo ENCODA o playbook (docs/cold-call-recuperacao-credito-v2.md),
 * não é CRM genérico.
 *
 *   campaigns  → o "projeto"/oferta (multi-campanha). #1 = Recuperação de Crédito
 *   companies  → global, chave = CNPJ (dados do export consultas.plus)
 *   contacts   → pessoa na empresa (papel: atendente/analista/decisor; email nominal vs genérico)
 *   targets    → empresa ↔ campanha = o registro de pipeline (estágio, cadência, pretexto novo)
 *   activities → cada ligação/tentativa (reached_human, stalled_at, objeção, objetivo batido)
 *   meetings   → vitória #1 (casos separados, handoff pro escritório)
 *   users      → operador do CRM (login/senha — módulo em src/auth)
 *   sessions   → sessões de login (cookie guarda o token; o banco só o hash dele)
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- enums
export const campaignStatus = pgEnum("campaign_status", ["ativa", "pausada", "arquivada"]);

/** Papel de quem atende (gatekeeper vs decisor). O alvo é o DECISOR. */
export const contactRole = pgEnum("contact_role", ["atendente", "analista", "decisor", "desconhecido"]);

/** Funil: novo → fit (triado, pré-fila) → tentando → conversa → qualificado → reunião → handoff. */
export const targetStage = pgEnum("target_stage", [
  "novo",
  "fit",
  "tentando",
  "conversa",
  "qualificado",
  "reuniao_agendada",
  "handoff",
  "ganho",
  "perdido",
  "nao_agora",
]);

/** O qualificador real do playbook: já deu o dinheiro como perdido? */
export const mentalState = pgEnum("mental_state", ["desconhecido", "ainda_negocia", "ja_deu_como_perdido"]);

export const activityType = pgEnum("activity_type", ["ligacao", "email", "voicemail", "whatsapp", "nota"]);

/** Os dois objetivos de toda ligação. */
export const objectiveHit = pgEnum("objective_hit", ["nenhum", "reuniao", "email_nominal"]);

export const objectionType = pgEnum("objection_type", [
  "nenhuma",
  "ja_temos",
  "manda_email",
  "quanto_custa",
  "sem_caso",
  "so_ano_que_vem",
  "sem_tempo",
  "outra",
]);

export const meetingStatus = pgEnum("meeting_status", [
  "agendada",
  "realizada",
  "no_show",
  "remarcada",
  "cancelada",
]);

// carimbos compartilhados
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const emptyJsonArray = sql`'[]'::jsonb`;

// ---------------------------------------------------------------- campaigns
export const campaigns = pgTable("campaigns", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  slug: text().unique(),
  description: text(),
  offerTerms: text(), // condições travadas ("só paga se recuperar", caso único)
  icp: text(), // definição do ICP dessa campanha
  scriptRef: text().default("docs/cold-call-recuperacao-credito-v2.md"),
  status: campaignStatus().notNull().default("ativa"),
  ...timestamps,
});

// ---------------------------------------------------------------- companies (global, por CNPJ)
export const companies = pgTable("companies", {
  id: uuid().defaultRandom().primaryKey(),
  cnpj: varchar({ length: 14 }).unique(), // só dígitos (canônico); null = lead sem CNPJ (ex.: Google Maps)
  razaoSocial: text().notNull(),
  nomeFantasia: text(),
  dataAbertura: date(),
  porte: text(),
  cnaePrincipal: text(),
  cnaeSecundarios: jsonb().$type<string[]>().notNull().default(emptyJsonArray),
  naturezaJuridica: text(),
  capitalSocial: numeric({ precision: 15, scale: 2 }),
  tipoEmail: text(),
  emails: jsonb().$type<string[]>().notNull().default(emptyJsonArray),
  telefones: jsonb().$type<string[]>().notNull().default(emptyJsonArray),
  cep: varchar({ length: 8 }),
  uf: varchar({ length: 2 }),
  municipio: text(),
  bairro: text(),
  logradouro: text(),
  numero: text(),
  complemento: text(),
  socios: jsonb().$type<{ nome: string; qualificacao?: string }[]>().notNull().default(emptyJsonArray),
  source: text().default("consultas.plus"),
  icpFit: boolean(), // null = não triado; true/false = decisão de triagem de ICP
  notes: text(),
  ...timestamps,
});

// ---------------------------------------------------------------- email_templates
export const emailTemplates = pgTable("email_templates", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(), // nome interno ("Follow-up — outras áreas")
  subject: text().notNull(),
  body: text().notNull(), // texto puro; {{empresa}} e {{contato}} substituídos ao compor
  ...timestamps,
});

// ---------------------------------------------------------------- contacts (pessoa na empresa)
export const contacts = pgTable(
  "contacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    nome: text(), // pode ser null até descobrir o decisor
    papel: contactRole().notNull().default("desconhecido"),
    cargo: text(),
    telefoneDireto: text(),
    email: text(),
    emailGenerico: boolean().notNull().default(false), // financeiro@ = buraco negro
    melhorHorario: text(), // quando a pessoa costuma estar
    notes: text(),
    ...timestamps,
  },
  (t) => [index("contacts_company_idx").on(t.companyId)],
);

// ---------------------------------------------------------------- targets (empresa ↔ campanha = pipeline)
export const targets = pgTable(
  "targets",
  {
    id: uuid().defaultRandom().primaryKey(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stage: targetStage().notNull().default("novo"),
    mentalState: mentalState().notNull().default("desconhecido"),
    primaryContactId: uuid().references(() => contacts.id, { onDelete: "set null" }), // o decisor
    attempts: integer().notNull().default(0), // nº de contatos (cadência)
    lastContactAt: timestamp({ withTimezone: true }),
    nextActionAt: timestamp({ withTimezone: true }),
    nextActionPretext: text(), // o PRETEXTO NOVO — cadência teimosa exige motivo novo
    qualified: boolean().notNull().default(false),
    wonEmailNominal: boolean().notNull().default(false), // objetivo #2 já batido
    valorEstimado: numeric({ precision: 15, scale: 2 }), // quanto foi baixado como perda
    priority: integer().notNull().default(0), // ordena a fila de ligação
    stageChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(), // p/ "dias parado"
    moves: integer().notNull().default(0), // quantas vezes mudou de coluna no kanban
    archivedAt: timestamp({ withTimezone: true }), // null = ativo (no board)
    archiveReason: text(),
    lostReason: text(),
    notes: text(), // observações livres do alvo
    ...timestamps,
  },
  (t) => [
    uniqueIndex("targets_campaign_company_uidx").on(t.campaignId, t.companyId),
    index("targets_campaign_stage_idx").on(t.campaignId, t.stage),
    index("targets_next_action_idx").on(t.nextActionAt),
  ],
);

// ---------------------------------------------------------------- activities (cada ligação/tentativa)
export const activities = pgTable(
  "activities",
  {
    id: uuid().defaultRandom().primaryKey(),
    targetId: uuid()
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }), // com quem falou
    type: activityType().notNull().default("ligacao"),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reachedHuman: boolean().notNull().default(false), // conta conversa, NÃO discada
    durationSec: integer(),
    outcome: text(), // resultado em 1 linha
    stalledAt: text(), // onde travou (a frase exata onde esfriou)
    objection: objectionType().notNull().default("nenhuma"),
    objectionIsReflexo: boolean(), // reflexo ≠ objeção real
    hypothesisLanded: boolean(), // a hipótese "já dado como perdido" pegou?
    objectiveHit: objectiveHit().notNull().default("nenhum"), // reunião OU email nominal
    goldenHour: boolean(),
    nextActionAt: timestamp({ withTimezone: true }),
    nextActionPretext: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_target_idx").on(t.targetId, t.occurredAt),
    index("activities_occurred_idx").on(t.occurredAt),
  ],
);

// ---------------------------------------------------------------- meetings (vitória #1)
export const meetings = pgTable(
  "meetings",
  {
    id: uuid().defaultRandom().primaryKey(),
    targetId: uuid()
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    activityId: uuid().references(() => activities.id, { onDelete: "set null" }),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    status: meetingStatus().notNull().default("agendada"),
    casosParaTrazer: text(), // os 2-3 casos que o cliente separa
    handoffNotes: text(), // pro escritório triar
    resultado: text(),
    ...timestamps,
  },
  (t) => [index("meetings_target_idx").on(t.targetId)],
);

// ---------------------------------------------------------------- users / sessions (auth)
export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey(),
  email: text().notNull().unique(), // sempre minúsculo (normalizado no cadastro e no login)
  name: text().notNull(),
  passwordHash: text().notNull(), // scrypt — formato autodescritivo (src/auth/password.ts)
  active: boolean().notNull().default(true), // false = bloqueia login sem apagar o usuário
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar({ length: 64 }).notNull().unique(), // sha256 hex; o token cru só existe no cookie
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- relations (query API)
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  targets: many(targets),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  targets: many(targets),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  activities: many(activities),
}));

export const targetsRelations = relations(targets, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [targets.campaignId], references: [campaigns.id] }),
  company: one(companies, { fields: [targets.companyId], references: [companies.id] }),
  primaryContact: one(contacts, { fields: [targets.primaryContactId], references: [contacts.id] }),
  activities: many(activities),
  meetings: many(meetings),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  target: one(targets, { fields: [activities.targetId], references: [targets.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  target: one(targets, { fields: [meetings.targetId], references: [targets.id] }),
  activity: one(activities, { fields: [meetings.activityId], references: [activities.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
