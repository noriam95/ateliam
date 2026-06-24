export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("[Ateliam]", error, context);
}
