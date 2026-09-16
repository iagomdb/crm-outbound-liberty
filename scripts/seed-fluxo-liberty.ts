import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { campaigns, scriptGroupOptions, scriptGroups, scriptNodes } from "../src/db/schema";
import type { NodeKind } from "../src/core/script-flow";

/**
 * Semeia o FLUXO da carteira Liberty a partir do motivo.md — as aberturas,
 * o problem prop, as CTAs, o catálogo de objeções (A/B/C) e o motor Miyagi
 * (concordar → incentivar → test drive).
 *
 *   npx tsx scripts/seed-fluxo-liberty.ts <slug-da-carteira> [--force]
 *
 * Sem --force ele se recusa a rodar numa carteira que já tem fluxo — as falas
 * aqui são ponto de partida pra editar na tela, não a verdade final.
 *
 * O grafo é declarado como um mapa de passos com os filhos por CHAVE. Uma chave
 * citada por vários pais vira o MESMO nó (é o ponto do modelo): "manda no zap"
 * pendura na abertura e na CTA, e "reunião marcada" é uma só pro fluxo inteiro.
 */

type Passo = {
  titulo: string;
  kind: NodeKind;
  fala?: string;
  nota?: string;
  entrada?: boolean;
  filhos?: string[];
};

// as reações que podem vir logo depois de QUALQUER abertura
const POS_ABERTURA = ["r_sim", "r_nao", "a1", "a2", "a3", "a4", "a5", "a6"];
// o que pode aparecer depois da CTA de interesse: a real e as dispensivas que sobram
const POS_CTA = ["ok_interesse", "b1", "b2", "b3", "b4", "b5", "c1", "c2", "c3", "c4", "a1", "a3"];
// as objeções REAIS — pra onde a múltipla escolha de uma dispensiva desemboca
const OBJECOES_REAIS = ["b1", "b2", "b3", "b4", "b5", "c1", "c2", "c3", "c4"];

