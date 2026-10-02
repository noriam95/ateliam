import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = process.cwd();
const skillDir = process.env.SKILL_DIR;
const runtimePython = process.env.RUNTIME_PYTHON;
if (!skillDir || !runtimePython) throw new Error("SKILL_DIR e RUNTIME_PYTHON são obrigatórios");

const buildDir = path.join(workspaceDir, ".codex-finalizer", "bf-flow-presentation");
const finalPath = path.join(
  workspaceDir,
  "docs",
  "apresentacoes",
  "BF_Flow_Apresentacao_Executiva.pptx",
);
const assetDir = path.join(workspaceDir, "docs", "apresentacoes", "assets");
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const FONT = "Segoe UI";
const W = 1280;
const H = 720;
const C = {
  ink: "#14252B",
  green: "#0A5B4E",
  teal: "#0E8073",
  blue: "#2D6EA6",
  gold: "#D69118",
  goldSoft: "#FFF3DA",
  paper: "#F5F7F6",
  white: "#FFFFFF",
  gray: "#637177",
  line: "#D7DEDC",
  red: "#B64C57",
};

const deck = Presentation.create({ slideSize: { width: W, height: H } });

function rect(slide, x, y, w, h, fill, radius = false, line = "none", width = 0) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill: fill === "none" ? "none" : { type: "solid", color: fill },
    line: line === "none" ? { fill: "none", width: 0 } : { fill: line, width },
  });
}

function line(slide, x, y, w, h, color = C.line, width = 2) {
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: color, width },
  });
}

function text(slide, value, x, y, w, h, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    typeface: FONT,
    fontSize: options.size ?? 24,
    bold: options.bold ?? false,
    color: options.color ?? C.ink,
    autoFit: options.autoFit ?? "shrinkText",
    italic: options.italic ?? false,
  };
  shape.text.alignment = options.align ?? "left";
  shape.text.verticalAlignment = options.valign ?? "top";
  return shape;
}

function page(slide, number, title, subtitle) {
  slide.background.fill = C.paper;
  text(slide, "BF FLOW", 54, 28, 180, 24, { size: 15, bold: true, color: C.teal });
  text(slide, String(number).padStart(2, "0"), 1180, 30, 46, 22, {
    size: 14,
    bold: true,
    color: C.gray,
    align: "right",
  });
  text(slide, title, 54, 70, 1140, 58, { size: 42, bold: true });
  if (subtitle) text(slide, subtitle, 56, 126, 1110, 40, { size: 20, color: C.gray });
  line(slide, 54, 166, 1172, 0, C.gold, 3);
}

function note(slide, source, presenter = "") {
  const notes = [presenter, `Fontes: ${source}`].filter(Boolean).join("\n\n");
  slide.speakerNotes.textFrame.setText(notes);
}

async function image(slide, filename, x, y, w, h, alt, fit = "contain", crop) {
  const bytes = await fs.readFile(path.join(assetDir, filename));
  rect(slide, x - 5, y - 5, w + 10, h + 10, C.white, true, C.line, 1);
  return slide.images.add({
    blob: new Uint8Array(bytes),
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
    ...(crop ? { crop } : {}),
    geometry: "roundRect",
    borderRadius: 8,
  });
}

function label(slide, value, x, y, w, color = C.green) {
  text(slide, value.toUpperCase(), x, y, w, 26, { size: 14, bold: true, color });
}

function numberedStep(slide, number, titleValue, detail, x, y, w) {
  rect(slide, x, y, 42, 42, C.green, true);
  text(slide, String(number), x, y, 42, 42, {
    size: 20,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
  });
  text(slide, titleValue, x + 56, y - 2, w - 56, 34, { size: 23, bold: true });
  text(slide, detail, x + 56, y + 34, w - 56, 66, { size: 18, color: C.gray });
}

