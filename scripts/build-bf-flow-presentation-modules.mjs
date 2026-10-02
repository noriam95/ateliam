import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "file:///C:/Users/mairon.conceicao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const workspaceDir = process.cwd();
const skillDir = process.env.SKILL_DIR;
const runtimePython = process.env.RUNTIME_PYTHON;
if (!skillDir || !runtimePython) throw new Error("SKILL_DIR e RUNTIME_PYTHON são obrigatórios");

const buildDir = path.join(workspaceDir, ".codex-finalizer", "bf-flow-presentation-completa-v2");
const finalPath = path.join(
  workspaceDir,
  "docs",
  "apresentacoes",
  "BF_Flow_Apresentacao_Completa.pptx",
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
  softBlue: "#EEF4FA",
  softGreen: "#EDF7ED",
  softRed: "#FBEDEE",
};

const deck = Presentation.create({ slideSize: { width: W, height: H } });

function rect(slide, x, y, w, h, fill, radius = false, stroke = "none", strokeWidth = 0) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill: fill === "none" ? "none" : { type: "solid", color: fill },
    line: stroke === "none" ? { fill: "none", width: 0 } : { fill: stroke, width: strokeWidth },
  });
}

function line(slide, x, y, w, h, color = C.line, width = 2) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
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

function page(slide, number, titleValue, subtitle) {
  slide.background.fill = C.paper;
  text(slide, titleValue, 54, 70, 1140, 58, { size: 42, bold: true });
  if (subtitle) text(slide, subtitle, 56, 126, 1110, 40, { size: 20, color: C.gray });
  line(slide, 54, 166, 1172, 0, C.gold, 3);
}

function note(slide, source, presenter = "") {
  slide.speakerNotes.textFrame.setText([presenter, `Fontes: ${source}`].filter(Boolean).join("\n\n"));
}

async function image(slide, filename, x, y, w, h, alt, fit = "contain", crop) {
  const bytes = await fs.readFile(path.join(assetDir, filename));
  rect(slide, x - 5, y - 5, w + 10, h + 10, C.white, true, C.line, 1);
  return slide.images.add({
    blob: new Uint8Array(bytes), contentType: "image/png", alt, fit,
    position: { left: x, top: y, width: w, height: h },
    ...(crop ? { crop } : {}), geometry: "roundRect", borderRadius: 8,
  });
}

function label(slide, value, x, y, w, color = C.green) {
  text(slide, value.toUpperCase(), x, y, w, 26, { size: 14, bold: true, color });
}

function bullets(slide, items, x, y, w, h, options = {}) {
  text(slide, items.map((item) => `• ${item}`).join("\n"), x, y, w, h, {
    size: options.size ?? 20, color: options.color ?? C.ink, bold: options.bold ?? false,
  });
}

function gainBand(slide, value) {
  rect(slide, 62, 618, 1156, 60, C.green, true);
  text(slide, "GANHO PRINCIPAL", 84, 637, 170, 22, { size: 13, bold: true, color: C.goldSoft });
  text(slide, value, 266, 630, 925, 34, { size: 21, bold: true, color: C.white });
}

function strengthList(slide, items, x = 850, y = 220, w = 350) {
  label(slide, "Pontos fortes", x, y, w, C.gold);
  items.forEach((item, i) => {
    const yy = y + 46 + i * 82;
    rect(slide, x, yy, 28, 28, C.goldSoft, true, C.gold, 1);
    text(slide, "✓", x, yy + 1, 28, 26, { size: 17, bold: true, color: C.gold, align: "center" });
    text(slide, item, x + 42, yy - 1, w - 42, 62, { size: 19, bold: true });
  });
}