const FLUXO: Record<string, Passo> = {
  // ------------------------------------------------------------ aberturas
  ab_nv3: {
    titulo: "Abertura · contexto nv3 (sinal operacional)",
    kind: "fala",
    entrada: true,
    filhos: POS_ABERTURA,
    fala: `Doutor [Sobrenome]? Aqui é o Iago.

> Vi que vocês estão com uma vaga aberta pra [estagiário / secretária jurídica / auxiliar de rotina forense] — foi por isso que eu liguei.

> É ligação fria, mas não é lista comprada.

> Me dá 30 segundos pra explicar por que liguei pro senhor especificamente, e depois o senhor me diz se faz sentido continuar?`,
    nota: "Melhor camada: evidência de que a operação está apertando AGORA. Nomear a fonte, uma coisa só, observação e não elogio.",
  },
  ab_nv2: {
    titulo: "Abertura · contexto nv2 (estrutural)",
    kind: "fala",
    entrada: true,
    filhos: POS_ABERTURA,
    fala: `Doutor [Sobrenome]? Aqui é o Iago.

> Tava vendo a página da equipe no site de vocês — [o escritório cresceu pra X advogados / vocês abriram a área de Y].

> É ligação fria, mas não é lista comprada.

> Me dá 30 segundos pra explicar por que liguei pro senhor, e aí o senhor me diz se vale continuar?`,
    nota: "Passa no teste da não-transferência? Se a frase serve pro escritório seguinte da lista, não é contexto, é preenchimento.",
  },
  ab_gatilho: {
    titulo: "Abertura · gatilho",
    kind: "fala",
    entrada: true,
    filhos: POS_ABERTURA,
    fala: `Doutor [Sobrenome], o senhor não estava esperando a minha ligação.

> Vi que [gatilho: contratação, mudança de endereço, expansão de área] — posso explicar por que achei que valia te ligar?`,
    nota: "Exige gatilho claro. É a mesma lógica do contexto, com a permissão embutida na pergunta.",
  },
  ab_humor: {
    titulo: "Abertura · humor (mercado saturado)",
    kind: "fala",
    entrada: true,
    filhos: POS_ABERTURA,
    fala: `Doutor [Sobrenome], a gente não se conhece.

> Se eu falar que isso é uma ligação de vendas, o senhor joga o telefone pela janela ou me dá 30 segundos?`,
    nota: "Mais risco, mais recompensa. Humor LEVE — deboche com advogado soa desrespeito. Ainda não é o caso do mercado saturado.",
  },
  ab_untailored: {
    titulo: "Abertura · sem contexto (untailored)",
    kind: "fala",
    entrada: true,
    filhos: POS_ABERTURA,
    fala: `Doutor [Sobrenome]? Aqui é o Iago, da Liberty Solutions.

> Vou ser honesto: é ligação de prospecção. Mas eu escolhi ligar pro senhor, não é discagem aleatória.

> Me dá 30 segundos pra explicar o motivo, e depois o senhor decide se continua?`,
    nota: "Quando não achei nada ou não deu tempo. Menos eficaz — ele não sabe se vendo software ou se sou cobrança — mas melhor que nada.",
  },
  gk: {
    titulo: "Gatekeeper · chegar no sócio",
    kind: "fala",
    entrada: true,
    filhos: ["gk_passou", "gk_barrou", "a4"],
    fala: `Bom dia! Não sei se é com a senhora que eu falo —

> quem cuida da parte de organização dos processos e dos prazos aí no escritório é o Dr. [Sobrenome] mesmo?`,
    nota: "Pergunta de roteamento, não pedido de permissão. Soar como quem já devia estar falando com ele.",
  },
  gk_passou: {
    titulo: "✅ Vai transferir",
    kind: "reacao",
    filhos: ["ab_nv3", "ab_nv2", "ab_untailored"],
    nota: "Recomeça: abre com o sócio como se fosse a primeira ligação, porque pra ele é.",
  },
  gk_barrou: {
    titulo: "🚫 'Ele não está / manda e-mail'",
    kind: "reacao",
    filhos: ["gk_horario"],
  },
  gk_horario: {
    titulo: "→ Pedir o horário, não o e-mail",
    kind: "fala",
    filhos: ["s_outro_horario", "s_email"],
    fala: `Sem problema. Qual costuma ser o melhor horário pra pegar ele — começo da manhã, ou depois das 18h?`,
    nota: "E-mail genérico é buraco negro. Horário é um compromisso pequeno que ela consegue dar.",
  },

  // ------------------------------------------------------------ reação à abertura
  r_sim: {
    titulo: "✅ Deu os 30 segundos",
    kind: "reacao",
    filhos: ["pitch_cena", "pitch_tres", "pitch_gente"],
    nota: "Ele tem poder sobre o desfecho, então aceitou e vai REALMENTE escutar. Não desperdice acelerando.",
  },
  r_nao: {
    titulo: "🚫 Negou a permissão",
    kind: "reacao",
    filhos: ["nao_p1"],
  },
  nao_p1: {
    titulo: "→ Incentivo + duas razões",
    kind: "fala",
    filhos: ["nao_p2", "r_sim", "s_nao"],
    fala: `Tudo bem — só pra ninguém da minha equipe te incomodar de novo:

> eu peguei o senhor numa hora péssima, ou é que o senhor já sabe o que a gente faz e não é prioridade agora?`,
    nota: "Sem o incentivo ele não tem razão nenhuma pra responder. Duas opções, nunca três.",
  },
  nao_p2: {
    titulo: "→ Revelar o humano",
    kind: "fala",
    filhos: ["r_sim", "s_nao"],
    fala: `Agradeço a franqueza, Doutor. Vou ser sincero também: eu também não adoro fazer essas ligações.

> Mas eu pesquisei o escritório antes de discar, não é aleatório. Me dá os 30 segundos? Se não fizer sentido, o senhor me manda desligar e eu desligo.`,
    nota: "Quase ninguém sabe de verdade o que eu faço — então a resposta dele importa pouco. Desacelerar aqui.",
  },

  // ------------------------------------------------------------ problem proposition
  pitch_cena: {
    titulo: "Pitch · cena única (30MPC)",
    kind: "fala",
    filhos: ["cta_absurdo", "cta_resumo", "cta_negative"],
    fala: `O que eu escuto de sócio de escritório do tamanho do seu é sempre a mesma cena:

> cliente ligando pra saber como está o processo, e a resposta depender de alguém parar o que está fazendo e ir olhar. E quando ninguém olha, o cliente some — ou pior, escreve no Google.

> A gente faz o acompanhamento do processo avisar o cliente sozinho, pelo WhatsApp, antes de ele ligar cobrando.`,
    nota: "Aposta na PROFUNDIDADE. Use quando pesquisou bem e sabe a dor. Erra feio quando erra. Se não dá pra ver a cena de filme, não está específico o bastante.",
  },
  pitch_tres: {
    titulo: "Pitch · 2-3 problemas (cobertura)",
    kind: "fala",
    filhos: ["cta_absurdo", "cta_resumo", "cta_negative"],
    fala: `Três coisas que eu escuto direto de sócio de escritório trabalhista pequeno:

> prazo que só existe na cabeça de uma pessoa — e ela tira férias;
> cliente que liga pra perguntar do processo e ninguém sabe responder na hora;
> movimentação que aparece no Diário e demora dias pra alguém ver.

> A gente resolve os três no mesmo lugar.`,
    nota: "Aposta na COBERTURA — um dos três pega. Use com lista fria e pouco contexto. Frases curtas: nome do problema + consequência, SEM cena.",
  },
  pitch_gente: {
    titulo: "Pitch · intro 'gente como você'",
    kind: "fala",
    filhos: ["cta_absurdo", "cta_resumo", "cta_negative"],
    fala: `Quando eu converso com outros sócios de escritório trabalhista, eles me dizem que, mesmo com o escritório rodando bem, esbarram em coisas como

> o cliente ligando pra cobrar notícia do processo — e o retorno depender de alguém parar tudo e ir olhar no sistema.

> A gente faz esse aviso sair sozinho, pelo WhatsApp.`,
    nota: "É mais fácil aceitar um problema quando outros iguais o têm. Leva um carinho no ego embutido.",
  },

  // ------------------------------------------------------------ CTA de interesse
  cta_absurdo: {
    titulo: "CTA · 'seria um absurdo dar uma olhada?'",
    kind: "fala",
    filhos: POS_CTA,
    fala: `Meu palpite é que isso aí já está todo resolvido —

> mas seria um absurdo o senhor dar uma olhada em como funciona?`,
    nota: "Mini push-away + pergunta de resposta-não. Tom de ombros encolhidos: não pode soar como agendamento de reunião importante.",
  },
  cta_resumo: {
    titulo: "CTA · 'faria mal eu te mandar um resumo?'",
    kind: "fala",
    filhos: POS_CTA,
    fala: `O senhor provavelmente não vai trocar nada agora.

> Faria mal eu te mostrar em 15 minutos como isso funciona, só pra o senhor saber que existe?`,
    nota: "Pedido pequeno → primeiro sim → avança um passo por vez. Validar INTERESSE antes de qualquer outra coisa.",
  },
  cta_negative: {
    titulo: "CTA · negative frame",
    kind: "fala",
    filhos: POS_CTA,
    fala: `Mas Doutor, o senhor pode me dizer que aí isso já está todo resolvido, e eu te deixo tocar o dia.`,
    nota: "Push-away mais afiado: em vez de tirar pressão, convida o cara a discordar. Quem discorda, engaja.",
  },
  ok_interesse: {
    titulo: "✅ Demonstrou interesse",
    kind: "reacao",
    filhos: ["fechar"],
  },
  fechar: {
    titulo: "→ Fechar a reunião",
    kind: "fala",
    filhos: ["s_reuniao", "s_email"],
    fala: `Perfeito. São 15 minutos, eu te mostro na tela e o senhor decide.

> Prefere começo da semana ou fim?`,
    nota: "Só AQUI a CTA tradicional entra — depois do interesse validado, ela não pesa mais.",
  },

  // ------------------------------------------------------------ A · dispensivas
  a1: {
    titulo: 'A1 · "Não tenho interesse"',
    kind: "reacao",
    filhos: ["a1_miyagi"],
    nota: "A mais comum e a mais falsa. Ele não avaliou nada — está irritado e quer justificar o desligamento.",
  },
  a1_miyagi: {
    titulo: "→ Concordar forte + múltipla escolha (3)",
    kind: "fala",
    filhos: [...OBJECOES_REAIS, "s_odeia"],
    fala: `Culpa minha, Doutor. Ou eu me expliquei muito mal, ou o senhor já teria procurado alguém se isso incomodasse.

> Só pra eu não incomodar de novo — posso te pedir uma honestidade brutal?

> É que o senhor já tem um jeito que dá conta, é que nunca parou pra pensar nisso, ou é que o senhor odeia ligação de vendas? **E tá tudo bem se for a terceira.**`,
    nota: "Test drive AINDA NÃO. Dispensiva não é objeção, é reflexo: espera a real aparecer e roda Miyagi por cima dela. Aqui vale três opções — a terceira é proposital.",
  },
  a2: {
    titulo: 'A2 · "Estou em reunião / audiência"',
    kind: "reacao",
    filhos: ["a2_real", "a2_dispensa"],
    nota: "Com advogado isso é FREQUENTEMENTE verdade. Quem está mesmo em audiência não atende; quem atende tranquilo está entre uma coisa e outra.",
  },
  a2_real: {
    titulo: "→ Soou real: sair rápido e sair bem",
    kind: "fala",
    filhos: ["s_outro_horario"],
    fala: `Falha minha, Doutor. Prefere que eu ligue amanhã de manhã ou depois das 18h?`,
    nota: "Duas opções, sem pitch, sem insistência. Isso constrói mais crédito do que a ligação inteira. NUNCA a piada do viva-voz.",
  },
  a2_dispensa: {
    titulo: "→ Soou dispensa: blunt leve",
    kind: "fala",
    filhos: ["r_sim", "a1", "s_nao"],
    fala: `Imaginei que eu ia atrapalhar alguma coisa mesmo.

> São 20 segundos e eu te devolvo pra reunião — vale a pena?`,
    nota: "Atendeu tranquilo, silêncio de fundo.",
  },
  a3: {
    titulo: 'A3 · "Manda no zap / me manda material"',
    kind: "reacao",
    filhos: ["a3_miyagi"],
    nota: "A versão brasileira do 'send me some information'. Educação disfarçada de interesse.",
  },
  a3_miyagi: {
    titulo: "→ Concordar + múltipla escolha",
    kind: "fala",
    filhos: ["a3_blunt", "ok_interesse"],
    fala: `Claro, também ia querer ver com calma antes.

> Só pra eu não te mandar um monte de coisa inútil — tem alguma dúvida específica, ou é mais pra dar uma olhada geral?`,
    nota: "'Uma olhada geral' = não tenho interesse. Ironia útil: ele está pedindo pelo WhatsApp, que é exatamente o que o Liberty organiza.",
  },
  a3_blunt: {
    titulo: "→ Blunt: material genérico não diz nada",
    kind: "fala",
    filhos: ["ok_interesse", "a3_bandeira"],
    fala: `Doutor, vou ser honesto: material genérico não vai te dizer nada.

> Em 15 minutos o senhor sabe se serve ou não — e se não servir, eu te devolvo os 15.`,
  },
  a3_bandeira: {
    titulo: "→ Bandeira branca + pergunta chata",
    kind: "fala",
    filhos: ["a3_dardo", "s_nao"],
    fala: `Tudo bem, me rendo. Antes de desligar, posso te fazer uma pergunta chata?

> Quando me pedem material, normalmente é educação demais pra me mandar embora. É isso?`,
  },
  a3_dardo: {
    titulo: "→ O dardo",
    kind: "fala",
    filhos: ["s_reuniao", "s_email"],
    fala: `Então combinamos assim: eu mando, aponto exatamente o que serve pra um escritório do tamanho do seu, e deixo um horário reservado na semana que vem.

> Se não gostar, é só recusar. Justo?`,
    nota: "Só depois que ele NEGA a pergunta chata.",
  },
  a4: {
    titulo: 'A4 · "Não é comigo / fala com meu sócio"',
    kind: "reacao",
    filhos: ["a4_nome"],
    nota: "Em escritório de 2 a 5 pessoas quase nunca é verdade. Ou é desvio, ou o outro sócio cuida mesmo do administrativo.",
  },
  a4_nome: {
    titulo: "→ Soltar o nome",
    kind: "fala",
    filhos: ["a4_indicacao", "a1", ...OBJECOES_REAIS],
    fala: `Ah, achei que fosse com o senhor — normalmente isso fica com quem toca a rotina ou com quem cuida da parte administrativa.

> Era com o Dr. [Sócio]?`,
    nota: "Se estava desviando, a objeção REAL aparece agora (ele não quer que eu ligue pro sócio).",
  },
  a4_indicacao: {
    titulo: "→ Pedir permissão pra citar o nome",
    kind: "fala",
    filhos: ["s_indicacao"],
    fala: `Eu ia falar com ele de qualquer forma. Posso mencionar que conversei com o senhor antes?`,
    nota: "Se for verdade, o objetivo MUDA: indicação, não test drive. Estranho não consegue que apresentem ele. É a fonte de indicação mais barata do ICP.",
  },
  a5: {
    titulo: 'A5 · "Onde conseguiu meu número?"',
    kind: "reacao",
    filhos: ["a5_transparencia"],
  },
  a5_transparencia: {
    titulo: "→ Transparência total",
    kind: "fala",
    filhos: ["a1", "r_sim", ...OBJECOES_REAIS],
    fala: `No site de vocês mesmo, Doutor — tá na página de contato. Se quiser, eu te mando o print de onde eu achei.`,
    nota: "Fácil, porque a resposta é honrosa: está público. Depois disso, puxar a objeção real.",
  },
  a6: {
    titulo: 'A6 · "Isso é ligação de vendas?"',
    kind: "reacao",
    filhos: ["a6_resposta"],
    nota: "Praticamente pré-resolvida — eu já assumo isso na abertura. Se apareceu, é sinal de que atropelei a abertura.",
  },
  a6_resposta: {
    titulo: "→ Assumir com humor",
    kind: "fala",
    filhos: ["r_sim", "a1"],
    fala: `É sim — e peço desculpa porque tá indo mal pra caramba até agora.`,
  },

  // ------------------------------------------------------------ B · situacionais
  b1: { titulo: 'B1 · "Tá caro / não cabe"', kind: "reacao", filhos: ["b1_miyagi"] },
  b1_miyagi: {
    titulo: "→ Concordar + incentivar",
    kind: "fala",
    filhos: ["b1_td"],
    fala: `Faz sentido. Escritório desse tamanho, cada custo fixo novo pesa.

> Só pra eu entender: é o valor em si, ou é que ainda não deu pra ver se isso se paga?`,
  },
  b1_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_nao"],
    fala: `O senhor provavelmente não vai assinar nada hoje.

> Mas topa ver o número na tela, nem que seja pra ter uma régua quando for comparar com outro?`,
  },
  b2: { titulo: 'B2 · "Não tenho caixa agora"', kind: "reacao", filhos: ["b2_miyagi"], nota: "Real no ICP — honorário de êxito demora, o caixa é irregular." },
  b2_miyagi: {
    titulo: "→ Concordar + incentivar",
    kind: "fala",
    filhos: ["b2_td"],
    fala: `Entendo. Tá difícil manter o que já tem, imagina somar coisa nova.

> É aperto deste mês, ou é que qualquer gasto novo aí exige uma discussão grande?`,
  },
  b2_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_followup", "s_nao"],
    fala: `Quando o caixa abrir, quem já olhou pelo menos sabe o que quer.

> Seria um absurdo eu te mostrar agora, só pra ficar no radar?`,
  },
  b3: {
    titulo: 'B3 · "Não tenho tempo nem pra isso"',
    kind: "reacao",
    filhos: ["b3_miyagi"],
    nota: "Provavelmente a objeção nº 1 do ICP. E a mais irônica: é exatamente o problema que eu resolvo.",
  },
  b3_miyagi: {
    titulo: "→ Concordar + incentivar",
    kind: "fala",
    filhos: ["b3_td"],
    fala: `Essa eu escuto direto. E é meio cruel, né — a ferramenta que economiza tempo exige tempo pra entrar.

> É o tempo de aprender a usar, ou é o tempo de jogar os processos pra dentro?`,
  },
  b3_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_nao"],
    fala: `Justamente por isso eu queria te mostrar em 15 minutos, não em uma hora.

> Se der mais trabalho do que resolve, eu mesmo te falo.`,
  },
  b4: { titulo: 'B4 · "Vou contratar alguém primeiro"', kind: "reacao", filhos: ["b4_miyagi"], nota: "Secretária, estagiário, auxiliar — o substituto natural do software neste mercado." },
  b4_miyagi: {
    titulo: "→ Concordar + incentivar",
    kind: "fala",
    filhos: ["b4_td"],
    fala: `Faz sentido — mão extra resolve muita coisa.

> É pra tirar o atendimento do senhor, ou é pra dar conta dos prazos?`,
  },
  b4_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_nao"],
    fala: `Não vou tentar te convencer a trocar pessoa por sistema.

> Mas topa olhar antes de contratar, nem que seja pra saber o que dá pra não jogar no colo dessa pessoa?`,
  },
  b5: { titulo: 'B5 · "Escritório pequeno demais"', kind: "reacao", filhos: ["b5_miyagi"], nota: "Product fit. Às vezes é verdade — critério de desqualificação." },
  b5_miyagi: {
    titulo: "→ Concordar + medir o volume",
    kind: "fala",
    filhos: ["b5_desqualifica", "b1_td"],
    fala: `Pode ser mesmo, Doutor. Nem todo escritório precisa disso.

> Hoje o senhor toca quantos processos, mais ou menos?`,
  },
  b5_desqualifica: {
    titulo: "→ Desqualificar e pedir indicação",
    kind: "fala",
    filhos: ["s_desqualificado", "s_indicacao"],
    fala: `Sinceramente, nesse tamanho o senhor se vira melhor sem sistema.

> Conhece algum colega que tá com volume maior?`,
    nota: "Desqualificar sem dó. Encerrar rápido e sem culpa é parte do método.",
  },

  // ------------------------------------------------------------ C · solução existente
  c1: {
    titulo: 'C1 · "A gente já se organiza aqui"',
    kind: "reacao",
    filhos: ["c1_miyagi"],
    nota: "Planilha, caderno, grupo de WhatsApp, a secretária que olha o Diário. O concorrente mais forte que eu tenho — funciona até certo volume.",
  },
  c1_miyagi: {
    titulo: "→ Concordar + incentivar",
    kind: "fala",
    filhos: ["c1_td"],
    fala: `E funciona, viu. Quase todo escritório que eu falo começou assim e levou longe.

> Só por curiosidade: hoje quem vê a movimentação é o senhor mesmo, ou tem alguém que acompanha?`,
  },
  c1_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_nao"],
    fala: `O senhor não vai trocar isso tão cedo.

> Mas topa dar uma olhada, nem que seja pra roubar alguma ideia e melhorar o que já faz aí?`,
  },
  c2: { titulo: "C2 · Já usa concorrente (nomeado)", kind: "reacao", filhos: ["c2_miyagi"], nota: "Astrea, ADVBOX, Projuris, SAJ, Legal One." },
  c2_miyagi: {
    titulo: "→ Concordar sem atacar + incentivar",
    kind: "fala",
    filhos: ["c2_td"],
    fala: `Ferramenta boa, sem ironia. Raramente compensa trocar de sistema no meio do caminho.

> Só pra eu saber onde não insistir: o que o senhor usa lá é mais a parte de prazo e processo, ou o financeiro também?`,
  },
  c2_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_nao"],
    fala: `Alguns escritórios vieram pra cá por causa de [ponto real de diferença].

> Seria um absurdo o senhor dar uma olhada só pra saber o que tá deixando na mesa?`,
    nota: "⚠️ Preencher [ponto real de diferença] com VERDADE. Se não tiver, não inventar. O diferencial estrutural é o WhatsApp.",
  },
  c3: { titulo: 'C3 · "Já uso um sistema" (sem dizer qual)', kind: "reacao", filhos: ["c3_qual"] },
  c3_qual: {
    titulo: "→ Descobrir qual",
    kind: "fala",
    filhos: ["c2"],
    fala: `Qual, se puder falar? Pergunto porque as dores são bem diferentes dependendo de qual é.`,
    nota: "Incentivar PRIMEIRO. Descobre e cai em C2 — é literalmente o mesmo passo reusado.",
  },
  c4: { titulo: 'C4 · "Tô preso em contrato / paguei o ano"', kind: "reacao", filhos: ["c4_miyagi"] },
  c4_miyagi: {
    titulo: "→ Concordar + descobrir o vencimento",
    kind: "fala",
    filhos: ["c4_td"],
    fala: `Então não faz sentido nenhum mexer agora.

> Vence quando?`,
    nota: "Anotar a data no CRM — é o follow-up mais fácil que existe.",
  },
  c4_td: {
    titulo: "→ Test drive",
    kind: "fala",
    filhos: ["s_reuniao", "s_followup"],
    fala: `Não vou te ligar de novo antes disso.

> Mas topa olhar agora, com calma, pra chegar na renovação sabendo o que existe — em vez de decidir com prazo em cima?`,
  },

  // ------------------------------------------------------------ saídas
  s_reuniao: { titulo: "✅ Reunião marcada", kind: "saida", nota: "Objetivo #1. Registre com data — vira reunião na agenda automaticamente." },
  s_email: { titulo: "✅ E-mail nominal", kind: "saida", nota: "Objetivo #2. Nominal, nunca financeiro@ ou contato@ — genérico é buraco negro." },
  s_followup: { titulo: "📅 Follow-up com data", kind: "saida", nota: "Ele deu a data (renovação, caixa). Pretexto NOVO já nasce pronto: a própria data." },
  s_indicacao: { titulo: "🔁 Indicação — o outro sócio", kind: "saida", nota: "Criar o contato novo e abrir pelo nome de quem falou." },
  s_outro_horario: { titulo: "👋 Saiu bem — retorno agendado", kind: "saida", nota: "Não atendeu ao pitch, mas o crédito subiu. Agende e não queime." },
  s_desqualificado: { titulo: "🙅 Desqualificado (fora do ICP)", kind: "saida", nota: "Encerrar rápido, sem culpa. Melhor que arrastar." },
  s_odeia: { titulo: "😤 Odeia ligação de vendas", kind: "saida", nota: "A terceira opção do A1. Agradecer e sair — é informação honesta, vale mais que insistência." },
  s_nao: { titulo: "❌ Não rolou", kind: "saida", nota: "Anote a objeção LITERAL, com as palavras dele. Em 50 ligações você tem sua própria distribuição." },
};