// 1 — Capa
{
  const slide = deck.slides.add();
  slide.background.fill = C.ink;
  rect(slide, 0, 0, 18, H, C.gold);
  text(slide, "BF FLOW", 76, 72, 240, 34, { size: 20, bold: true, color: C.gold });
  text(slide, "Gestão integrada de\nprocessos e execução", 74, 150, 760, 170, {
    size: 58,
    bold: true,
    color: C.white,
  });
  text(
    slide,
    "Conceito da ferramenta, aplicações práticas e ganhos para a organização",
    78,
    350,
    650,
    70,
    { size: 25, color: "#DCE7E4" },
  );
  line(slide, 78, 465, 470, 0, C.gold, 4);
  text(slide, "Apresentação executiva", 78, 492, 420, 35, { size: 19, color: "#AFC2BD" });
  const logo = new Uint8Array(
    await fs.readFile(path.join(workspaceDir, "public", "brand", "bom-futuro-dark.png")),
  );
  slide.images.add({
    blob: logo,
    contentType: "image/png",
    alt: "Bom Futuro",
    fit: "contain",
    position: { left: 846, top: 184, width: 340, height: 190 },
  });
  text(slide, "02 OUT 2026", 1015, 652, 170, 24, {
    size: 14,
    bold: true,
    color: "#AFC2BD",
    align: "right",
  });
  note(slide, "README.md e identidade visual do BF Flow.");
}

// 2 — Problema resolvido
{
  const slide = deck.slides.add();
  page(slide, 2, "O problema que o BF Flow resolve", "Uma fonte comum para entender, executar e melhorar o trabalho");
  label(slide, "Para a empresa", 62, 200, 320, C.gold);
  text(
    slide,
    "Processos, documentos e responsabilidades ficam dispersos em planilhas, arquivos e conhecimento informal.",
    62,
    236,
    455,
    94,
    { size: 25, bold: true },
  );
  text(
    slide,
    "A liderança perde visibilidade sobre cobertura, pendências, versões válidas e oportunidades de melhoria.",
    62,
    350,
    455,
    92,
    { size: 20, color: C.gray },
  );
  line(slide, 542, 210, 0, 360, C.line, 2);
  label(slide, "Para a área de processos", 582, 200, 420, C.teal);
  text(
    slide,
    "Mapear, desenhar, documentar e acompanhar mudanças exige ferramentas desconectadas e controles manuais.",
    582,
    236,
    590,
    94,
    { size: 25, bold: true },
  );
  text(
    slide,
    "A equipe gasta tempo conciliando versões e cobrando atualizações, com dificuldade para demonstrar alcance e resultados.",
    582,
    350,
    590,
    92,
    { size: 20, color: C.gray },
  );
  rect(slide, 62, 490, 1110, 130, C.green, true);
  text(slide, "Como o BF Flow responde", 88, 512, 250, 30, {
    size: 18,
    bold: true,
    color: C.goldSoft,
  });
  text(
    slide,
    "Conecta arquitetura de processos, BPMN, documentação, tarefas, melhorias e indicadores no mesmo ambiente, com histórico e responsabilidades definidos.",
    88,
    550,
    1040,
    50,
    { size: 24, bold: true, color: C.white },
  );
  note(slide, "README.md; DESIGN.md.", "Mensagem central: o produto reduz fragmentação e controles paralelos.");
}

// 3 — Conceito da plataforma
{
  const slide = deck.slides.add();
  page(slide, 3, "O conceito da plataforma", "O processo funciona como eixo entre estratégia, padrão e execução");
  rect(slide, 470, 280, 340, 150, C.green, true);
  text(slide, "PROCESSO", 500, 304, 280, 48, {
    size: 35,
    bold: true,
    color: C.white,
    align: "center",
  });
  text(slide, "estrutura comum de gestão", 505, 360, 270, 30, {
    size: 17,
    color: "#DCE7E4",
    align: "center",
  });
  const nodes = [
    ["Cadeia de valor", "organiza a arquitetura", 80, 214, C.gold],
    ["Mapeamento", "registra o processo", 80, 410, C.teal],
    ["BPMN", "explicita o fluxo", 940, 214, C.blue],
    ["Documentação", "define o padrão", 940, 410, C.gold],
    ["Tarefas", "leva à execução", 340, 530, C.teal],
    ["Melhorias", "fecha o ciclo", 710, 530, C.blue],
  ];
  for (const [titleValue, detail, x, y, color] of nodes) {
    rect(slide, x, y, 260, 96, C.white, true, color, 2);
    text(slide, titleValue, x + 18, y + 16, 224, 32, { size: 22, bold: true, color });
    text(slide, detail, x + 18, y + 52, 224, 25, { size: 16, color: C.gray });
  }
  line(slide, 340, 262, 130, 58, C.line, 2);
  line(slide, 340, 458, 130, -55, C.line, 2);
  line(slide, 810, 320, 130, -58, C.line, 2);
  line(slide, 810, 402, 130, 56, C.line, 2);
  line(slide, 530, 430, -60, 100, C.line, 2);
  line(slide, 750, 430, 90, 100, C.line, 2);
  note(slide, "README.md, seção Domínios funcionais.");
}

