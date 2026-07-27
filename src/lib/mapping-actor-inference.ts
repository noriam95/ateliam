const AREA_LABEL_PATTERN =
  /(?:^|\n)\s*(?:[áa]rea respons[áa]vel(?: pela atividade)?|[áa]rea executora|[áa]rea\/ator|[áa]rea da atividade)\s*:\s*([^\n.;]+)/i;

const ACTIVITY_VERBS = [
  "acompanha",
  "altera",
  "analisa",
  "atualiza",
  "cadastra",
  "calcula",
  "comunica",
  "confere",
  "confirma",
  "consulta",
  "confronta",
  "controla",
  "distribui",
  "elabora",
  "encaminha",
  "executa",
  "informa",
  "mantem",
  "mantém",
  "organiza",
  "prepara",
  "processa",
  "realiza",
  "recebe",
  "registra",
  "solicita",
  "transcreve",
  "utiliza",
  "verifica",
].join("|");

const AREA_SUBJECT_PATTERN = new RegExp(
  String.raw`(?:^|[.!?]\s+|\n+)(?:Após)?(?:\s+[^.!?]{1,120},)?\s*(?:[Oo]|[Aa])\s+` +
    String.raw`([\p{Lu}][\p{L}-]*(?:\s+(?:(?:de|da|do|dos|das|e|&)\s+)?[\p{Lu}][\p{L}-]*){0,3}?)` +
    String.raw`\s+(?=${ACTIVITY_VERBS}\b)`,
  "gu",
);

function cleanAreaName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Identifica somente áreas declaradas como executoras no próprio texto.
 * Menções indiretas, destinatários e inferências por contexto são ignoradas.
 */
export function inferExplicitActivityArea(description: string) {
  const text = description.trim();
  if (!text) return "A definir";

  const labeledArea = AREA_LABEL_PATTERN.exec(text.replace(/\r\n?/g, "\n"))?.[1];
  if (labeledArea) return cleanAreaName(labeledArea);

  AREA_SUBJECT_PATTERN.lastIndex = 0;
  const subjectArea = AREA_SUBJECT_PATTERN.exec(text)?.[1];
  return subjectArea ? cleanAreaName(subjectArea) : "A definir";
}