function numberedStep(slide, number, titleValue, detail, x, y, w) {
  rect(slide, x, y, 42, 42, C.green, true);
  text(slide, String(number), x, y, 42, 42, {
    size: 20, bold: true, color: C.white, align: "center", valign: "middle",
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
    size: 58, bold: true, color: C.white,
  });
  text(slide, "Conceito, módulos, aplicações práticas e ganhos para a organização", 78, 350, 680, 70, {
    size: 25, color: "#DCE7E4",
  });
  line(slide, 78, 465, 470, 0, C.gold, 4);
  text(slide, "Apresentação executiva completa", 78, 492, 420, 35, { size: 19, color: "#AFC2BD" });
  const logo = new Uint8Array(await fs.readFile(path.join(workspaceDir, "public", "brand", "bom-futuro-dark.png")));
  slide.images.add({
    blob: logo, contentType: "image/png", alt: "Bom Futuro", fit: "contain",
    position: { left: 846, top: 184, width: 340, height: 190 },
  });
  text(slide, "02 OUT 2026", 1015, 652, 170, 24, { size: 14, bold: true, color: "#AFC2BD", align: "right" });
  note(slide, "README.md e identidade visual do BF Flow.");
}

// 2 — Problema
{
  const slide = deck.slides.add();
  page(slide, 2, "O problema que o BF Flow resolve", "Uma fonte comum para entender, executar e melhorar o trabalho");
  label(slide, "Para a empresa", 62, 200, 320, C.gold);
  text(slide, "Processos, documentos e responsabilidades ficam dispersos em planilhas, arquivos e conhecimento informal.", 62, 236, 455, 94, { size: 25, bold: true });
  text(slide, "A liderança perde visibilidade sobre cobertura, pendências, versões válidas e oportunidades de melhoria.", 62, 350, 455, 92, { size: 20, color: C.gray });
  line(slide, 542, 210, 0, 360, C.line, 2);
  label(slide, "Para a área de processos", 582, 200, 420, C.teal);
  text(slide, "Mapear, desenhar, documentar e acompanhar mudanças exige ferramentas desconectadas e controles manuais.", 582, 236, 590, 94, { size: 25, bold: true });
  text(slide, "A equipe gasta tempo conciliando versões e cobrando atualizações, com dificuldade para demonstrar alcance e resultados.", 582, 350, 590, 92, { size: 20, color: C.gray });
  rect(slide, 62, 490, 1110, 130, C.green, true);
  text(slide, "Como o BF Flow responde", 88, 512, 250, 30, { size: 18, bold: true, color: C.goldSoft });
  text(slide, "Conecta arquitetura de processos, BPMN, documentação, tarefas, melhorias e indicadores no mesmo ambiente, com histórico e responsabilidades definidos.", 88, 550, 1040, 50, { size: 24, bold: true, color: C.white });
  note(slide, "README.md; DESIGN.md.", "Mensagem central: o produto reduz fragmentação e controles paralelos.");
}

// 3 — Conceito
{
  const slide = deck.slides.add();
  page(slide, 3, "O conceito da plataforma", "O processo funciona como eixo entre estratégia, padrão e execução");
  // Conectores ortogonais são desenhados primeiro para terminarem sob os cartões.
  line(slide, 340, 262, 65, 0); line(slide, 405, 262, 0, 58); line(slide, 405, 320, 65, 0);
  line(slide, 340, 458, 65, 0); line(slide, 405, 390, 0, 68); line(slide, 405, 390, 65, 0);
  line(slide, 810, 320, 65, 0); line(slide, 875, 262, 0, 58); line(slide, 875, 262, 65, 0);
  line(slide, 810, 390, 65, 0); line(slide, 875, 390, 0, 68); line(slide, 875, 458, 65, 0);
  line(slide, 555, 430, 0, 100); line(slide, 725, 430, 0, 100);
  rect(slide, 470, 280, 340, 150, C.green, true);
  text(slide, "PROCESSO", 500, 304, 280, 48, { size: 35, bold: true, color: C.white, align: "center" });
  text(slide, "estrutura comum de gestão", 505, 360, 270, 30, { size: 17, color: "#DCE7E4", align: "center" });
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
  note(slide, "README.md, seção Domínios funcionais.");
}