// 4 — Home
{
  const slide = deck.slides.add();
  page(slide, 4, "A rotina começa pela responsabilidade de cada pessoa", "A Home resume trabalho aberto, agenda e entregas concluídas");
  text(slide, "Visão pessoal", 62, 210, 360, 40, { size: 28, bold: true, color: C.green });
  text(slide, "• tarefas abertas por módulo\n• agenda mensal com reuniões\n• vencimentos e análises pendentes\n• evolução das conclusões", 64, 270, 390, 205, {
    size: 22,
    color: C.ink,
  });
  rect(slide, 62, 515, 390, 88, C.goldSoft, true);
  text(slide, "Ganho", 82, 534, 90, 25, { size: 16, bold: true, color: C.gold });
  text(slide, "Prioridades claras sem consolidar planilhas.", 82, 565, 338, 30, {
    size: 19,
    bold: true,
  });
  await image(slide, "home.png", 500, 205, 720, 385, "Tela Home do BF Flow", "contain");
  note(slide, "captura da Home preparada a partir da interface do BF Flow; DESIGN.md, seção Home.");
}

// 5 — Jornada do processo
{
  const slide = deck.slides.add();
  page(slide, 5, "Da identificação do processo ao padrão vigente", "O BF Flow preserva o vínculo entre diagnóstico, desenho e documento");
  numberedStep(slide, 1, "Cadastrar", "Processo, área, responsável e relacionamento na cadeia.", 62, 210, 500);
  numberedStep(slide, 2, "Mapear", "Escopo, entradas, saídas, regras, riscos e informações do processo.", 62, 330, 500);
  numberedStep(slide, 3, "Desenhar", "Fluxo BPMN com atividades, eventos, gateways e raias.", 62, 450, 500);
  numberedStep(slide, 4, "Documentar", "POP, fluxograma e versões com código organizacional.", 670, 210, 500);
  numberedStep(slide, 5, "Aprovar e manter", "Revisão, histórico, tarefas e atualização do padrão vigente.", 670, 330, 500);
  rect(slide, 670, 475, 500, 116, C.green, true);
  text(slide, "Inclusão assistida", 696, 496, 220, 28, { size: 20, bold: true, color: C.goldSoft });
  text(
    slide,
    "O módulo de mapeamento pode iniciar pelo assistente, inclusive com importação estruturada.",
    696,
    535,
    440,
    45,
    { size: 19, color: C.white },
  );
  note(slide, "README.md; DESIGN.md, seções Mapeamento, Documentação e consultas.");
}

// 6 — BPMN
{
  const slide = deck.slides.add();
  page(slide, 6, "Modelagem BPMN dentro do mesmo ambiente", "O desenho permanece editável, versionado e relacionado ao processo");
  text(slide, "O editor permite", 62, 205, 390, 34, { size: 27, bold: true, color: C.green });
  text(
    slide,
    "• criar e importar BPMN 2.0\n• trabalhar com pools e raias\n• inserir imagens e formatar textos\n• validar o desenho\n• salvar rascunhos e versões\n• exportar BPMN e PNG",
    64,
    255,
    400,
    265,
    { size: 21 },
  );
  await image(slide, "editor-bpmn.png", 505, 205, 710, 350, "Editor BPMN do BF Flow", "cover", {
    left: 0,
    top: 0.04,
    right: 0,
    bottom: 0.08,
  });
  await image(slide, "barra-editor-bpmn.png", 505, 580, 710, 76, "Barra de ferramentas BPMN", "contain");
  note(slide, "telas fornecidas pelo usuário; README.md; DESIGN.md, seção Editor BPMN compacto.");
}

