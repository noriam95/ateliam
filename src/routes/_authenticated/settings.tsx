import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getAppConfig,
  updateAppConfig,
  listSharePointSites,
  listSharePointDrives,
  getMe,
  listOrganizations,
  createOrganization,
  updateOrganization,
  listUserAccess,
  createUserAccess,
  updateMyProfile,
  updateUserAccess,
} from "@/lib/config.functions";
import { isDemoSessionActive } from "@/lib/demo-session";
import {
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowLeft,
  FlaskConical,
  ShieldCheck,
  UserRound,
  UserPlus,
  UsersRound,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { ThemeControl } from "@/components/theme-control";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const getCfg = useServerFn(getAppConfig);
  const updCfg = useServerFn(updateAppConfig);
  const sites = useServerFn(listSharePointSites);
  const drives = useServerFn(listSharePointDrives);
  const me = useServerFn(getMe);
  const listOrgs = useServerFn(listOrganizations);
  const createOrg = useServerFn(createOrganization);
  const updateOrg = useServerFn(updateOrganization);
  const updateProfile = useServerFn(updateMyProfile);
  const listAccess = useServerFn(listUserAccess);
  const updateAccess = useServerFn(updateUserAccess);
  const createAccess = useServerFn(createUserAccess);
  const [isDemo] = useState(() => isDemoSessionActive());

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => me(), enabled: !isDemo });
  const cfgQ = useQuery({ queryKey: ["cfg"], queryFn: () => getCfg(), enabled: !isDemo });
  const isMaestro = !isDemo && meQ.data?.roles?.includes("maestro");
  const isAdmin = !isDemo && meQ.data?.roles?.includes("admin");
  const canAdmin = isDemo || isMaestro || isAdmin;
  const organizationsQ = useQuery({
    queryKey: ["organizations"],
    queryFn: () => listOrgs(),
    enabled: !isDemo && canAdmin,
  });
  const usersQ = useQuery({
    queryKey: ["user-access"],
    queryFn: () => listAccess({ data: { organizationId: null } }),
    enabled: !isDemo && canAdmin,
  });

  const effectiveRoles = isDemo ? ["maestro", "admin", "editor"] : (meQ.data?.roles ?? []);
  const [siteId, setSiteId] = useState("");
  const [driveId, setDriveId] = useState("");
  const [folder, setFolder] = useState("/BFFlow");
  const [search, setSearch] = useState("");
  const [displayName, setDisplayName] = useState("Administrador local");
  const [demoUsers, setDemoUsers] = useState<UserAccessRow[]>(DEMO_USERS);
  const [demoOrganizations, setDemoOrganizations] = useState<OrganizationRow[]>(DEMO_ORGANIZATIONS);
  const [newOrg, setNewOrg] = useState({
    name: "",
    slug: "",
    logo_data_url: "",
    word_header_color: "1D1D1F",
  });
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    displayName: "",
    organizationId: "",
    role: "editor" as AppRole,
  });

  useEffect(() => {
    if (cfgQ.data?.config) {
      setSiteId(cfgQ.data.config.sharepoint_site_id ?? "");
      setDriveId(cfgQ.data.config.sharepoint_drive_id ?? "");
      setFolder(cfgQ.data.config.sharepoint_folder_path ?? "/BFFlow");
    }
  }, [cfgQ.data]);

  useEffect(() => {
    if (meQ.data?.profile?.display_name) setDisplayName(meQ.data.profile.display_name);
  }, [meQ.data?.profile?.display_name]);

  const organizationRows = isDemo
    ? demoOrganizations
    : ((organizationsQ.data ?? []) as OrganizationRow[]);
  const activeOrganizationId = isDemo
    ? demoOrganizations[0]?.id
    : meQ.data?.profile?.organization_id;

  useEffect(() => {
    if (!newUser.organizationId && activeOrganizationId) {
      setNewUser((current) => ({ ...current, organizationId: activeOrganizationId }));
    }
  }, [activeOrganizationId, newUser.organizationId]);

  const sitesMut = useMutation({ mutationFn: (q: string) => sites({ data: { query: q } }) });
  const drivesQ = useQuery({
    queryKey: ["drives", siteId],
    queryFn: () => drives({ data: { siteId } }),
    enabled: !isDemo && !!siteId && cfgQ.data?.connectorReady,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updCfg({
        data: {
          sharepoint_site_id: siteId,
          sharepoint_drive_id: driveId,
          sharepoint_folder_path: folder,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração salva");
      cfgQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profileMut = useMutation({
    mutationFn: () => updateProfile({ data: { display_name: displayName } }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      meQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accessMut = useMutation({
    mutationFn: (row: UserAccessRow) =>
      isDemo
        ? Promise.resolve(row)
        : updateAccess({
            data: {
              userId: row.id,
              displayName: row.display_name,
              organizationId: row.organization_id,
              roles: row.roles,
            },
          }),
    onSuccess: () => {
      toast.success(isDemo ? "Permissões ajustadas no teste local" : "Permissões atualizadas");
      usersQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      isDemo
        ? Promise.resolve({ ok: true })
        : createAccess({
            data: {
              email: newUser.email,
              password: newUser.password,
              displayName: newUser.displayName || null,
              organizationId: newUser.organizationId,
              roles: [newUser.role],
            },
          }),
    onSuccess: () => {
      if (isDemo) {
        setDemoUsers((rows) => [
          ...rows,
          {
            id: `demo-${Date.now()}`,
            email: newUser.email,
            display_name: newUser.displayName || newUser.email.split("@")[0],
            organization_id: newUser.organizationId || demoOrganizations[0].id,
            organization:
              demoOrganizations.find((org) => org.id === newUser.organizationId) ??
              demoOrganizations[0],
            roles: [newUser.role],
          },
        ]);
      }
      toast.success("Usuário cadastrado");
      setNewUser({
        email: "",
        password: "",
        displayName: "",
        organizationId: activeOrganizationId ?? "",
        role: "editor",
      });
      usersQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgCreateMut = useMutation({
    mutationFn: () =>
      isDemo
        ? Promise.resolve({
            ...newOrg,
            id: `demo-org-${Date.now()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: null,
          })
        : createOrg({ data: newOrg }),
    onSuccess: (row) => {
      if (isDemo) setDemoOrganizations((items) => [...items, row as OrganizationRow]);
      toast.success("Organização cadastrada");
      setNewOrg({ name: "", slug: "", logo_data_url: "", word_header_color: "1D1D1F" });
      organizationsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgUpdateMut = useMutation({
    mutationFn: (row: OrganizationRow) =>
      isDemo ? Promise.resolve(row) : updateOrg({ data: row }),
    onSuccess: (row) => {
      if (isDemo) {
        setDemoOrganizations((items) =>
          items.map((item) => (item.id === row.id ? (row as OrganizationRow) : item)),
        );
      }
      toast.success("Identidade da organização salva");
      organizationsQ.refetch();
      meQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const userRows = isDemo ? demoUsers : ((usersQ.data ?? []) as UserAccessRow[]);

  function changeRole(row: UserAccessRow, role: AppRole, checked: boolean) {
    const nextRoles = checked
      ? [...new Set([...row.roles, role])]
      : row.roles.filter((r) => r !== role);
    const next = { ...row, roles: nextRoles.length ? nextRoles : ["viewer"] };
    if (isDemo) setDemoUsers((rows) => rows.map((item) => (item.id === row.id ? next : item)));
    return next;
  }

  function updateDemoUserName(id: string, value: string) {
    setDemoUsers((rows) =>
      rows.map((item) => (item.id === id ? { ...item, display_name: value } : item)),
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 bg-primary text-primary-foreground flex items-center gap-3 px-4 border-b border-primary/20">
        <Link to="/" className="flex items-center gap-2 text-[12px] hover:opacity-80">
          <ArrowLeft className="h-4 w-4" /> Workspace
        </Link>
        <BFFlowMark className="ml-2 h-8" />
        <div className="ml-2 text-[15px] font-bold tracking-tight">
          Configurações
        </div>
      </header>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Perfil, permissões, acesso administrativo e integração SharePoint.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-base font-bold uppercase tracking-wider">
                Aparência
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                O tema escuro é o padrão. Você também pode usar o tema claro ou seguir o navegador.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ThemeControl />
          </div>
        </div>

        {isDemo && (
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <span className="font-medium">Modo de teste local ativo</span>
            </div>
            <p className="text-sm text-muted-foreground">
              As versões salvas durante o teste ficam no navegador. Entre com uma conta para usar
              Supabase, histórico em nuvem e SharePoint.
            </p>
          </div>
        )}

        {!isDemo && (
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              {cfgQ.data?.connectorReady ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-[var(--blue)]" />
                  <span className="font-medium">SharePoint conectado</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span className="font-medium">SharePoint não conectado</span>
                </>
              )}
            </div>
            {!cfgQ.data?.connectorReady && (
              <p className="text-sm text-muted-foreground">
                Conecte o Microsoft SharePoint na seção <strong>Connectors</strong> do projeto para
                habilitar gravação automática. Enquanto não estiver conectado, as versões ficam
                salvas apenas no banco do app.
              </p>
            )}
          </div>
        )}

        {!isDemo && !canAdmin && (
          <div className="bg-secondary border border-border rounded-lg p-4 text-sm text-muted-foreground">
            Apenas administradores da organização ou o Maestro BF Flow podem alterar essas
            configurações.
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-primary" />
                <h2 className="font-display text-base font-bold uppercase tracking-wider">
                  Perfil e acesso
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Ajuste sua identificação e confira o nível de permissão ativo.
              </p>
            </div>
            <RoleBadges roles={effectiveRoles as AppRole[]} />
          </div>

          <div className="grid md:grid-cols-[1fr_280px] gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Nome exibido
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                  disabled={isDemo}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  E-mail
                </label>
                <input
                  value={isDemo ? "admin.local@bfflow" : (meQ.data?.profile?.email ?? "")}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm bg-secondary"
                  disabled
                />
              </div>
              <button
                onClick={() =>
                  isDemo ? toast.info("Perfil local de demonstração") : profileMut.mutate()
                }
                disabled={profileMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {profileMut.isPending ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-secondary/45 p-4">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Permissões
              </div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Maestro BF Flow:</strong> gerencia o sistema e
                  todas as organizações.
                </p>
                <p>
                  <strong className="text-foreground">Admin:</strong> configura sistema e usuários.
                </p>
                <p>
                  <strong className="text-foreground">Editor:</strong> cria e versiona documentos.
                </p>
                <p>
                  <strong className="text-foreground">Viewer:</strong> consulta sem alterar.
                </p>
              </div>
            </div>
          </div>
        </div>

        {canAdmin && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-base font-bold uppercase tracking-wider">
                    Organizações e identidade
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Logo e cor do cabeçalho dos relatórios Word de Mapeamento e POP.
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {isDemo ? "Teste local" : isMaestro ? "Maestro BF Flow" : "Admin da organização"}
              </span>
            </div>

            {(isDemo || isMaestro) && (
              <div className="rounded-lg border border-border bg-secondary/35 p-4">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                  Cadastrar organização
                </h3>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_150px]">
                  <input
                    value={newOrg.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewOrg((current) => ({
                        ...current,
                        name,
                        slug:
                          current.slug ||
                          name
                            .normalize("NFD")
                            .replace(/[̀-ͯ]/g, "")
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, ""),
                      }));
                    }}
                    placeholder="Nome da organização"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={newOrg.slug}
                    onChange={(e) => setNewOrg((current) => ({ ...current, slug: e.target.value }))}
                    placeholder="slug"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    type="color"
                    value={`#${newOrg.word_header_color}`}
                    onChange={(e) =>
                      setNewOrg((current) => ({
                        ...current,
                        word_header_color: e.target.value.replace("#", "").toUpperCase(),
                      }))
                    }
                    className="h-10 rounded-md border border-input bg-background px-2"
                  />
                </div>
                <button
                  onClick={() => orgCreateMut.mutate()}
                  disabled={orgCreateMut.isPending || !newOrg.name || !newOrg.slug}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Cadastrar organização
                </button>
              </div>
            )}

            <div className="space-y-3">
              {organizationRows.map((org) => (
                <OrganizationIdentityItem
                  key={org.id}
                  row={org}
                  canEdit={isDemo || isMaestro || org.id === activeOrganizationId}
                  busy={orgUpdateMut.isPending}
                  onSave={(next) => orgUpdateMut.mutate(next)}
                />
              ))}
            </div>
          </div>
        )}

        {canAdmin && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-base font-bold uppercase tracking-wider">
                    Usuários e permissões
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Área administrativa para definir quem pode administrar, editar ou apenas
                  consultar.
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {isDemo ? "Teste local" : isMaestro ? "Maestro BF Flow" : "Admin"}
              </span>
            </div>

            <div className="rounded-lg border border-border bg-secondary/35 p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                  Cadastrar usuário
                </h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Usuário / e-mail
                  </label>
                  <input
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser((current) => ({ ...current, email: e.target.value }))
                    }
                    placeholder="usuario@empresa.com"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Organização
                  </label>
                  <select
                    value={newUser.organizationId}
                    onChange={(e) =>
                      setNewUser((current) => ({
                        ...current,
                        organizationId: e.target.value,
                      }))
                    }
                    disabled={!isDemo && !isMaestro}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:bg-secondary"
                  >
                    {organizationRows.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Senha inicial
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser((current) => ({ ...current, password: e.target.value }))
                    }
                    placeholder="mínimo 6 caracteres"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nome exibido
                  </label>
                  <input
                    value={newUser.displayName}
                    onChange={(e) =>
                      setNewUser((current) => ({ ...current, displayName: e.target.value }))
                    }
                    placeholder="Nome do usuário"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tipo de acesso
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser((current) => ({ ...current, role: e.target.value as AppRole }))
                    }
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {(Object.keys(ROLE_LABELS) as AppRole[])
                      .filter((role) => isDemo || isMaestro || role !== "maestro")
                      .map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !newUser.email || !newUser.password}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {createMut.isPending ? "Cadastrando..." : "Cadastrar usuário"}
              </button>
            </div>

            <div className="space-y-2">
              {userRows.map((row) => (
                <UserAccessItem
                  key={row.id}
                  row={row}
                  isDemo={isDemo}
                  organizations={organizationRows}
                  canGrantMaestro={isDemo || isMaestro}
                  canChangeOrganization={isDemo || isMaestro}
                  busy={accessMut.isPending}
                  onNameChange={updateDemoUserName}
                  onRoleChange={changeRole}
                  onSave={(next) => accessMut.mutate(next)}
                />
              ))}
              {!isDemo && usersQ.isLoading && (
                <div className="text-sm text-muted-foreground py-4">Carregando usuários...</div>
              )}
            </div>
          </div>
        )}

        <div
          className={`bg-card border border-border rounded-lg p-5 space-y-4 ${!isMaestro ? "opacity-60 pointer-events-none" : ""}`}
        >
          <h2 className="font-display text-base font-bold uppercase tracking-wider">
            Site e biblioteca global
          </h2>

          {cfgQ.data?.connectorReady && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Buscar site
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome do site"
                  className="flex-1 px-3 py-2 border border-input rounded-md text-sm"
                />
                <button
                  onClick={() => sitesMut.mutate(search)}
                  className="px-3 py-2 border border-input rounded-md hover:bg-accent"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
              {sitesMut.data && (
                <div className="mt-2 border border-border rounded-md max-h-48 overflow-auto">
                  {sitesMut.data.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSiteId(s.id)}
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Site ID
            </label>
            <input
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm font-mono"
            />
          </div>

          {drivesQ.data && drivesQ.data.length > 0 && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Biblioteca de documentos
              </label>
              <select
                value={driveId}
                onChange={(e) => setDriveId(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm bg-background"
              >
                <option value="">Selecione...</option>
                {drivesQ.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Drive ID
            </label>
            <input
              value={driveId}
              onChange={(e) => setDriveId(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pasta destino
            </label>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
              placeholder="/BFFlow"
            />
          </div>

          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saveMut.isPending ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AppRole = "maestro" | "admin" | "editor" | "viewer";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo_data_url: string | null;
  word_header_color: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type UserAccessRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  organization_id: string;
  organization?: Pick<OrganizationRow, "id" | "name" | "slug"> | null;
  roles: AppRole[];
};

const ROLE_LABELS: Record<AppRole, string> = {
  maestro: "Maestro BF Flow",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const DEMO_ORGANIZATIONS: OrganizationRow[] = [
  {
    id: "demo-org-bfflow",
    name: "BF Flow Demo",
    slug: "bfflow-demo",
    logo_data_url: null,
    word_header_color: "1D1D1F",
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_USERS: UserAccessRow[] = [
  {
    id: "demo-admin",
    email: "admin.local@bfflow",
    display_name: "Administrador local",
    organization_id: "demo-org-bfflow",
    organization: { id: "demo-org-bfflow", name: "BF Flow Demo", slug: "bfflow-demo" },
    roles: ["maestro", "admin", "editor"],
  },
  {
    id: "demo-editor",
    email: "editor.local@bfflow",
    display_name: "Analista de processos",
    organization_id: "demo-org-bfflow",
    organization: { id: "demo-org-bfflow", name: "BF Flow Demo", slug: "bfflow-demo" },
    roles: ["editor"],
  },
  {
    id: "demo-viewer",
    email: "consulta.local@bfflow",
    display_name: "Usuário consulta",
    organization_id: "demo-org-bfflow",
    organization: { id: "demo-org-bfflow", name: "BF Flow Demo", slug: "bfflow-demo" },
    roles: ["viewer"],
  },
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function RoleBadges({ roles }: { roles: AppRole[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(roles.length ? roles : ["viewer"]).map((role) => (
        <span
          key={role}
          className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground"
        >
          {ROLE_LABELS[role]}
        </span>
      ))}
    </div>
  );
}

function UserAccessItem({
  row,
  isDemo,
  organizations,
  canGrantMaestro,
  canChangeOrganization,
  busy,
  onNameChange,
  onRoleChange,
  onSave,
}: {
  row: UserAccessRow;
  isDemo: boolean;
  organizations: OrganizationRow[];
  canGrantMaestro: boolean;
  canChangeOrganization: boolean;
  busy: boolean;
  onNameChange: (id: string, value: string) => void;
  onRoleChange: (row: UserAccessRow, role: AppRole, checked: boolean) => UserAccessRow;
  onSave: (row: UserAccessRow) => void;
}) {
  const [draft, setDraft] = useState(row);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  function setRole(role: AppRole, checked: boolean) {
    const next = onRoleChange(draft, role, checked);
    setDraft(next);
  }

  function setName(value: string) {
    const next = { ...draft, display_name: value };
    setDraft(next);
    if (isDemo) onNameChange(row.id, value);
  }

  function setOrganization(organizationId: string) {
    const organization = organizations.find((org) => org.id === organizationId) ?? null;
    setDraft({ ...draft, organization_id: organizationId, organization });
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_180px_auto_auto] lg:items-center">
        <div className="min-w-0">
          <input
            value={draft.display_name ?? ""}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-0 bg-transparent p-0 text-sm font-medium outline-none"
          />
          <div className="truncate text-[12px] text-muted-foreground">{draft.email}</div>
        </div>
        <select
          value={draft.organization_id}
          onChange={(e) => setOrganization(e.target.value)}
          disabled={!canChangeOrganization}
          className="rounded-md border border-input bg-background px-2.5 py-2 text-[12px] disabled:bg-secondary"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROLE_LABELS) as AppRole[])
            .filter((role) => canGrantMaestro || role !== "maestro")
            .map((role) => (
              <label
                key={role}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px]"
              >
                <input
                  type="checkbox"
                  checked={draft.roles.includes(role)}
                  onChange={(e) => setRole(role, e.target.checked)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
        </div>
        <button
          onClick={() => onSave(draft)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-[12px] font-medium hover:bg-accent disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Salvar
        </button>
      </div>
    </div>
  );
}

function OrganizationIdentityItem({
  row,
  canEdit,
  busy,
  onSave,
}: {
  row: OrganizationRow;
  canEdit: boolean;
  busy: boolean;
  onSave: (row: OrganizationRow) => void;
}) {
  const [draft, setDraft] = useState(row);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try {
      const logoDataUrl = await fileToDataUrl(file);
      setDraft((current) => ({ ...current, logo_data_url: logoDataUrl }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a logo.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-[88px_1fr_150px_auto] md:items-end">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border border-border bg-secondary">
          {draft.logo_data_url ? (
            <img
              src={draft.logo_data_url}
              alt={draft.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Logo
            </span>
          )}
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Organização
          </label>
          <input
            value={draft.name}
            onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
            disabled={!canEdit}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm disabled:bg-secondary"
          />
          <input
            value={draft.slug}
            onChange={(e) => setDraft((current) => ({ ...current, slug: e.target.value }))}
            disabled={!canEdit}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs text-muted-foreground disabled:bg-secondary"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cor Word
          </label>
          <input
            type="color"
            value={`#${draft.word_header_color || "1D1D1F"}`}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                word_header_color: e.target.value.replace("#", "").toUpperCase(),
              }))
            }
            disabled={!canEdit}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 disabled:bg-secondary"
          />
        </div>
        <div className="grid gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input px-3 py-2 text-[12px] font-medium hover:bg-accent">
            Alterar logo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!canEdit}
              onChange={(e) => {
                pickLogo(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button
            onClick={() => onSave(draft)}
            disabled={!canEdit || busy}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Salvar identidade
          </button>
        </div>
      </div>
    </div>
  );
}
