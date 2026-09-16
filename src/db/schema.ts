/**
 * Schema Drizzle — o modelo ENCODA o playbook (docs/cold-call-recuperacao-credito-v2.md),
 * não é CRM genérico.
 *
 *   campaigns  → o "projeto"/oferta (multi-campanha). #1 = Recuperação de Crédito
 *                agrupadas por `conta` = pra quem a prospecção é feita
 *   script_groups → o FLUXO da carteira: MENUS do script ramificado. Um menu é
 *                uma coluna de opções ("Abertura", "Reação", "Objeções"), e a
 *                ligação vai de OPÇÃO → MENU inteiro
 *   script_nodes → as opções dentro dos menus (a fala, e pra onde ela leva)
 *   companies  → global, chave = CNPJ (dados do export consultas.plus)
 *   contacts   → pessoa na empresa (papel: atendente/analista/decisor; email nominal vs genérico)
 *   targets    → empresa ↔ campanha = o registro de pipeline (estágio, cadência, pretexto novo)
 *   activities → cada ligação/tentativa (reached_human, stalled_at, objeção, objetivo batido)
 *   meetings   → vitória #1 (casos separados, handoff pro escritório)
 *   users      → operador do CRM (login/senha — módulo em src/auth)
 *   sessions   → sessões de login (cookie guarda o token; o banco só o hash dele)
 */
import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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

/**
 * Tipo do nó do FLUXO (grafo do script — `script_nodes`). Colore a coluna e diz
 * de quem é a vez: eu falo, ele reage, ou a conversa terminou ali.
 */
export const scriptNodeKind = pgEnum("script_node_kind", ["fala", "reacao", "saida"]);

// ---- campos de estatística de ICP (validação de hipótese de mercado por segmento)

/** Qualidade do ICP percebida pelo vendedor — mede potencial, mesmo que rejeite a ligação. */
export const icpGrade = pgEnum("icp_grade", ["A", "B", "C", "D"]);

/** Como a empresa resolve inadimplência hoje. */
export const cobrancaType = pgEnum("cobranca_type", [
  "nao_possui",
  "cobranca_interna",
  "juridico_interno",
  "escritorio_terceirizado",
  "nao_soube",
]);

/** Base de clientes estimada (se descoberto na conversa). */
export const faixaClientes = pgEnum("faixa_clientes", ["ate_50", "de_51_200", "de_201_500", "mais_500"]);

/** Porte percebido na conversa (não precisa ser preciso — é pra análise). */
export const portePercebido = pgEnum("porte_percebido", ["micro", "pequena", "media", "grande"]);

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
  /**
   * Pra QUEM essa prospecção é feita ("Meu", "Liberty", ...). É o agrupador
   * acima da carteira: o seletor no topo do app fixa uma conta e fila, agenda,
   * roleta e contadores passam a enxergar só as carteiras dela. null = sem
   * conta definida (só aparece no modo "todas as contas").
   */
  conta: text(),
  description: text(),
  offerTerms: text(), // condições travadas ("só paga se recuperar", caso único)
  icp: text(), // definição do ICP dessa campanha
  script: text(), // script/pitch da carteira em markdown — renderizado na fila e no target
  status: campaignStatus().notNull().default("ativa"),
  ...timestamps,
});

// ---------------------------------------------------------------- checklist_items
// Objetivos da ligação da carteira, um registro por item (aba ✅ ao lado do
// pitch nas telas de discagem). Editados em bloco: o save da carteira faz
// replace-all preservando a ordem.
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid().defaultRandom().primaryKey(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    descricao: text(), // detalhe opcional exibido abaixo do título
    ordem: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("checklist_items_campaign_idx").on(t.campaignId)],
);