// 4 — Abertura da seção de módulos
{
  const slide = deck.slides.add();
  slide.background.fill = C.green;
  rect(slide, 0, 0, W, 16, C.gold);
  text(slide, "MÓDULOS DO BF FLOW", 72, 120, 620, 40, { size: 18, bold: true, color: C.goldSoft });
  text(slide, "Uma plataforma,\num ciclo completo", 72, 190, 750, 150, { size: 58, bold: true, color: C.white });
  text(slide, "Cada módulo cumpre um papel próprio e compartilha cadastros, processos, responsáveis e histórico.", 76, 380, 690, 82, { size: 25, color: "#DCE7E4" });
  rect(slide, 850, 154, 350, 330, C.white, true);
  label(slide, "Padrão visual adotado", 882, 188, 285, C.gold);
  text(slide, "TEMA CLARO", 882, 232, 285, 48, { size: 34, bold: true, color: C.green });
  text(slide, "Melhor leitura em projetores, documentos e reuniões. Todas as telas da apresentação seguem o mesmo padrão.", 882, 306, 275, 118, { size: 20, color: C.gray });
  text(slide, "01—11", 1080, 650, 110, 26, { size: 16, bold: true, color: C.goldSoft, align: "right" });
  note(slide, "decisão editorial desta apresentação; interface atual do BF Flow.");
}

// 5 — Home
{
  const slide = deck.slides.add();
  page(slide, 5, "Página inicial", "A visão pessoal organiza responsabilidades, agenda e entregas");
  await image(slide, "home.png", 62, 205, 740, 360, "Página inicial do BF Flow em tema claro", "contain");
  strengthList(slide, [
    "Resumo de tarefas abertas por módulo",
    "Agenda mensal com reuniões e vencimentos",
    "Histórico de conclusões em um único ponto",
  ]);
  gainBand(slide, "Cada pessoa começa o dia sabendo o que exige ação.");
  note(slide, "captura da Home preparada a partir da interface do BF Flow; DESIGN.md, seção Home.");
}

// 6 — Tarefas
{
  const slide = deck.slides.add();
  page(slide, 6, "Minhas tarefas", "Solicitações, execução, revisão e entrega permanecem ligadas ao processo");
  await image(slide, "minhas-tarefas.png", 62, 205, 650, 170, "Consulta de tarefas em tema claro", "contain");
  await image(slide, "nova-tarefa.png", 468, 395, 245, 210, "Formulário de nova tarefa em tema claro", "cover", { left: 0, top: 0, right: 0, bottom: 0.48 });
  const stages = [["Solicitar", "demanda"], ["Executar", "checklist"], ["Revisar", "análise"], ["Concluir", "entrega"]];
  stages.forEach(([t, d], i) => {
    const x = 62 + i * 98;
    rect(slide, x, 414, 84, 96, i === 3 ? C.green : C.white, true, i === 3 ? C.green : C.line, 1);
    text(slide, String(i + 1), x + 8, 425, 20, 22, { size: 13, bold: true, color: i === 3 ? C.goldSoft : C.gold });
    text(slide, t, x + 8, 454, 68, 23, { size: 15, bold: true, color: i === 3 ? C.white : C.ink, align: "center" });
    text(slide, d, x + 7, 482, 70, 20, { size: 12, color: i === 3 ? "#DCE7E4" : C.gray, align: "center" });
  });
  strengthList(slide, [
    "Responsáveis, prazos e movimentações registrados",
    "Comentários, reuniões e anexos no mesmo histórico",
    "Entregas vinculadas ao mapeamento, documento ou melhoria",
  ]);
  gainBand(slide, "Menos cobrança paralela e mais clareza sobre o próximo passo.");
  note(slide, "telas fornecidas pelo usuário; README.md; DESIGN.md, seções Tarefas e Checklist.");
}