// 7 — Biblioteca e documentos
{
  const slide = deck.slides.add();
  page(slide, 7, "Biblioteca, versionamento e consulta", "O padrão documental fica localizável por código, área, versão e data");
  await image(slide, "biblioteca-bpmn.png", 62, 205, 685, 325, "Biblioteca de desenhos BPMN", "cover", {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0.02,
  });
  label(slide, "Identificação consistente", 800, 215, 360, C.gold);
  text(slide, "POP.ADM.001", 800, 252, 380, 58, { size: 36, bold: true, color: C.green });
  text(
    slide,
    "Códigos isolados por organização, tipo e área evitam nomes ambíguos e facilitam referência em tarefas e entregas.",
    800,
    330,
    380,
    120,
    { size: 21, color: C.gray },
  );
  line(slide, 800, 475, 365, 0, C.line, 2);
  text(slide, "Pesquisa global", 800, 498, 180, 26, { size: 19, bold: true });
  text(slide, "Localiza termos em todas as colunas visíveis.", 800, 532, 360, 50, {
    size: 18,
    color: C.gray,
  });
  text(slide, "Histórico preservado", 800, 596, 220, 26, { size: 19, bold: true });
  text(slide, "Rascunhos, versões e exclusão lógica mantêm a rastreabilidade.", 800, 630, 360, 50, {
    size: 18,
    color: C.gray,
  });
  note(slide, "tela fornecida pelo usuário; README.md, seções Persistência e versionamento e Domínios funcionais.");
}

// 8 — Tarefas
{
  const slide = deck.slides.add();
  page(slide, 8, "Execução e colaboração ligadas ao processo", "Solicitações, revisões e entregas mantêm contexto e histórico");
  const stages = [
    ["1", "Solicitar", "demanda e responsável"],
    ["2", "Executar", "checklist e anexos"],
    ["3", "Revisar", "análise e ajustes"],
    ["4", "Concluir", "entrega e registro"],
  ];
  stages.forEach(([n, t, d], i) => {
    const x = 62 + i * 294;
    rect(slide, x, 230, 250, 154, i === 3 ? C.green : C.white, true, i === 3 ? C.green : C.line, 2);
    text(slide, n, x + 18, 248, 36, 32, {
      size: 17,
      bold: true,
      color: i === 3 ? C.goldSoft : C.gold,
    });
    text(slide, t, x + 18, 286, 210, 36, {
      size: 25,
      bold: true,
      color: i === 3 ? C.white : C.ink,
    });
    text(slide, d, x + 18, 335, 210, 30, {
      size: 17,
      color: i === 3 ? "#DCE7E4" : C.gray,
    });
    if (i < 3) line(slide, x + 250, 307, 44, 0, C.gold, 3);
  });
  text(slide, "No mesmo registro", 62, 450, 300, 34, { size: 26, bold: true, color: C.green });
  text(
    slide,
    "Comentários, reuniões, anexos, responsáveis, prazos, decisões e movimentações formam um histórico consultável.",
    62,
    500,
    650,
    86,
    { size: 23 },
  );
  rect(slide, 790, 452, 388, 142, C.goldSoft, true);
  text(slide, "Resultado operacional", 816, 476, 300, 28, { size: 18, bold: true, color: C.gold });
  text(slide, "Menos cobrança fora do sistema e mais clareza sobre o próximo passo.", 816, 516, 330, 62, {
    size: 21,
    bold: true,
  });
  note(slide, "README.md; DESIGN.md, seções Tarefas e Checklist.");
}

