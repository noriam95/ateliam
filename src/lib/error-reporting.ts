export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("[BF Flow]", error, context);
}