// 7 — Cadastros
{
  const slide = deck.slides.add();
  page(slide, 7, "Cadastros", "A base comum evita nomes duplicados e relações frágeis entre módulos");
  const catalogs = [
    ["Processos", "estrutura e proprietário", C.green], ["Áreas", "organização responsável", C.teal],
    ["Cargos", "papéis organizacionais", C.blue], ["Pessoas", "responsáveis e revisores", C.gold],
    ["Sistemas", "aplicações e documentos", C.teal], ["Catálogos", "tipos, status e critérios", C.blue],
  ];
  catalogs.forEach(([name, detail, color], i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = 62 + col * 365; const y = 210 + row * 116;
    rect(slide, x, y, 338, 92, C.white, true, color, 2);
    rect(slide, x + 18, y + 20, 50, 50, color, true);
    text(slide, String(i + 1).padStart(2, "0"), x + 18, y + 31, 50, 28, { size: 17, bold: true, color: C.white, align: "center" });
    text(slide, name, x + 86, y + 15, 225, 31, { size: 22, bold: true, color });
    text(slide, detail, x + 86, y + 50, 225, 25, { size: 16, color: C.gray });
  });
  strengthList(slide, [
    "Dados reutilizados em todos os módulos",
    "Responsabilidade institucional associada ao processo",
    "Padronização de códigos, áreas e classificações",
  ]);
  gainBand(slide, "A governança começa por uma linguagem organizacional comum.");
  note(slide, "README.md, seção Cadastros; src/components/workspace-process-registrations.tsx.");
}

// 8 — Cadeia de valor e relacionamentos
{
  const slide = deck.slides.add();
  page(slide, 8, "Cadeia de valor e relacionamentos", "Os processos deixam de ser registros isolados e passam a formar uma arquitetura");
  const lanes = [
    ["Estratégicos", 220, C.gold], ["Primários", 335, C.green], ["Suporte", 450, C.blue],
  ];
  lanes.forEach(([name, y, color], idx) => {
    text(slide, name, 62, y + 25, 132, 28, { size: 18, bold: true, color });
    line(slide, 190, y + 40, 585, 0, C.line, 2);
    const count = idx === 1 ? 4 : 3;
    for (let j = 0; j < count; j++) {
      const x = 220 + j * 142;
      rect(slide, x, y, 116, 80, idx === 1 ? C.softGreen : C.white, true, color, 2);
      text(slide, idx === 0 ? ["Direção", "Riscos", "Desempenho"][j] : idx === 1 ? ["Demanda", "Planejar", "Executar", "Entregar"][j] : ["Pessoas", "TI", "Finanças"][j], x + 8, y + 23, 100, 30, { size: 16, bold: true, align: "center", color });
      if (j < count - 1) line(slide, x + 116, y + 40, 26, 0, color, 2);
    }
  });
  strengthList(slide, [
    "Classificação por papel na geração de valor",
    "Entradas, saídas e dependências visíveis",
    "Visão transversal para priorizar lacunas e interfaces",
  ]);
  gainBand(slide, "A organização entende onde cada processo se encaixa e de quem depende.");
  note(slide, "README.md, seção Cadeia de valor; DESIGN.md, diretrizes de relacionamentos.");
}