// 9 — Melhorias
{
  const slide = deck.slides.add();
  page(slide, 9, "Oportunidades de melhoria com contexto", "Cada oportunidade pode permanecer associada à área e ao processo de origem");
  const items = [
    ["Detectar", "Registrar a situação observada e sua origem."],
    ["Analisar", "Detalhar causa, impacto e prioridade."],
    ["Acompanhar", "Definir situação, responsáveis e ações."],
    ["Encerrar", "Preservar a decisão e o histórico."],
  ];
  items.forEach(([t, d], i) => {
    const y = 205 + i * 105;
    text(slide, String(i + 1).padStart(2, "0"), 72, y, 46, 30, {
      size: 17,
      bold: true,
      color: C.gold,
    });
    text(slide, t, 132, y - 2, 210, 34, { size: 25, bold: true });
    text(slide, d, 365, y, 500, 38, { size: 19, color: C.gray });
    line(slide, 72, y + 55, 790, 0, C.line, 1);
  });
  rect(slide, 925, 210, 270, 365, C.green, true);
  text(slide, "O ciclo se fecha", 955, 246, 210, 64, {
    size: 31,
    bold: true,
    color: C.white,
  });
  text(
    slide,
    "A área de processos deixa de manter apenas diagnósticos e acompanha a transformação do padrão de trabalho.",
    955,
    336,
    210,
    170,
    { size: 22, color: "#DCE7E4" },
  );
  note(slide, "README.md, seção Oportunidades de melhoria; DESIGN.md, seção Visão operacional.");
}

// 10 — Visão operacional
{
  const slide = deck.slides.add();
  page(slide, 10, "Visão operacional para gestão e priorização", "Cobertura e volume ficam visíveis sem consolidação manual");
  await image(slide, "visao-operacional.png", 62, 190, 1156, 515, "Dashboard Visão operacional", "contain");
  rect(slide, 83, 562, 330, 108, C.ink, true);
  text(slide, "Cobertura", 103, 582, 140, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Processos mapeados e lacunas por área", 103, 614, 285, 42, {
    size: 18,
    bold: true,
    color: C.white,
  });
  rect(slide, 475, 562, 330, 108, C.ink, true);
  text(slide, "Distribuição", 495, 582, 160, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Registros por área e tipo de documento", 495, 614, 285, 42, {
    size: 18,
    bold: true,
    color: C.white,
  });
  rect(slide, 867, 562, 330, 108, C.ink, true);
  text(slide, "Melhorias", 887, 582, 140, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Situação das oportunidades registradas", 887, 614, 285, 42, {
    size: 18,
    bold: true,
    color: C.white,
  });
  note(slide, "captura Visão operacional fornecida pelo usuário; DESIGN.md, seção Visão operacional.");
}

// 11 — Ganhos
{
  const slide = deck.slides.add();
  page(slide, 11, "Ganhos esperados para a organização", "O valor aparece quando informação, responsabilidade e rotina permanecem conectadas");
  const values = [
    ["Dimensão", "Situação dispersa", "Ganho com BF Flow"],
    ["Conhecimento", "Arquivos e memória das pessoas", "Fonte comum por processo e área"],
    ["Governança", "Versões e aprovações paralelas", "Histórico, códigos e perfis de acesso"],
    ["Execução", "Cobrança por mensagens e planilhas", "Responsáveis, prazos e entregas no fluxo"],
    ["Gestão", "Consolidação manual para reportar", "Indicadores consultáveis por módulo e área"],
    ["Melhoria", "Ideias sem vínculo com o processo", "Oportunidades registradas e acompanhadas"],
  ];
  const table = slide.tables.add({
    rows: values.length,
    columns: 3,
    left: 62,
    top: 205,
    width: 1155,
    height: 410,
    columnWidths: [210, 410, 535],
    values,
  });
  table.styleOptions = { headerRow: true, bandedRows: true };
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).fill = C.green;
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).textStyle.color = C.white;
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).textStyle.bold = true;
  table.cells.block({ row: 0, column: 0, rowCount: 6, columnCount: 3 }).textStyle.fontSize = 19;
  table.cells.block({ row: 1, column: 0, rowCount: 5, columnCount: 1 }).textStyle.bold = true;
  table.cells.block({ row: 1, column: 2, rowCount: 5, columnCount: 1 }).textStyle.color = C.green;
  text(slide, "Os ganhos devem ser medidos com uma linha de base definida pela organização.", 62, 640, 920, 28, {
    size: 17,
    color: C.gray,
    italic: true,
  });
  note(slide, "síntese funcional baseada no README.md e no DESIGN.md. Não representa resultados já medidos.");
}

