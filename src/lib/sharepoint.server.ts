// Server-only SharePoint helper via Microsoft Graph API proxy.
// Never import from client code.
// Requires SHAREPOINT_GATEWAY_URL, SHAREPOINT_API_KEY env vars.

const GATEWAY = process.env.SHAREPOINT_GATEWAY_URL ?? "";

function authHeaders(): HeadersInit {
  const spKey = process.env.SHAREPOINT_API_KEY;
  if (!GATEWAY || !spKey) {
    throw new Error(
      "SharePoint não está configurado. Defina SHAREPOINT_GATEWAY_URL e SHAREPOINT_API_KEY no .env.",
    );
  }
  return {
    Authorization: `Bearer ${spKey}`,
  };
}

export function isSharePointConfigured(): boolean {
  return Boolean(process.env.SHAREPOINT_GATEWAY_URL && process.env.SHAREPOINT_API_KEY);
}

async function gw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(authHeaders());
  if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  return fetch(`${GATEWAY}${path}`, { ...init, headers });
}

export async function listSites(query?: string) {
  const q = query ? `?search=${encodeURIComponent(query)}` : "?search=*";
  const res = await gw(`/sites${q}`);
  if (!res.ok) throw new Error(`Erro ao listar sites (${res.status}): ${await res.text()}`);
  return (await res.json()).value as Array<{ id: string; displayName: string; webUrl: string }>;
}

export async function listDrives(siteId: string) {
  const res = await gw(`/sites/${siteId}/drives`);
  if (!res.ok) throw new Error(`Erro ao listar bibliotecas (${res.status}): ${await res.text()}`);
  return (await res.json()).value as Array<{ id: string; name: string; webUrl: string }>;
}

export async function uploadFile(params: {
  siteId: string;
  driveId: string;
  folderPath: string;
  filename: string;
  content: string;
  contentType?: string;
}) {
  const folder = params.folderPath.replace(/^\/+|\/+$/g, "");
  const path = folder ? `${folder}/${params.filename}` : params.filename;
  const url = `/sites/${params.siteId}/drives/${params.driveId}/root:/${encodeURI(path)}:/content`;
  const res = await gw(url, {
    method: "PUT",
    headers: { "Content-Type": params.contentType || "text/html; charset=utf-8" },
    body: params.content,
  });
  if (!res.ok) throw new Error(`Falha ao salvar no SharePoint (${res.status}): ${await res.text()}`);
  return (await res.json()) as { id: string; webUrl: string; eTag?: string };
}

export async function downloadItem(siteId: string, driveId: string, itemId: string): Promise<string> {
  const res = await gw(`/sites/${siteId}/drives/${driveId}/items/${itemId}/content`);
  if (!res.ok) throw new Error(`Falha ao baixar do SharePoint (${res.status})`);
  return await res.text();
}

export async function listItemVersions(siteId: string, driveId: string, itemId: string) {
  const res = await gw(`/sites/${siteId}/drives/${driveId}/items/${itemId}/versions`);
  if (!res.ok) throw new Error(`Falha ao listar versões (${res.status})`);
  return (await res.json()).value as Array<{ id: string; lastModifiedDateTime: string }>;
}

export async function downloadVersion(
  siteId: string,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<string> {
  const res = await gw(`/sites/${siteId}/drives/${driveId}/items/${itemId}/versions/${versionId}/content`);
  if (!res.ok) throw new Error(`Falha ao baixar versão (${res.status})`);
  return await res.text();
}
