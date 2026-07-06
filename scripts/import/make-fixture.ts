import path from "node:path";
import ExcelJS from "exceljs";

// Gera uma planilha SINTÉTICA no formato consultas.plus (empresas ICP fake),
// só pra testar o importador end-to-end enquanto a lista real não chega.
// uso: npm run import:fixture [saida.xlsx]

const HEADERS = [
  "CNPJ", "Data Abertura", "Razão Social", "Nome Fantasia", "Email 1", "Email 2",
  "Tipo Email", "Telefone 1", "Telefone 2", "Porte", "CNAE Principal",
  "CNAE Sec. 1", "CNAE Sec. 2", "CNAE Sec. 3", "CNAE Sec. 4", "CNAE Sec. 5",
  "CNAE Sec. 6", "CNAE Sec. 7", "Natureza Jurídica", "Capital Social", "CEP",
  "UF", "Município", "Bairro", "Logradouro", "Número", "Complemento", "Quadro de Sócios",
] as const;

type Row = Partial<Record<(typeof HEADERS)[number], string>>;

const ROWS: Row[] = [
  {
    CNPJ: "11.222.333/0001-81", "Data Abertura": "12/03/2016",
    "Razão Social": "DISTRIBUIDORA DE ALIMENTOS NORTE LTDA", "Nome Fantasia": "Norte Alimentos",
    "Email 1": "contato@nortealimentos.com.br", "Email 2": "financeiro@nortealimentos.com.br",
    "Tipo Email": "INDEFINIDO", "Telefone 1": "1133224455", "Telefone 2": "11988776655",
    Porte: "DEMAIS", "CNAE Principal": "4639-7/01 - Comércio atacadista de produtos alimentícios",
    "CNAE Sec. 1": "4691-5/00 - Comércio atacadista de mercadorias em geral",
    "Natureza Jurídica": "Sociedade Empresária Limitada", "Capital Social": "500.000,00",
    CEP: "02010-100", UF: "SP", Município: "SAO PAULO", Bairro: "SANTANA",
    Logradouro: "AVENIDA CRUZEIRO DO SUL", Número: "1200",
    "Quadro de Sócios": "[JOAO DA SILVA => 49-Sócio-Administrador, MARIA SOUZA => 22-Sócio]",
  },
  {
    CNPJ: "22.333.444/0001-90", "Data Abertura": "05/08/2011",
    "Razão Social": "INDUSTRIA DE EMBALAGENS SUL S.A.", "Nome Fantasia": "EmbalaSul",
    "Email 1": "comercial@embalasul.ind.br", "Tipo Email": "COMERCIAL",
    "Telefone 1": "4732115566", Porte: "DEMAIS",
    "CNAE Principal": "2222-6/00 - Fabricação de embalagens de material plástico",
    "Natureza Jurídica": "Sociedade Anônima Fechada", "Capital Social": "1.200.000,00",
    CEP: "89010-200", UF: "SC", Município: "BLUMENAU", Bairro: "CENTRO",
    Logradouro: "RUA XV DE NOVEMBRO", Número: "800",
    "Quadro de Sócios": "[PEDRO ALVES => 49-Sócio-Administrador]",
  },
  {
    CNPJ: "33.444.555/0001-06", "Data Abertura": "20/01/2019",
    "Razão Social": "METALURGICA CENTRAL LTDA", "Nome Fantasia": "MetalCentral",
    "Email 1": "vendas@metalcentral.com.br", "Telefone 1": "3132447788",
    Porte: "DEMAIS", "CNAE Principal": "2599-3/99 - Fabricação de produtos de metal",
    "Natureza Jurídica": "Sociedade Empresária Limitada", "Capital Social": "300.000,00",
    CEP: "30110-010", UF: "MG", Município: "BELO HORIZONTE", Bairro: "FUNCIONARIOS",
    Logradouro: "AVENIDA DO CONTORNO", Número: "3500",
  },
  // duplicata do #1 (mesmo CNPJ) — testa dedup/upsert
  {
    CNPJ: "11.222.333/0001-81", "Razão Social": "DISTRIBUIDORA DE ALIMENTOS NORTE LTDA",
    "Nome Fantasia": "Norte Alimentos (atualizado)", "Telefone 1": "1133224455",
  },
  // sem CNPJ — testa skip
  { "Razão Social": "EMPRESA SEM CNPJ LTDA", "Email 1": "x@y.com" },
];

async function main() {
  const out = path.resolve(process.argv[2] ?? "data/_fixture-consultas-plus.xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contatos de Empresas");

  ws.addRow([]); // linha 1 vazia
  ws.addRow(["", "https://consultas.plus"]); // linha 2: marca d'água
  ws.addRow([...HEADERS]); // linha 3: cabeçalho
  for (const r of ROWS) ws.addRow(HEADERS.map((h) => r[h] ?? ""));

  await wb.xlsx.writeFile(out);
  console.log("fixture gerada:", out, `(${ROWS.length} linhas)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