const LARGURA = 360;
const ALTURA = 240;

function nomeDoMenu(titulos: string[]): string {
  const primeiro = (titulos[0] ?? "Menu").replace(/\s+/g, " ").trim();
  const curto = primeiro.length > 30 ? `${primeiro.slice(0, 29)}…` : primeiro;
  return titulos.length > 1 ? `${curto} +${titulos.length - 1}` : curto;
}

async function main() {
  const [slug, ...flags] = process.argv.slice(2);
  const force = flags.includes("--force");
  if (!slug) {
    console.error("uso: npx tsx scripts/seed-fluxo-liberty.ts <slug-da-carteira> [--force]");
    process.exit(1);
  }

  const db = getDb();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
  if (!campaign) {
    console.error(`carteira "${slug}" não encontrada`);
    process.exit(1);
  }

  const jaTem = await db.select({ id: scriptGroups.id }).from(scriptGroups).where(eq(scriptGroups.campaignId, campaign.id));
  if (jaTem.length && !force) {
    console.error(`"${campaign.name}" já tem ${jaTem.length} menus no fluxo. Use --force pra apagar e recriar.`);
    process.exit(1);
  }
  if (jaTem.length) {
    await db.delete(scriptGroups).where(eq(scriptGroups.campaignId, campaign.id));
    await db.delete(scriptNodes).where(eq(scriptNodes.campaignId, campaign.id));
    console.log(`fluxo anterior apagado (${jaTem.length} menus)`);
  }

  // valida antes de tocar no banco: filho citado que não existe é erro de digitação
  for (const [chave, passo] of Object.entries(FLUXO)) {
    for (const filho of passo.filhos ?? []) {
      if (!FLUXO[filho]) throw new Error(`"${chave}" aponta pro passo inexistente "${filho}"`);
    }
  }

  // 1) cada passo do playbook vira uma OPÇÃO
  const ids = new Map<string, string>();
  for (const [chave, passo] of Object.entries(FLUXO)) {
    const [row] = await db
      .insert(scriptNodes)
      .values({
        campaignId: campaign.id,
        kind: passo.kind,
        titulo: passo.titulo,
        fala: passo.fala ?? null,
        nota: passo.nota ?? null,
      })
      .returning({ id: scriptNodes.id });
    ids.set(chave, row.id);
  }

  // 2) conjunto de filhos idêntico ⇒ MESMO menu. É o que faz 6 aberturas
  //    dividirem um menu de reações em vez de 48 ligações soltas.
  const menuPorChave = new Map<string, string>();
  const criarMenu = async (chaves: string[], entrada: boolean, nomeFixo?: string) => {
    const k = (entrada ? "ENTRADA:" : "") + chaves.join(",");
    const existente = menuPorChave.get(k);
    if (existente) return existente;
    const [menu] = await db
      .insert(scriptGroups)
      .values({
        campaignId: campaign.id,
        nome: nomeFixo ?? nomeDoMenu(chaves.map((c) => FLUXO[c].titulo)),
        entrada,
      })
      .returning({ id: scriptGroups.id });
    await db
      .insert(scriptGroupOptions)
      .values(chaves.map((c, ordem) => ({ groupId: menu.id, nodeId: ids.get(c)!, ordem })));
    menuPorChave.set(k, menu.id);
    return menu.id;
  };

  const aberturas = Object.entries(FLUXO).filter(([, p]) => p.entrada).map(([c]) => c);
  const entradaId = await criarMenu(aberturas, true, "Abertura");

  // 3) o destino de cada opção é o menu do conjunto de filhos DELA
  const menuDosFilhos = new Map<string, string>();
  for (const [chave, passo] of Object.entries(FLUXO)) {
    if (!passo.filhos?.length) continue;
    menuDosFilhos.set(chave, await criarMenu(passo.filhos, false));
  }

  // 4) onde todas as opções do menu levam pro mesmo lugar, isso é PADRÃO do
  //    menu — e aí a próxima variação que você escrever não custa ligação
  let padroes = 0;
  const padraoDoMenu = new Map<string, string>();
  for (const [k, menuId] of menuPorChave) {
    const chaves = k.replace(/^ENTRADA:/, "").split(",").filter(Boolean);
    const alvos = chaves.map((c) => menuDosFilhos.get(c) ?? null);
    if (chaves.length < 2 || !alvos[0] || !alvos.every((a) => a === alvos[0])) continue;
    await db.update(scriptGroups).set({ padraoId: alvos[0] }).where(eq(scriptGroups.id, menuId));
    padraoDoMenu.set(menuId, alvos[0]);
    padroes++;
  }

  // 5) destino por opção só onde ela FOGE do padrão de todos os menus em que está
  const menusDaChave = new Map<string, string[]>();
  for (const [k, menuId] of menuPorChave) {
    for (const c of k.replace(/^ENTRADA:/, "").split(",").filter(Boolean)) {
      menusDaChave.set(c, [...(menusDaChave.get(c) ?? []), menuId]);
    }
  }
  let excecoes = 0;
  for (const [chave, alvo] of menuDosFilhos) {
    const onde = menusDaChave.get(chave) ?? [];
    if (onde.length > 0 && onde.every((m) => padraoDoMenu.get(m) === alvo)) continue;
    await db.update(scriptNodes).set({ proximoId: alvo }).where(eq(scriptNodes.id, ids.get(chave)!));
    excecoes++;
  }

  await posicionar(db, campaign.id, entradaId);

  console.log(
    `✓ fluxo semeado em "${campaign.name}": ${ids.size} opções · ${menuPorChave.size} menus · ` +
      `${padroes} com destino padrão · ${excecoes} destinos de exceção`,
  );
  console.log(`  edite em /campaigns/${slug}/fluxo`);
}