// Variantes de um item do checklist (item com opções vira uma CATEGORIA:
// na ligação escolhe-se QUAL variação foi usada — teste A/B de abordagem).
export const checklistOptions = pgTable(
  "checklist_options",
  {
    id: uuid().defaultRandom().primaryKey(),
    itemId: uuid()
      .notNull()
      .references(() => checklistItems.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    ordem: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("checklist_options_item_idx").on(t.itemId)],
);

// ---------------------------------------------------------------- script_groups / script_nodes
// O FLUXO da carteira: script ramificado (não linear), modelado em MENUS.
//
// Um MENU (`script_groups`) é um momento da conversa com várias saídas possíveis
// — "Abertura", "Reação dele", "Objeções". Uma OPÇÃO (`script_nodes`) é uma fala
// dentro de um menu. A ligação sai da OPÇÃO e chega num MENU INTEIRO.
//
// Por que opção→menu e não opção→opção: com 3 variações por passo, ligar dois
// passos custava 3×3 = 9 arestas, e cada variação nova custava mais 6. Apontando
// pro menu, ligar custa 1 e a variação nova custa ZERO — ela já nasce dentro do
// menu que todo mundo enxerga. É o que torna 9 passos × 5 lines manutenível.
//
// O destino tem dois níveis, como o "Default" do Typebot: a opção pode ter o seu
// (`script_nodes.proximoId`) e, quando não tem, cai no padrão do menu
// (`script_groups.padraoId`). Então "o menu B leva ao menu C" é UMA configuração,
// e só a exceção é declarada por opção.
//
// Uma opção pode estar em VÁRIOS menus (`script_group_options`): "manda no zap"
// aparece no menu da abertura e no da CTA sendo a MESMA opção — edita num lugar,
// e a estatística dela não fragmenta. E como o padrão vem do menu, a mesma opção
// pode levar a lugares diferentes dependendo de onde foi usada.
//
// Na discagem vira colunas: cada coluna é um menu. O caminho percorrido vai pro
// registro da ligação (`activities.caminho`) e alimenta o Aprendizado.
export const scriptGroups = pgTable(
  "script_groups",
  {
    id: uuid().defaultRandom().primaryKey(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    nome: text().notNull(), // "Abertura", "Objeções" — o título do card
    /** true = por onde a ligação começa (a primeira coluna) */
    entrada: boolean().notNull().default(false),
    /** destino padrão: opção sem destino próprio cai aqui (o "Default" do Typebot) */
    padraoId: uuid().references((): AnyPgColumn => scriptGroups.id, { onDelete: "set null" }),
    // posição no canvas do editor — layout é dado do usuário, não pode se perder
    posX: integer().notNull().default(0),
    posY: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("script_groups_campaign_idx").on(t.campaignId),
    index("script_groups_entrada_idx").on(t.campaignId, t.entrada),
  ],
);
export const scriptNodes = pgTable(
  "script_nodes",
  {
    id: uuid().defaultRandom().primaryKey(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: scriptNodeKind().notNull().default("fala"),
    titulo: text().notNull(), // rótulo curto do card ("A3 · manda no zap")
    fala: text(), // o texto exato, lido em voz alta (markdown)
    nota: text(), // dica de tom / quando usar — só aparece na opção aberta
    /** pra onde ESTA opção leva. null = cai no padrão do menu em que foi clicada. */
    proximoId: uuid().references(() => scriptGroups.id, { onDelete: "set null" }),
    /** LEGADO (modelo opção→opção). Lido só por scripts/migrate-fluxo-menus.ts. */
    entrada: boolean().notNull().default(false),
    /** LEGADO: a ordem agora é por menu, em script_group_options.ordem. */
    ordem: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("script_nodes_campaign_idx").on(t.campaignId)],
);

// Quais opções aparecem em cada menu, e em que ordem. É N:N de propósito — a
// mesma opção em dois menus é a MESMA opção (mesma estatística, edita uma vez).
export const scriptGroupOptions = pgTable(
  "script_group_options",
  {
    id: uuid().defaultRandom().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => scriptGroups.id, { onDelete: "cascade" }),
    nodeId: uuid()
      .notNull()
      .references(() => scriptNodes.id, { onDelete: "cascade" }),
    ordem: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("script_group_options_uidx").on(t.groupId, t.nodeId),
    index("script_group_options_group_idx").on(t.groupId),
    index("script_group_options_node_idx").on(t.nodeId),
  ],
);

/**
 * LEGADO — o modelo antigo, opção→opção. Continua aqui de propósito: a migração
 * pra menus é ADITIVA, e quem converte é scripts/migrate-fluxo-menus.ts, lendo
 * daqui. Só some numa migration posterior, depois do deploy conferido.
 */
export const scriptEdges = pgTable(
  "script_edges",
  {
    id: uuid().defaultRandom().primaryKey(),
    fromId: uuid()
      .notNull()
      .references(() => scriptNodes.id, { onDelete: "cascade" }),
    toId: uuid()
      .notNull()
      .references(() => scriptNodes.id, { onDelete: "cascade" }),
    ordem: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("script_edges_from_to_uidx").on(t.fromId, t.toId),
    index("script_edges_from_idx").on(t.fromId),
    index("script_edges_to_idx").on(t.toId),
  ],
);

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
  mapsUrl: text(), // link do lugar no Google Maps (scrap) — o clique no nome usa ele quando existe
  horarioFuncionamento: text(), // horário de funcionamento (scrap do Maps)
  // descobertos na conversa (estatística de ICP) — null = não descoberto ainda
  tipoCobranca: cobrancaType(), // como resolve inadimplência hoje
  faixaClientes: faixaClientes(), // base de clientes estimada
  portePercebido: portePercebido(), // porte percebido pelo vendedor
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
    icpGrade: icpGrade(), // A-D: qualidade do ICP percebida (null = não avaliado)
    primaryContactId: uuid().references(() => contacts.id, { onDelete: "set null" }), // o decisor
    attempts: integer().notNull().default(0), // nº de contatos (cadência)
    noAnswerStreak: integer().notNull().default(0), // tentativas SEGUIDAS sem atender (zera ao falar com humano)
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
    dorPercebida: integer(), // 0-4: intensidade da dor percebida NESTA ligação (null = não avaliado)
    // variações de abordagem usadas NESTA ligação (categoria do checklist → opção escolhida)
    abordagens: jsonb().$type<{ itemId: string; categoria: string; opcao: string }[]>(),
    // o CAMINHO percorrido no fluxo (script_nodes), na ordem em que foi clicado.
    // O último item é onde a conversa parou. Guarda o título junto: o registro
    // segue legível mesmo se o nó for renomeado ou apagado depois.
    caminho: jsonb().$type<{ nodeId: string; titulo: string; kind: string }[]>(),
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
  checklistItems: many(checklistItems),
  scriptNodes: many(scriptNodes),
  scriptGroups: many(scriptGroups),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [checklistItems.campaignId], references: [campaigns.id] }),
  opcoes: many(checklistOptions),
}));

export const checklistOptionsRelations = relations(checklistOptions, ({ one }) => ({
  item: one(checklistItems, { fields: [checklistOptions.itemId], references: [checklistItems.id] }),
}));

export const scriptGroupsRelations = relations(scriptGroups, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [scriptGroups.campaignId], references: [campaigns.id] }),
  padrao: one(scriptGroups, { fields: [scriptGroups.padraoId], references: [scriptGroups.id], relationName: "padrao" }),
  opcoes: many(scriptGroupOptions),
}));

export const scriptNodesRelations = relations(scriptNodes, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [scriptNodes.campaignId], references: [campaigns.id] }),
  proximo: one(scriptGroups, { fields: [scriptNodes.proximoId], references: [scriptGroups.id] }),
  menus: many(scriptGroupOptions),
}));

export const scriptGroupOptionsRelations = relations(scriptGroupOptions, ({ one }) => ({
  group: one(scriptGroups, { fields: [scriptGroupOptions.groupId], references: [scriptGroups.id] }),
  node: one(scriptNodes, { fields: [scriptGroupOptions.nodeId], references: [scriptNodes.id] }),
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