// 9 — Mapeamento
{
  const slide = deck.slides.add();
  page(slide, 9, "Mapeamento de processos", "Estrutura guiada para registrar o processo com profundidade e consistência");
  const sections = [
    ["00", "Dados"], ["01", "Visão geral"], ["02", "Sistemas"], ["03", "SIPOC"],
    ["04", "Etapas"], ["05", "Melhorias"], ["06", "Próximos passos"], ["07", "Glossário"],
  ];
  sections.forEach(([n, name], i) => {
    const col = i % 4; const row = Math.floor(i / 4);
    const x = 62 + col * 188; const y = 215 + row * 112;
    rect(slide, x, y, 166, 88, C.white, true, i === 4 ? C.green : C.line, i === 4 ? 3 : 1);
    text(slide, n, x + 14, y + 12, 34, 24, { size: 14, bold: true, color: C.gold });
    text(slide, name, x + 14, y + 43, 138, 26, { size: 18, bold: true, color: i === 4 ? C.green : C.ink });
  });
  label(slide, "Formas de preenchimento", 62, 458, 370, C.teal);
  const modes = [["Manual", "campos orientados"], ["Assistente", "texto estruturado"], ["Importação", "DOCX e conteúdo existente"]];
  modes.forEach(([name, detail], i) => {
    const x = 62 + i * 240;
    rect(slide, x, 500, 218, 76, i === 1 ? C.softGreen : C.white, true, i === 1 ? C.teal : C.line, 1);
    text(slide, name, x + 16, 512, 186, 25, { size: 18, bold: true, color: i === 1 ? C.teal : C.ink });
    text(slide, detail, x + 16, 542, 186, 20, { size: 14, color: C.gray });
  });
  strengthList(slide, [
    "Índice e progresso por seção",
    "SIPOC, etapas, sistemas e oportunidades conectados",
    "Apresentação e relatório gerados a partir do mesmo conteúdo",
  ]);
  gainBand(slide, "O diagnóstico deixa de depender de um formulário livre e ganha padrão verificável.");
  note(slide, "src/routes/_authenticated/m.$module.tsx, seções do mapeamento e importação estruturada.");
}

// 10 — Fluxogramas: desenho
{
  const slide = deck.slides.add();
  page(slide, 10, "Fluxogramas — modo desenho", "Modelagem BPMN com recursos visuais, edição e controle no mesmo ambiente");
  rect(slide, 62, 205, 700, 365, C.white, true, C.line, 1);
  // Canvas vetorial: conexões são desenhadas primeiro e terminam exatamente
  // nas bordas dos elementos, evitando linhas soltas na apresentação.
  rect(slide, 92, 234, 638, 276, C.white, false, C.gray, 1);
  line(slide, 92, 372, 638, 0, C.gray, 1);
  line(slide, 184, 316, 36, 0, C.ink, 2);
  line(slide, 330, 316, 60, 0, C.ink, 2);
  line(slide, 500, 316, 60, 0, C.ink, 2);
  line(slide, 610, 316, 40, 0, C.ink, 2);
  line(slide, 585, 342, 0, 68, C.ink, 2);
  const start = slide.shapes.add({ geometry: "ellipse", position: { left: 150, top: 299, width: 34, height: 34 }, fill: { type: "solid", color: C.softGreen }, line: { fill: "#4E8A48", width: 2 } });
  const task1 = rect(slide, 220, 280, 110, 72, C.softBlue, true, "#2563A6", 2);
  const task2 = rect(slide, 390, 280, 110, 72, C.softBlue, true, "#2563A6", 2);
  slide.shapes.add({ geometry: "diamond", position: { left: 560, top: 291, width: 50, height: 50 }, fill: { type: "solid", color: "#FFF5DE" }, line: { fill: "#B8862D", width: 2 } });
  slide.shapes.add({ geometry: "ellipse", position: { left: 650, top: 299, width: 34, height: 34 }, fill: { type: "solid", color: C.softRed }, line: { fill: C.red, width: 3 } });
  rect(slide, 530, 410, 110, 72, C.softBlue, true, "#2563A6", 2);
  text(slide, "Registrar", 228, 302, 94, 28, { size: 16, bold: true, align: "center" });
  text(slide, "Analisar", 398, 302, 94, 28, { size: 16, bold: true, align: "center" });
  text(slide, "×", 569, 297, 32, 32, { size: 25, bold: true, align: "center" });
  text(slide, "Revisar", 538, 432, 94, 28, { size: 16, bold: true, align: "center" });
  rect(slide, 104, 249, 100, 38, C.white, true, C.line, 1);
  text(slide, "Raia · Analista", 114, 259, 80, 20, { size: 12, bold: true, color: C.green, align: "center" });
  rect(slide, 104, 389, 105, 38, C.white, true, C.line, 1);
  text(slide, "Raia · Revisor", 114, 399, 85, 20, { size: 12, bold: true, color: C.blue, align: "center" });
  rect(slide, 379, 270, 132, 92, "none", true, C.gold, 2);
  text(slide, "ELEMENTO SELECIONADO", 370, 526, 150, 18, { size: 11, bold: true, color: C.gold, align: "center" });
  await image(slide, "barra-editor-bpmn.png", 62, 578, 700, 70, "Barra de ferramentas compacta do editor BPMN", "contain");
  strengthList(slide, [
    "BPMN 2.0 com tarefas, eventos, gateways, piscinas e raias",
    "Formatação de texto, cores, imagens e cópia de estilo",
    "Importação, validação, salvamento e exportação do desenho",
  ]);
  note(slide, "telas fornecidas pelo usuário; README.md; DESIGN.md, seção Editor BPMN compacto.");
}