/** Layout inicial do canvas: colunas por distância do menu de entrada. */
async function posicionar(db: ReturnType<typeof getDb>, campaignId: string, entradaId: string) {
  const menus = await db.select().from(scriptGroups).where(eq(scriptGroups.campaignId, campaignId));
  const vinculos = await db.select().from(scriptGroupOptions);
  const nos = await db.select().from(scriptNodes).where(eq(scriptNodes.campaignId, campaignId));
  const proximoDa = new Map(nos.map((n) => [n.id, n.proximoId]));
  const doMenu = new Map<string, string[]>();
  for (const v of vinculos) doMenu.set(v.groupId, [...(doMenu.get(v.groupId) ?? []), v.nodeId]);

  const saidas = (menuId: string) => {
    const m = menus.find((x) => x.id === menuId);
    const alvos = (doMenu.get(menuId) ?? []).map((n) => proximoDa.get(n) ?? m?.padraoId ?? null);
    return [...new Set(alvos.filter((a): a is string => Boolean(a)))];
  };

  const nivel = new Map<string, number>([[entradaId, 0]]);
  const fila = [entradaId];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const alvo of saidas(atual)) {
      if (nivel.has(alvo)) continue;
      nivel.set(alvo, (nivel.get(atual) ?? 0) + 1);
      fila.push(alvo);
    }
  }
  const maior = Math.max(0, ...nivel.values());
  for (const m of menus) if (!nivel.has(m.id)) nivel.set(m.id, maior + 1);

  const usados = new Map<number, number>();
  for (const m of menus) {
    const n = nivel.get(m.id) ?? 0;
    const linha = usados.get(n) ?? 0;
    usados.set(n, linha + 1);
    await db.update(scriptGroups).set({ posX: n * LARGURA, posY: linha * ALTURA }).where(eq(scriptGroups.id, m.id));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
