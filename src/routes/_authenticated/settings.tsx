import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAppConfig, updateAppConfig, listSharePointSites, listSharePointDrives, getMe } from "@/lib/config.functions";
import { CheckCircle2, AlertCircle, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const getCfg = useServerFn(getAppConfig);
  const updCfg = useServerFn(updateAppConfig);
  const sites = useServerFn(listSharePointSites);
  const drives = useServerFn(listSharePointDrives);
  const me = useServerFn(getMe);

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => me() });
  const cfgQ = useQuery({ queryKey: ["cfg"], queryFn: () => getCfg() });

  const isAdmin = meQ.data?.roles?.includes("admin");
  const [siteId, setSiteId] = useState("");
  const [driveId, setDriveId] = useState("");
  const [folder, setFolder] = useState("/Noriam");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (cfgQ.data?.config) {
      setSiteId(cfgQ.data.config.sharepoint_site_id ?? "");
      setDriveId(cfgQ.data.config.sharepoint_drive_id ?? "");
      setFolder(cfgQ.data.config.sharepoint_folder_path ?? "/Noriam");
    }
  }, [cfgQ.data]);

  const sitesMut = useMutation({ mutationFn: (q: string) => sites({ data: { query: q } }) });
  const drivesQ = useQuery({
    queryKey: ["drives", siteId],
    queryFn: () => drives({ data: { siteId } }),
    enabled: !!siteId && cfgQ.data?.connectorReady,
  });

  const saveMut = useMutation({
    mutationFn: () => updCfg({ data: { sharepoint_site_id: siteId, sharepoint_drive_id: driveId, sharepoint_folder_path: folder } }),
    onSuccess: () => { toast.success("Configuração salva"); cfgQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Integração SharePoint e workspace.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          {cfgQ.data?.connectorReady ? (
            <><CheckCircle2 className="h-5 w-5 text-green-600" /><span className="font-medium">SharePoint conectado</span></>
          ) : (
            <><AlertCircle className="h-5 w-5 text-amber-600" /><span className="font-medium">SharePoint não conectado</span></>
          )}
        </div>
        {!cfgQ.data?.connectorReady && (
          <p className="text-sm text-muted-foreground">
            Conecte o Microsoft SharePoint na seção <strong>Connectors</strong> do projeto para habilitar gravação automática.
            Enquanto não estiver conectado, as versões ficam salvas apenas no banco do app.
          </p>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-secondary border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Apenas administradores podem alterar essas configurações.
        </div>
      )}

      <div className={`bg-card border border-border rounded-lg p-5 space-y-4 ${!isAdmin ? "opacity-60 pointer-events-none" : ""}`}>
        <h2 className="font-display text-base font-bold uppercase tracking-wider">Site e biblioteca</h2>

        {cfgQ.data?.connectorReady && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Buscar site</label>
            <div className="flex gap-2 mt-1">
              <input
                value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do site"
                className="flex-1 px-3 py-2 border border-input rounded-md text-sm"
              />
              <button onClick={() => sitesMut.mutate(search)} className="px-3 py-2 border border-input rounded-md hover:bg-accent">
                <Search className="h-4 w-4" />
              </button>
            </div>
            {sitesMut.data && (
              <div className="mt-2 border border-border rounded-md max-h-48 overflow-auto">
                {sitesMut.data.map((s) => (
                  <button
                    key={s.id} onClick={() => setSiteId(s.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${siteId === s.id ? "bg-accent" : ""}`}
                  >
                    <div className="font-medium">{s.displayName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.webUrl}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Site ID</label>
          <input value={siteId} onChange={(e) => setSiteId(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm font-mono" />
        </div>

        {drivesQ.data && drivesQ.data.length > 0 && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Biblioteca de documentos</label>
            <select value={driveId} onChange={(e) => setDriveId(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm bg-background">
              <option value="">Selecione...</option>
              {drivesQ.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Drive ID</label>
          <input value={driveId} onChange={(e) => setDriveId(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm font-mono" />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pasta destino</label>
          <input value={folder} onChange={(e) => setFolder(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm" placeholder="/Noriam" />
        </div>

        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {saveMut.isPending ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