// 11 — Fluxogramas: apresentação
{
  const slide = deck.slides.add();
  page(slide, 11, "Fluxogramas — modo apresentação", "O desenho ganha uma visualização limpa para análise, reunião e comunicação");
  await image(slide, "editor-bpmn.png", 62, 200, 790, 420, "Fluxograma BPMN apresentado em tela clara", "cover", { left: 0.02, top: 0.08, right: 0.01, bottom: 0.06 });
  label(slide, "Experiência de apresentação", 900, 215, 300, C.gold);
  bullets(slide, [
    "canvas ocupa a maior parte da tela",
    "barras podem ser recolhidas",
    "zoom e ajuste permanecem acessíveis",
    "raias identificadas sem coluna visual pesada",
    "controles transparentes não ocultam o desenho",
  ], 900, 260, 300, 255, { size: 19 });
  rect(slide, 900, 540, 300, 70, C.goldSoft, true);
  text(slide, "Do trabalho técnico à conversa com as áreas, sem recriar o fluxo em outra ferramenta.", 920, 550, 260, 50, { size: 17, bold: true, color: C.green });
  gainBand(slide, "O mesmo arquivo serve para modelar, revisar e apresentar o processo.");
  note(slide, "tela fornecida pelo usuário; DESIGN.md, seções de tela cheia e controles do canvas.");
}

// 12 — Documentação
{
  const slide = deck.slides.add();
  page(slide, 12, "Documentação e biblioteca", "Procedimentos, fluxogramas e versões permanecem localizáveis e rastreáveis");
  await image(slide, "biblioteca-bpmn-clara.png", 62, 205, 760, 185, "Biblioteca de desenhos em tema claro", "contain");
  const flow = [["Rascunho", C.gray], ["Revisão", C.gold], ["Aprovado", C.blue], ["Vigente", C.green]];
  flow.forEach(([name, color], i) => {
    const x = 62 + i * 185;
    rect(slide, x, 435, 152, 68, i === 3 ? C.softGreen : C.white, true, color, 2);
    text(slide, name, x + 12, 455, 128, 28, { size: 19, bold: true, color, align: "center" });
    if (i < 3) line(slide, x + 152, 469, 33, 0, C.gold, 2);
  });
  text(slide, "Código · título · versão · atualização · área · criação", 62, 540, 755, 35, { size: 19, bold: true, color: C.green, align: "center" });
  strengthList(slide, [
    "Pesquisa única em todas as colunas visíveis",
    "Ordenação, consulta, edição, relatório e exclusão lógica",
    "Código organizacional e histórico de versões",
  ]);
  gainBand(slide, "A organização identifica rapidamente qual documento vale e quem o mantém.");
  note(slide, "tela fornecida pelo usuário; README.md, Persistência e versionamento; DESIGN.md, Bibliotecas de Processos.");
}