// 12 — Arquitetura e segurança
{
  const slide = deck.slides.add();
  page(slide, 12, "Arquitetura preparada para governança", "Aplicação web com isolamento por organização e regras no servidor");
  const layers = [
    ["Interface", "React 19 · TanStack Start · TypeScript", C.blue],
    ["Regras", "Server Functions · Zod · autenticação", C.teal],
    ["Dados", "Supabase PostgreSQL · RLS · Storage privado", C.green],
    ["Entrega", "GitHub main · Vercel · build validado", C.gold],
  ];
  layers.forEach(([name, detail, color], i) => {
    const y = 205 + i * 92;
    rect(slide, 62, y, 670, 70, C.white, true, color, 2);
    text(slide, name, 86, y + 16, 150, 34, { size: 22, bold: true, color });
    text(slide, detail, 250, y + 17, 450, 32, { size: 19, color: C.ink });
  });
  line(slide, 780, 205, 0, 350, C.line, 2);
  label(slide, "Controles principais", 830, 210, 330, C.gold);
  text(
    slide,
    "• acesso por perfil e módulo\n• organização isolada por organization_id\n• políticas RLS no banco\n• validação de entradas críticas\n• anexos em buckets privados\n• histórico e exclusão lógica",
    830,
    260,
    355,
    280,
    { size: 20 },
  );
  rect(slide, 830, 570, 355, 68, C.goldSoft, true);
  text(slide, "Controles da interface não substituem as políticas de banco.", 850, 584, 315, 40, {
    size: 17,
    bold: true,
    color: C.green,
  });
  note(slide, "README.md, seções Visão técnica, Arquitetura e Segurança.");
}

// 13 — Adoção
{
  const slide = deck.slides.add();
  page(slide, 13, "Adoção orientada por cobertura e uso", "A implantação deve começar pelo recorte que produz informação confiável");
  const phases = [
    ["01", "Preparar", "áreas, perfis, catálogos e critérios"],
    ["02", "Estruturar", "cadeia, processos prioritários e responsáveis"],
    ["03", "Operar", "mapeamentos, documentos, tarefas e revisões"],
    ["04", "Expandir", "melhorias, indicadores e novos processos"],
  ];
  phases.forEach(([n, t, d], i) => {
    const x = 62 + i * 292;
    text(slide, n, x, 212, 60, 30, { size: 16, bold: true, color: C.gold });
    text(slide, t, x, 252, 250, 38, { size: 27, bold: true, color: C.green });
    text(slide, d, x, 302, 245, 72, { size: 19, color: C.gray });
    line(slide, x, 392, 242, 0, i === 3 ? C.green : C.line, 4);
  });
  label(slide, "Indicadores para acompanhar", 62, 455, 450, C.teal);
  text(
    slide,
    "Cobertura de processos mapeados · documentos vigentes · tarefas vencidas · tempo de revisão · melhorias concluídas · uso por área",
    62,
    500,
    710,
    95,
    { size: 23, bold: true },
  );
  rect(slide, 840, 460, 360, 140, C.green, true);
  text(slide, "Próxima decisão", 868, 482, 250, 28, { size: 18, bold: true, color: C.goldSoft });
  text(slide, "Definir o primeiro conjunto de processos e os responsáveis pela manutenção.", 868, 520, 300, 66, {
    size: 22,
    bold: true,
    color: C.white,
  });
  note(slide, "recomendação de adoção derivada dos módulos e indicadores disponíveis. Os prazos dependem do escopo escolhido.");
}

const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href
);
const result = await finalizePresentation({
  explicitTotalSlideCount: 13,
  requiredNativeTableOwnerSlides: [11],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(
    skillDir,
    "container_tools",
    "inspect_presentation_package_integrity.py",
  ),
  layoutValidatorPath: path.join(
    skillDir,
    "container_tools",
    "inspect_presentation_layout_geometry.py",
  ),
  layoutArgs: [
    "--expected-slide-size-emu",
    "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    "--require-native-table-slide",
    "11",
  ],
  requiredNativeTableOwnerSlides: [11],
  fontPolicy: { basis: "design", families: [FONT, "Calibri"] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation.json"),
});

console.log(JSON.stringify({ finalPath, result }, null, 2));
