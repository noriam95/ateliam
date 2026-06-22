// Configuração de codificação por organização.
//
// Cada tipo de cadastro que gera código (Processo, Mapeamento, POP/IT e
// Fluxograma) pode ser configurado para gerar o código automaticamente a partir
// de uma máscara + sequência, ou ficar livre para preenchimento manual.

export const CODE_KINDS = ["process", "mapping", "pop_it", "flowchart"] as const;

export type CodeKind = (typeof CODE_KINDS)[number];

export type CodeMode = "auto" | "manual";

export type CodeRule = {
  mode: CodeMode;
  mask: string;
  next: number;
};

export type CodeSettings = Partial<Record<CodeKind, CodeRule>>;

export const CODE_KIND_LABELS: Record<CodeKind, string> = {
  process: "Processo",
  mapping: "Mapeamento",
  pop_it: "POP/IT",
  flowchart: "Fluxograma",
};

export const DEFAULT_CODE_RULES: Record<CodeKind, CodeRule> = {
  process: { mode: "manual", mask: "PRC-{seq:4}", next: 1 },
  mapping: { mode: "manual", mask: "MAP-{seq:4}", next: 1 },
  pop_it: { mode: "manual", mask: "POP-{seq:4}", next: 1 },
  flowchart: { mode: "manual", mask: "FLX-{seq:4}", next: 1 },
};

export type CodeContext = {
  /** Slug da organização, usado no token {org}. */
  slug?: string | null;
  /** Data de referência (default: agora) para os tokens {ano}/{mes}. */
  date?: Date;
};

/** Normaliza uma regra parcial/desconhecida em uma regra válida. */
export function normalizeRule(kind: CodeKind, raw?: Partial<CodeRule> | null): CodeRule {
  const fallback = DEFAULT_CODE_RULES[kind];
  if (!raw || typeof raw !== "object") return { ...fallback };
  const mode: CodeMode = raw.mode === "auto" ? "auto" : "manual";
  const mask = typeof raw.mask === "string" && raw.mask.trim() ? raw.mask : fallback.mask;
  const nextRaw = Number(raw.next);
  const next = Number.isFinite(nextRaw) && nextRaw >= 1 ? Math.floor(nextRaw) : 1;
  return { mode, mask, next };
}

/** Normaliza um objeto de configurações (vindo do banco/localStorage). */
export function normalizeCodeSettings(raw: unknown): Record<CodeKind, CodeRule> {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return CODE_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = normalizeRule(kind, source[kind] as Partial<CodeRule> | undefined);
      return acc;
    },
    {} as Record<CodeKind, CodeRule>,
  );
}

/**
 * Aplica a máscara a um número de sequência.
 *
 * Tokens suportados:
 *  - {seq} / {seq:N}  número sequencial, opcionalmente preenchido com N zeros
 *  - {ano} / {year}   ano com 4 dígitos · {ano:2} usa 2 dígitos
 *  - {mes} / {month}  mês com 2 dígitos
 *  - {org}            slug da organização em maiúsculas
 */
export function formatCode(mask: string, seq: number, ctx: CodeContext = {}): string {
  const date = ctx.date ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const slug = (ctx.slug ?? "").toUpperCase();

  return mask.replace(/\{(\w+)(?::(\d+))?\}/g, (match, token: string, padRaw?: string) => {
    const pad = padRaw ? Number(padRaw) : 0;
    switch (token.toLowerCase()) {
      case "seq":
      case "n":
        return pad > 0 ? String(seq).padStart(pad, "0") : String(seq);
      case "ano":
      case "year":
        return pad === 2 ? String(year).slice(-2) : String(year);
      case "mes":
      case "month":
        return String(month).padStart(2, "0");
      case "org":
        return slug;
      default:
        return match;
    }
  });
}

/** Pré-visualização do próximo código que seria gerado (sem consumir a sequência). */
export function previewCode(rule: CodeRule, ctx: CodeContext = {}): string {
  return formatCode(rule.mask, rule.next, ctx);
}

/**
 * Gera o próximo código para um tipo de cadastro e devolve as configurações já
 * com a sequência incrementada (para persistir de volta).
 */
export function applyNextCode(
  settings: Record<CodeKind, CodeRule>,
  kind: CodeKind,
  ctx: CodeContext = {},
): { code: string; settings: Record<CodeKind, CodeRule> } {
  const rule = normalizeRule(kind, settings[kind]);
  const code = formatCode(rule.mask, rule.next, ctx);
  const updated: Record<CodeKind, CodeRule> = {
    ...settings,
    [kind]: { ...rule, next: rule.next + 1 },
  };
  return { code, settings: updated };
}

/** True quando o tipo está configurado para geração automática de código. */
export function isAutoCode(settings: CodeSettings | undefined | null, kind: CodeKind): boolean {
  return normalizeRule(kind, settings?.[kind]).mode === "auto";
}