// 13 — Melhorias
{
  const slide = deck.slides.add();
  page(slide, 13, "Oportunidades de melhoria", "Problemas observados se transformam em ações acompanháveis");
  const items = [
    ["Detectar", "situação e origem", C.gold], ["Analisar", "causa, impacto e prioridade", C.teal],
    ["Planejar", "ação, responsável e prazo", C.blue], ["Acompanhar", "situação e evidências", C.green],
  ];
  items.forEach(([name, detail, color], i) => {
    const x = 62 + i * 190;
    rect(slide, x, 240, 164, 180, i === 3 ? C.softGreen : C.white, true, color, 2);
    text(slide, String(i + 1).padStart(2, "0"), x + 18, 258, 40, 28, { size: 16, bold: true, color });
    text(slide, name, x + 18, 302, 128, 36, { size: 24, bold: true, color });
    text(slide, detail, x + 18, 350, 128, 58, { size: 17, color: C.gray });
    if (i < 3) line(slide, x + 164, 330, 26, 0, C.gold, 3);
  });
  strengthList(slide, [
    "Origem ligada ao processo ou ao mapeamento",
    "Prioridade, responsáveis e situação explícitos",
    "Histórico que preserva decisão e encerramento",
  ]);
  gainBand(slide, "A área de processos acompanha a mudança, além de registrar o diagnóstico.");
  note(slide, "README.md, seção Oportunidades de melhoria; DESIGN.md, consultas e Visão operacional.");
}

// 14 — Configurações
{
  const slide = deck.slides.add();
  page(slide, 14, "Configurações e governança", "A administração adapta a ferramenta sem perder padrões comuns");
  const groups = [
    ["Identidade visual", "marca, cores e cabeçalhos", C.gold],
    ["Modelos", "documentos e apresentações", C.blue],
    ["Acessos", "perfis, módulos e permissões", C.green],
    ["Preferências", "comportamentos da organização", C.teal],
  ];
  groups.forEach(([name, detail, color], i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = 62 + col * 365; const y = 220 + row * 150;
    rect(slide, x, y, 330, 122, C.white, true, color, 2);
    text(slide, name, x + 22, y + 21, 285, 34, { size: 23, bold: true, color });
    text(slide, detail, x + 22, y + 68, 285, 30, { size: 17, color: C.gray });
  });
  strengthList(slide, [
    "Permissões combinam organização, papel e módulo",
    "Modelos sustentam documentos consistentes",
    "Preferências ficam centralizadas para manutenção",
  ]);
  gainBand(slide, "A plataforma cresce com controle, identidade e regras administráveis.");
  note(slide, "README.md, seções Configurações, Segurança e Perfis de acesso.");
}

