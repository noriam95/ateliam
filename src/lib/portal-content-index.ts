/** Index text only. Never send embedded images, original files or markup to the portal. */
export function portalContentIndex(value: unknown) {
  const strings: string[] = [];
  const roles = new Set<string>();
  const text = (input: string) =>
    input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  function visit(node: unknown, key = "") {
    if (node == null) return;
    if (typeof node === "string") {
      if (
        /^(?:data:|https?:\/\/)/i.test(node.trim()) ||
        /^(?:originalXml|src|image|logo|logo_data_url|content_hash)$/i.test(key)
      )
        return;
      if (key === "xml") {
        for (const match of node.matchAll(/\bname\s*=\s*["']([^"']+)["']/g))
          strings.push(text(match[1]));
        for (const match of node.matchAll(
          /<(?:\w+:)?documentation\b[^>]*>([\s\S]*?)<\/(?:\w+:)?documentation>/g,
        ))
          strings.push(text(match[1]));
        return;
      }
      const plain = text(node);
      if (plain) strings.push(plain);
      if (/^(cargo|role_title|positionName)$/i.test(key) && plain) roles.add(plain);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key));
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const role =
      record.kind === "position"
        ? record.name
        : record.actorType === "position"
          ? record.actorName
          : null;
    if (typeof role === "string" && text(role)) roles.add(text(role));
    for (const [childKey, child] of Object.entries(record)) visit(child, childKey);
  }
  visit(value);
  return { text: strings.join(" "), roles: [...roles] };
}
