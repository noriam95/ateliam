// Configuração de codificação por organização.
//
// O código de cada documento/registro é montado no formato:
//
//   SIGLA_DO_TIPO . SIGLA_DA_ÁREA . SEQUÊNCIA(3 dígitos)
//
// Ex.: POP.ADM.001 · IT.TIN.002 · MAP.FIN.001
//
// A sequência é mantida por combinação (tipo + sigla da área): cada área tem a
// sua própria contagem dentro de cada tipo de documento.

export const DOC_TYPES = ["pop", "it", "norma", "fluxograma", "mapeamento", "processo"] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type CodeMode = "auto" | "manual";

/** Sigla fixa (prefixo do código) de cada tipo de documento. */
export const DOC_TYPE_SIGLA: Record<DocType, string> = {
  pop: "POP",
  it: "IT",
  norma: "NOR",
  fluxograma: "FLU",
  mapeamento: "MAP",
  processo: "PR",
};

/** Rótulos exibidos na UI (Configurações). */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  pop: "Procedimento (POP)",
  it: "Instrução de Trabalho (IT)",
  norma: "Norma (NOR)",
  fluxograma: "Fluxograma (FLU)",
  mapeamento: "Mapeamento (MAP)",
  processo: "Processo (PR)",
};

/** Número de dígitos da sequência (POP.ADM.001). */
export const CODE_SEQUENCE_PAD = 3;

/** Default: todas as modalidades começam com geração automática ativada. */
export const DEFAULT_CODE_MODE: CodeMode = "auto";

export type CodeRule = {
  mode: CodeMode;
  /** Próxima sequência por sigla de área. Ex.: { ADM: 3, RHU: 1 }. */
  sequences: Record<string, number>;
};

export type CodeSettings = Partial<Record<DocType, CodeRule>>;

// Mapeia o formato antigo (kinds + máscara) para os novos tipos de documento.
const LEGACY_KIND_TO_TYPE: Record<string, DocType> = {
  process: "processo",
  mapping: "mapeamento",
  pop_it: "pop",
  flowchart: "fluxograma",
};

function emptyRule(): CodeRule {
  return { mode: DEFAULT_CODE_MODE, sequences: {} };
}

/** Normaliza uma sigla de área para o formato canônico (até 3 letras maiúsculas). */
export function normalizeSigla(raw: string | null | undefined): string {
  // NFD separa os acentos em marcas de combinação; o filtro [^A-Za-z] remove
  // tanto essas marcas quanto qualquer outro caractere não alfabético.
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

function normalizeSequences(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sigla = normalizeSigla(key);
    const n = Number(value);
    if (sigla && Number.isFinite(n) && n >= 1) out[sigla] = Math.floor(n);
  }
  return out;
}

/** Normaliza uma regra parcial/desconhecida em uma regra válida. */
export function normalizeRule(raw?: Partial<CodeRule> | Record<string, unknown> | null): CodeRule {
  if (!raw || typeof raw !== "object") return emptyRule();
  const mode: CodeMode = (raw as { mode?: unknown }).mode === "manual" ? "manual" : "auto";
  const sequences = normalizeSequences((raw as { sequences?: unknown }).sequences);
  return { mode, sequences };
}

/**
 * Normaliza um objeto de configurações (vindo do banco/localStorage),
 * aceitando tanto o formato novo quanto o formato antigo (máscara + kinds).
 */
export function normalizeCodeSettings(raw: unknown): Record<DocType, CodeRule> {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = DOC_TYPES.reduce(
    (acc, type) => {
      acc[type] = emptyRule();
      return acc;
    },
    {} as Record<DocType, CodeRule>,
  );
  for (const [key, value] of Object.entries(source)) {
    const type = (DOC_TYPES as readonly string[]).includes(key)
      ? (key as DocType)
      : LEGACY_KIND_TO_TYPE[key];
    if (!type) continue;
    result[type] = normalizeRule(value as Partial<CodeRule>);
  }
  return result;
}

/** Monta o código final a partir do tipo, sigla da área e sequência. */
export function buildDocumentCode(type: DocType, areaSigla: string, seq: number): string {
  const sigla = normalizeSigla(areaSigla);
  return `${DOC_TYPE_SIGLA[type]}.${sigla}.${String(seq).padStart(CODE_SEQUENCE_PAD, "0")}`;
}

/** Próxima sequência (sem consumir) para a combinação tipo + área. */
export function nextSequence(rule: CodeRule | null | undefined, areaSigla: string): number {
  const sigla = normalizeSigla(areaSigla);
  const n = rule?.sequences?.[sigla];
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Pré-visualização do próximo código (sem consumir a sequência). */
export function previewDocumentCode(
  type: DocType,
  areaSigla: string,
  rule?: CodeRule | null,
): string {
  return buildDocumentCode(type, areaSigla, nextSequence(rule, areaSigla));
}

/**
 * Gera o próximo código para (tipo + área) e devolve as configurações já com a
 * sequência incrementada (para persistir de volta).
 */
export function applyNextDocumentCode(
  settings: Record<DocType, CodeRule>,
  type: DocType,
  areaSigla: string,
): { code: string; settings: Record<DocType, CodeRule> } {
  const sigla = normalizeSigla(areaSigla);
  const rule = normalizeRule(settings[type]);
  const seq = nextSequence(rule, sigla);
  const code = buildDocumentCode(type, sigla, seq);
  const updated: Record<DocType, CodeRule> = {
    ...settings,
    [type]: { ...rule, sequences: { ...rule.sequences, [sigla]: seq + 1 } },
  };
  return { code, settings: updated };
}

/** True quando o tipo está configurado para geração automática de código. */
export function isAutoCode(settings: CodeSettings | undefined | null, type: DocType): boolean {
  return normalizeRule(settings?.[type]).mode === "auto";
}

// ---- Modo demonstração (sequência por tipo+sigla mantida no localStorage) ----

function demoSeqKey(organizationId: string | null | undefined, type: DocType, areaSigla: string) {
  return `ateliam-demo-code-next:${organizationId ?? "default"}:${type}:${normalizeSigla(areaSigla)}`;
}

function readDemoSeq(
  organizationId: string | null | undefined,
  type: DocType,
  areaSigla: string,
  fallback: number,
): number {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage.getItem(demoSeqKey(organizationId, type, areaSigla)));
  return Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : fallback;
}

/** Pré-visualização do próximo código em modo demo (não consome a sequência). */
export function previewDemoDocumentCode(
  organizationId: string | null | undefined,
  type: DocType,
  areaSigla: string,
  settings: CodeSettings | null | undefined,
): string {
  const sigla = normalizeSigla(areaSigla);
  const fallback = nextSequence(normalizeRule(settings?.[type]), sigla);
  return buildDocumentCode(type, sigla, readDemoSeq(organizationId, type, sigla, fallback));
}

/** Reserva o próximo código em modo demo (consome a sequência no localStorage). */
export function reserveDemoDocumentCode(
  organizationId: string | null | undefined,
  type: DocType,
  areaSigla: string,
  settings: CodeSettings | null | undefined,
): string {
  const sigla = normalizeSigla(areaSigla);
  const fallback = nextSequence(normalizeRule(settings?.[type]), sigla);
  const seq = readDemoSeq(organizationId, type, sigla, fallback);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(demoSeqKey(organizationId, type, sigla), String(seq + 1));
  }
  return buildDocumentCode(type, sigla, seq);
}