// 15 — Visão operacional
{
  const slide = deck.slides.add();
  page(slide, 15, "Visão operacional", "Cobertura, registros e melhorias ficam visíveis sem consolidação manual");
  await image(slide, "visao-operacional.png", 62, 190, 1156, 515, "Dashboard Visão operacional em tema claro", "contain");
  rect(slide, 83, 562, 330, 108, C.ink, true);
  text(slide, "Cobertura", 103, 582, 140, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Processos mapeados e lacunas por área", 103, 614, 285, 42, { size: 18, bold: true, color: C.white });
  rect(slide, 475, 562, 330, 108, C.ink, true);
  text(slide, "Distribuição", 495, 582, 160, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Registros por área e tipo de documento", 495, 614, 285, 42, { size: 18, bold: true, color: C.white });
  rect(slide, 867, 562, 330, 108, C.ink, true);
  text(slide, "Melhorias", 887, 582, 140, 26, { size: 17, bold: true, color: C.gold });
  text(slide, "Situação das oportunidades registradas", 887, 614, 285, 42, { size: 18, bold: true, color: C.white });
  note(slide, "captura Visão operacional fornecida pelo usuário; DESIGN.md, seção Visão operacional.");
}

// 16 — Ganhos
{
  const slide = deck.slides.add();
  page(slide, 16, "Ganhos esperados para a organização", "O valor aparece quando informação, responsabilidade e rotina permanecem conectadas");
  const values = [
    ["Dimensão", "Situação dispersa", "Ganho com BF Flow"],
    ["Conhecimento", "Arquivos e memória das pessoas", "Fonte comum por processo e área"],
    ["Governança", "Versões e aprovações paralelas", "Histórico, códigos e perfis de acesso"],
    ["Execução", "Cobrança por mensagens e planilhas", "Responsáveis, prazos e entregas no fluxo"],
    ["Gestão", "Consolidação manual para reportar", "Indicadores consultáveis por módulo e área"],
    ["Melhoria", "Ideias sem vínculo com o processo", "Oportunidades registradas e acompanhadas"],
  ];
  const table = slide.tables.add({
    rows: values.length, columns: 3, left: 62, top: 205, width: 1155, height: 410,
    columnWidths: [210, 410, 535], values,
  });
  table.styleOptions = { headerRow: true, bandedRows: true };
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).fill = C.green;
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).textStyle.color = C.white;
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).textStyle.bold = true;
  table.cells.block({ row: 0, column: 0, rowCount: 6, columnCount: 3 }).textStyle.fontSize = 19;
  table.cells.block({ row: 1, column: 0, rowCount: 5, columnCount: 1 }).textStyle.bold = true;
  table.cells.block({ row: 1, column: 2, rowCount: 5, columnCount: 1 }).textStyle.color = C.green;
  text(slide, "Os ganhos devem ser medidos com uma linha de base definida pela organização.", 62, 640, 920, 28, { size: 17, color: C.gray, italic: true });
  note(slide, "síntese funcional baseada no README.md e no DESIGN.md. Não representa resultados já medidos.");
}

// 17 — Arquitetura
{
  const slide = deck.slides.add();
  page(slide, 17, "Arquitetura preparada para governança", "Aplicação web com isolamento por organização e regras no servidor");
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
  bullets(slide, [
    "acesso por perfil e módulo",
    "organização isolada por organization_id",
    "políticas RLS no banco",
    "validação de entradas críticas",
    "anexos em buckets privados",
    "histórico e exclusão lógica",
  ], 830, 260, 355, 280, { size: 20 });
  rect(slide, 830, 570, 355, 68, C.goldSoft, true);
  text(slide, "Controles da interface não substituem as políticas de banco.", 850, 584, 315, 40, { size: 17, bold: true, color: C.green });
  note(slide, "README.md, seções Visão técnica, Arquitetura e Segurança.");
}

// 18 — Adoção
{
  const slide = deck.slides.add();
  page(slide, 18, "Adoção orientada por cobertura e uso", "A implantação deve começar pelo recorte que produz informação confiável");
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
  text(slide, "Cobertura de processos mapeados · documentos vigentes · tarefas vencidas · tempo de revisão · melhorias concluídas · uso por área", 62, 500, 710, 95, { size: 23, bold: true });
  rect(slide, 840, 460, 360, 140, C.green, true);
  text(slide, "Próxima decisão", 868, 482, 250, 28, { size: 18, bold: true, color: C.goldSoft });
  text(slide, "Definir o primeiro conjunto de processos e os responsáveis pela manutenção.", 868, 520, 300, 66, { size: 22, bold: true, color: C.white });
  note(slide, "recomendação de adoção derivada dos módulos e indicadores disponíveis. Os prazos dependem do escopo escolhido.");
}

const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href
);
const result = await finalizePresentation({
  explicitTotalSlideCount: 18,
  requiredNativeTableOwnerSlides: [16],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry",
    "--validate-heading-fit", "--require-native-table-slide", "16",
  ],
  requiredNativeTableOwnerSlides: [16],
  fontPolicy: { basis: "design", families: [FONT, "Calibri"] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation.json"),
});

console.log(JSON.stringify({ finalPath, result }, null, 2));
