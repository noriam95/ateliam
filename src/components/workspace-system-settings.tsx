import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  FileCode2,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  Presentation,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AteliamMark } from "@/components/ateliam-mark";
import {
  createOrganization,
  createUserAccess,
  listAccessibleOrganizations,
  listOrganizationDocumentModels,
  listUserAccess,
  saveOrganizationDocumentModel,
  updateOrganization,
  updateUserAccess,
} from "@/lib/config.functions";
import { DEFAULT_DOCUMENT_MODELS, type DocumentModelRow } from "@/lib/document-models";

export type WorkspaceSystemSettingsView = "users" | "organizations" | "document-models";

type AppRole = "maestro" | "admin" | "editor" | "viewer";
type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo_data_url: string | null;
  word_header_color: string;
  created_at?: string;
  updated_at?: string;
};
type UserAccessRow = {
  id: string;
  email: string;
  display_name: string | null;
  organization_id: string | null;
  organization: { id: string; name: string; slug?: string } | null;
  roles: string[];
  organization_access?: Array<{
    organization_id: string;
    is_default: boolean;
    organization: { id: string; name: string; slug?: string } | null;
  }>;
};
const DEMO_ORGANIZATION_LOGO_KEY = "ateliam-demo-organization-logo";
const DEMO_DOCUMENT_MODELS_KEY = "ateliam-demo-document-models";

function readDemoDocumentModels() {
  if (typeof window === "undefined") return DEFAULT_DOCUMENT_MODELS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DEMO_DOCUMENT_MODELS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return DEFAULT_DOCUMENT_MODELS;
    return mergeDocumentModels(stored as DocumentModelRow[]);
  } catch {
    return DEFAULT_DOCUMENT_MODELS;
  }
}

function mergeDocumentModels(rows: DocumentModelRow[]) {
  return DEFAULT_DOCUMENT_MODELS.map((fallback) => ({
    ...fallback,
    ...rows.find((row) => row.model_key === fallback.model_key),
  }));
}

const roleLabels: Record<AppRole, string> = {
  maestro: "Maestro Ateliam",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Consulta",
};

export function WorkspaceSystemSettings({
  view,
  isDemo,
  organizationName,
  organizationId,
}: {
  view: WorkspaceSystemSettingsView;
  isDemo: boolean;
  organizationName: string;
  organizationId?: string | null;
}) {
  const queryClient = useQueryClient();
  const listOrgs = useServerFn(listAccessibleOrganizations);
  const createOrg = useServerFn(createOrganization);
  const updateOrg = useServerFn(updateOrganization);
  const listUsers = useServerFn(listUserAccess);
  const createUser = useServerFn(createUserAccess);
  const updateUser = useServerFn(updateUserAccess);
  const listDocumentModels = useServerFn(listOrganizationDocumentModels);
  const saveDocumentModel = useServerFn(saveOrganizationDocumentModel);

  const [demoOrganizations, setDemoOrganizations] = useState<OrganizationRow[]>(() => {
    const fallback = [
      {
        id: "demo-bom-futuro",
        name: "Bom Futuro",
        slug: "bom-futuro",
        logo_data_url:
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem(DEMO_ORGANIZATION_LOGO_KEY),
        word_header_color: "1D1D1F",
      },
      {
        id: "demo-ateliam-lab",
        name: "Ateliam Lab",
        slug: "ateliam-lab",
        logo_data_url: null,
        word_header_color: "1D1F23",
      },
    ];
    if (typeof window === "undefined") return fallback;
    try {
      const stored = JSON.parse(window.localStorage.getItem("ateliam-demo-organizations") ?? "[]");
      return Array.isArray(stored) && stored.length ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const [demoUsers, setDemoUsers] = useState<UserAccessRow[]>([
    {
      id: "demo-admin",
      email: "analista.local@ateliam",
      display_name: "Administrador local",
      organization_id: "demo-bom-futuro",
      organization: { id: "demo-bom-futuro", name: "Bom Futuro" },
      roles: ["admin"],
      organization_access: [
        {
          organization_id: "demo-bom-futuro",
          is_default: true,
          organization: { id: "demo-bom-futuro", name: "Bom Futuro" },
        },
        {
          organization_id: "demo-ateliam-lab",
          is_default: false,
          organization: { id: "demo-ateliam-lab", name: "Ateliam Lab" },
        },
      ],
    },
  ]);
  const [demoDocumentModels, setDemoDocumentModels] =
    useState<DocumentModelRow[]>(readDemoDocumentModels);

  const organizationsQ = useQuery({
    queryKey: ["workspace-system-organizations"],
    queryFn: () => listOrgs(),
    enabled: !isDemo && (view === "organizations" || view === "users"),
  });
  const usersQ = useQuery({
    queryKey: ["workspace-system-users", organizationId],
    queryFn: () => listUsers({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo && view === "users",
  });
  const documentModelsQ = useQuery({
    queryKey: ["workspace-document-models", organizationId],
    queryFn: () => listDocumentModels({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo && view === "document-models",
  });
  const organizations = isDemo
    ? demoOrganizations
    : ((organizationsQ.data ?? []) as OrganizationRow[]);
  const users = isDemo ? demoUsers : ((usersQ.data ?? []) as UserAccessRow[]);

  if (view === "document-models") {
    const rows = isDemo
      ? demoDocumentModels
      : mergeDocumentModels((documentModelsQ.data ?? []) as DocumentModelRow[]);
    return (
      <DocumentModelsSettings
        organizationName={organizationName}
        rows={rows}
        loading={documentModelsQ.isLoading && !isDemo}
        error={documentModelsQ.error}
        onSave={async (draft) => {
          if (isDemo) {
            const next = mergeDocumentModels([
              ...demoDocumentModels.filter((item) => item.model_key !== draft.model_key),
              draft,
            ]);
            setDemoDocumentModels(next);
            window.localStorage.setItem(DEMO_DOCUMENT_MODELS_KEY, JSON.stringify(next));
            window.dispatchEvent(new Event("ateliam-document-models-changed"));
            return draft;
          }
          const row = (await saveDocumentModel({
            data: { ...draft, organizationId: organizationId ?? null },
          })) as DocumentModelRow;
          await documentModelsQ.refetch();
          await queryClient.invalidateQueries({ queryKey: ["module-document-models"] });
          return row;
        }}
      />
    );
  }

  if (view === "organizations") {
    return (
      <OrganizationsSettings
        rows={organizations}
        loading={organizationsQ.isLoading && !isDemo}
        error={organizationsQ.error}
        onSave={async (draft) => {
          if (isDemo) {
            const row: OrganizationRow = draft.id
              ? { ...draft, id: draft.id }
              : { ...draft, id: `demo-org-${Date.now()}` };
            setDemoOrganizations((current) => {
              const next = draft.id
                ? current.map((item) => (item.id === draft.id ? row : item))
                : [...current, row];
              window.localStorage.setItem("ateliam-demo-organizations", JSON.stringify(next));
              window.dispatchEvent(new Event("ateliam-organizations-changed"));
              return next;
            });
            if (!draft.id || draft.id === "demo-bom-futuro") {
              if (row.logo_data_url) {
                window.localStorage.setItem(DEMO_ORGANIZATION_LOGO_KEY, row.logo_data_url);
              } else {
                window.localStorage.removeItem(DEMO_ORGANIZATION_LOGO_KEY);
              }
              window.dispatchEvent(new Event("ateliam-organization-brand-changed"));
            }
            return row;
          }
          const row = draft.id
            ? await updateOrg({ data: { ...draft, id: draft.id } })
            : await createOrg({
                data: {
                  name: draft.name,
                  slug: draft.slug,
                  logo_data_url: draft.logo_data_url,
                  word_header_color: draft.word_header_color,
                },
              });
          await organizationsQ.refetch();
          await queryClient.invalidateQueries({ queryKey: ["organization-dashboard"] });
          return row as OrganizationRow;
        }}
      />
    );
  }

  return (
    <UsersSettings
      rows={users}
      organizations={organizations}
      loading={(usersQ.isLoading || organizationsQ.isLoading) && !isDemo}
      error={usersQ.error ?? organizationsQ.error}
      onSave={async (draft) => {
        if (isDemo) {
          const organization = organizations.find((item) => item.id === draft.organizationId);
          const organizationAccess = draft.organizationIds.map((allowedOrganizationId) => {
            const allowedOrganization = organizations.find(
              (item) => item.id === allowedOrganizationId,
            );
            return {
              organization_id: allowedOrganizationId,
              is_default: allowedOrganizationId === draft.organizationId,
              organization: allowedOrganization
                ? {
                    id: allowedOrganization.id,
                    name: allowedOrganization.name,
                    slug: allowedOrganization.slug,
                  }
                : null,
            };
          });
          const row: UserAccessRow = {
            id: draft.id || `demo-user-${Date.now()}`,
            email: draft.email,
            display_name: draft.displayName || null,
            organization_id: draft.organizationId || null,
            organization: organization
              ? { id: organization.id, name: organization.name, slug: organization.slug }
              : null,
            roles: [draft.role],
            organization_access: organizationAccess,
          };
          setDemoUsers((current) =>
            draft.id
              ? current.map((item) => (item.id === draft.id ? row : item))
              : [...current, row],
          );
          return;
        }
        if (draft.id) {
          await updateUser({
            data: {
              userId: draft.id,
              displayName: draft.displayName || null,
              organizationId: draft.organizationId || null,
              organizationIds: draft.organizationIds,
              roles: [draft.role],
            },
          });
        } else {
          await createUser({
            data: {
              email: draft.email,
              password: draft.password,
              displayName: draft.displayName || null,
              organizationId: draft.organizationId || null,
              organizationIds: draft.organizationIds,
              roles: [draft.role],
            },
          });
        }
        await usersQ.refetch();
      }}
    />
  );
}

type OrganizationDraft = OrganizationRow;

function OrganizationsSettings({
  rows,
  loading,
  error,
  onSave,
}: {
  rows: OrganizationRow[];
  loading: boolean;
  error: unknown;
  onSave: (draft: OrganizationDraft) => Promise<OrganizationRow>;
}) {
  const emptyDraft = (): OrganizationDraft => ({
    id: "",
    name: "",
    slug: "",
    logo_data_url: null,
    word_header_color: "1D1F23",
  });
  const [draft, setDraft] = useState<OrganizationDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const saveMut = useMutation({
    mutationFn: () => onSave(draft),
    onSuccess: (row) => {
      toast.success(draft.id ? "Organização atualizada." : "Organização cadastrada.");
      setDraft(row);
      setFormOpen(false);
    },
    onError: (cause: Error) => toast.error(cause.message),
  });
  function selectLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem para a logo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((current) => ({ ...current, logo_data_url: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <SettingsSurface
      eyebrow="configurações · administração"
      title="Organizações"
      description="Gerencie a identidade e a personalização dos documentos de cada organização."
      action={
        <button
          onClick={() => {
            setDraft(emptyDraft());
            setFormOpen(true);
          }}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" /> Nova organização
        </button>
      }
    >
      <div
        className={`grid gap-4 ${formOpen ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]" : ""}`}
      >
        <DataTableFrame loading={loading} error={error} empty={!rows.length}>
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Organização</th>
                <th className="px-3 py-3">Identificador</th>
                <th className="px-3 py-3">Cor institucional</th>
                <th className="w-20 px-3 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <OrganizationLogo row={row} />
                      <span className="font-semibold">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.slug}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span
                        className="h-4 w-4 rounded-sm border border-border"
                        style={{ backgroundColor: `#${row.word_header_color}` }}
                      />
                      #{row.word_header_color}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(row);
                        setFormOpen(true);
                      }}
                      className={iconButtonClass}
                      title="Editar organização"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>

        {formOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMut.mutate();
            }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <OrganizationLogo row={draft} large />
              <div>
                <div className="font-display text-lg font-bold">
                  {draft.id ? "Editar organização" : "Nova organização"}
                </div>
                <div className="text-xs text-muted-foreground">Identidade institucional</div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar formulário"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <FormField label="Nome da organização">
                <input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField label="Identificador">
                <input
                  required
                  value={draft.slug}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, slug: event.target.value }))
                  }
                  className={inputClass}
                  placeholder="ex.: bom-futuro"
                />
              </FormField>
              <FormField label="Cor institucional da organização">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={`#${draft.word_header_color}`}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        word_header_color: event.target.value.slice(1).toUpperCase(),
                      }))
                    }
                    className="h-10 w-12 rounded-md border border-input bg-background p-1"
                  />
                  <input
                    value={draft.word_header_color}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        word_header_color: event.target.value
                          .replace(/[^0-9a-f]/gi, "")
                          .slice(0, 6)
                          .toUpperCase(),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </FormField>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
                <ImagePlus className="h-4 w-4" /> Adicionar logo
                <input type="file" accept="image/*" className="hidden" onChange={selectLogo} />
              </label>
              <button
                type="submit"
                disabled={saveMut.isPending || !draft.name.trim() || !draft.slug.trim()}
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Salvando..." : "Salvar organização"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SettingsSurface>
  );
}

type UserDraft = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  organizationId: string;
  organizationIds: string[];
  role: AppRole;
};

function UsersSettings({
  rows,
  organizations,
  loading,
  error,
  onSave,
}: {
  rows: UserAccessRow[];
  organizations: OrganizationRow[];
  loading: boolean;
  error: unknown;
  onSave: (draft: UserDraft) => Promise<void>;
}) {
  const emptyDraft = (): UserDraft => ({
    id: "",
    email: "",
    password: "",
    displayName: "",
    organizationId: organizations[0]?.id ?? "",
    organizationIds: organizations[0]?.id ? [organizations[0].id] : [],
    role: "viewer",
  });
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const saveMut = useMutation({
    mutationFn: () => onSave(draft),
    onSuccess: () => {
      toast.success(draft.id ? "Acesso atualizado." : "Usuário cadastrado.");
      setDraft(emptyDraft());
      setFormOpen(false);
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  function edit(row: UserAccessRow) {
    const role = row.roles.find((item): item is AppRole => item in roleLabels) ?? "viewer";
    const accesses = row.organization_access ?? [];
    const defaultAccess = accesses.find((item) => item.is_default);
    const defaultOrganizationId =
      defaultAccess?.organization_id ?? row.organization_id ?? organizations[0]?.id ?? "";
    setDraft({
      id: row.id,
      email: row.email,
      password: "",
      displayName: row.display_name ?? "",
      organizationId: defaultOrganizationId,
      organizationIds: accesses.length
        ? accesses.map((item) => item.organization_id)
        : defaultOrganizationId
          ? [defaultOrganizationId]
          : [],
      role,
    });
    setFormOpen(true);
  }

  function toggleOrganization(organizationId: string) {
    setDraft((current) => {
      const selected = current.organizationIds.includes(organizationId)
        ? current.organizationIds.filter((item) => item !== organizationId)
        : [...current.organizationIds, organizationId];
      const nextOrganizationId = selected.includes(current.organizationId)
        ? current.organizationId
        : (selected[0] ?? "");
      return {
        ...current,
        organizationIds: selected,
        organizationId: nextOrganizationId,
      };
    });
  }

  return (
    <SettingsSurface
      eyebrow="configurações · acesso"
      title="Usuários e permissões"
      description="Cadastre usuários, defina as organizações acessíveis e atribua o nível de permissão."
      action={
        <button
          onClick={() => {
            setDraft(emptyDraft());
            setFormOpen(true);
          }}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" /> Novo usuário
        </button>
      }
    >
      <div
        className={`grid gap-4 ${formOpen ? "xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]" : ""}`}
      >
        <DataTableFrame loading={loading} error={error} empty={!rows.length}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-3 py-3">Organização</th>
                <th className="px-3 py-3">Tipo de acesso</th>
                <th className="w-20 px-3 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.display_name || row.email}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {(row.organization_access ?? [])
                      .map((access) => access.organization?.name)
                      .filter(Boolean)
                      .join(", ") ||
                      row.organization?.name ||
                      "Sem organização"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((role) => (
                        <span
                          key={role}
                          className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-[var(--gold)]"
                        >
                          {roleLabels[role as AppRole] ?? role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => edit(row)}
                      className={iconButtonClass}
                      title="Editar usuário"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>

        {formOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMut.mutate();
            }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-accent text-[var(--gold)]">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-lg font-bold">
                  {draft.id ? "Editar usuário" : "Novo usuário"}
                </div>
                <div className="text-xs text-muted-foreground">Identidade e permissão</div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar formulário"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <FormField label="Nome">
                <input
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField label="E-mail">
                <input
                  required
                  type="email"
                  disabled={!!draft.id}
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  className={inputClass}
                />
              </FormField>
              {!draft.id ? (
                <FormField label="Senha inicial">
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={draft.password}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, password: event.target.value }))
                    }
                    className={inputClass}
                  />
                </FormField>
              ) : null}
              <div className="grid gap-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Organizações permitidas
                </div>
                <div className="grid gap-1.5 rounded-md border border-border bg-background/55 p-3">
                  {organizations.map((organization) => (
                    <label key={organization.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.organizationIds.includes(organization.id)}
                        onChange={() => toggleOrganization(organization.id)}
                      />
                      {organization.name}
                    </label>
                  ))}
                </div>
              </div>
              <FormField label="Organização padrão">
                <select
                  value={draft.organizationId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      organizationId: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Selecione</option>
                  {organizations
                    .filter((organization) => draft.organizationIds.includes(organization.id))
                    .map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Tipo de acesso">
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, role: event.target.value as AppRole }))
                  }
                  className={inputClass}
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
              <button
                type="submit"
                disabled={
                  saveMut.isPending ||
                  !draft.email.trim() ||
                  !draft.organizationId ||
                  !draft.organizationIds.length
                }
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Salvando..." : "Salvar usuário"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SettingsSurface>
  );
}

function DocumentModelsSettings({
  organizationName,
  rows,
  loading,
  error,
  onSave,
}: {
  organizationName: string;
  rows: DocumentModelRow[];
  loading: boolean;
  error: unknown;
  onSave: (draft: DocumentModelRow) => Promise<DocumentModelRow>;
}) {
  const [selectedKey, setSelectedKey] = useState<DocumentModelRow["model_key"]>("ddp-word");
  const [draft, setDraft] = useState<DocumentModelRow>(rows[0] ?? DEFAULT_DOCUMENT_MODELS[0]);
  const [formOpen, setFormOpen] = useState(false);
  const saveMut = useMutation({
    mutationFn: () => onSave(draft),
    onSuccess: (row) => {
      setDraft(row);
      setFormOpen(false);
      toast.success("Modelo atualizado e conectado às próximas exportações.");
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  useEffect(() => {
    const selected = rows.find((row) => row.model_key === selectedKey);
    if (selected) setDraft(selected);
  }, [rows, selectedKey]);

  const metadata = modelMetadata(draft.model_key);

  function selectLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem para a logo do documento.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((current) => ({ ...current, logo_data_url: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <SettingsSurface
      eyebrow="configurações · documentos"
      title="Modelos de documentos"
      description="Configure individualmente a identidade usada nas exportações Word e HTML da organização."
    >
      <div
        className={`grid gap-4 ${formOpen ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]" : ""}`}
      >
        <DataTableFrame loading={loading} error={error} empty={!rows.length}>
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-3 py-3">Módulo</th>
                <th className="px-3 py-3">Formato</th>
                <th className="w-20 px-3 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => {
                const item = modelMetadata(model.model_key);
                return (
                  <tr
                    key={model.model_key}
                    className={`border-t border-border ${formOpen && selectedKey === model.model_key ? "bg-accent/55" : "hover:bg-muted/45"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-[var(--gold)]">
                          {item.icon}
                        </span>
                        <span className="font-semibold">{model.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.module}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.format}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKey(model.model_key);
                          setDraft(model);
                          setFormOpen(true);
                        }}
                        className={iconButtonClass}
                        title="Editar modelo"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTableFrame>
        {formOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMut.mutate();
            }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-accent text-[var(--gold)]">
                  {metadata.icon}
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {metadata.module}
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold">Editar modelo</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-12 rounded-full"
                  style={{ backgroundColor: `#${draft.primary_color}` }}
                  title={`Cor #${draft.primary_color}`}
                />
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Fechar formulário"
                  aria-label="Fechar formulário"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <FormField label="Nome do modelo">
                <input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField label="Descrição">
                <textarea
                  rows={3}
                  value={draft.description ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  className={`${inputClass} h-auto py-2`}
                />
              </FormField>
              <FormField label="Cor institucional do modelo">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={`#${draft.primary_color}`}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        primary_color: event.target.value.slice(1).toUpperCase(),
                      }))
                    }
                    className="h-10 w-12 rounded-md border border-input bg-background p-1"
                  />
                  <input
                    value={draft.primary_color}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        primary_color: event.target.value
                          .replace(/[^0-9a-f]/gi, "")
                          .slice(0, 6)
                          .toUpperCase(),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </FormField>

              <div className="rounded-md border border-border bg-background/55 p-3">
                <div className="text-xs font-semibold text-muted-foreground">Logo do documento</div>
                <div className="mt-3 flex items-center gap-3">
                  {draft.logo_data_url ? (
                    <img
                      src={draft.logo_data_url}
                      alt="Logo configurada para o documento"
                      className="h-14 w-28 rounded-md border border-border bg-white object-contain p-1"
                    />
                  ) : (
                    <span className="flex h-14 w-28 items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card text-sm font-bold">
                      <AteliamMark className="h-7 w-7" /> Ateliam
                    </span>
                  )}
                  <div className="flex gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted">
                      <ImagePlus className="h-4 w-4" /> Alterar
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={selectLogo}
                      />
                    </label>
                    {draft.logo_data_url ? (
                      <button
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, logo_data_url: null }))}
                        className={iconButtonClass}
                        title="Usar logo padrão do Ateliam"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Esta logo será incorporada somente às exportações deste modelo. Sem imagem, o
                  Ateliam será usado como padrão.
                </p>
              </div>

              <div className="divide-y divide-border border-y border-border text-sm">
                <ModelDetail label="Formato" value={metadata.format} />
                <ModelDetail label="Organização" value={organizationName} />
                <ModelDetail label="Versionamento" value="Automático a partir do documento" />
              </div>
              <button
                type="submit"
                disabled={
                  saveMut.isPending || !draft.name.trim() || draft.primary_color.length !== 6
                }
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Salvando..." : "Salvar modelo"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SettingsSurface>
  );
}

function modelMetadata(key: DocumentModelRow["model_key"]) {
  if (key === "ddp-html") {
    return {
      module: "Mapeamento",
      format: "HTML interativo",
      icon: <Presentation className="h-5 w-5" />,
    };
  }
  if (key === "pop-word") {
    return {
      module: "Documentação",
      format: "Word editável",
      icon: <FileCode2 className="h-5 w-5" />,
    };
  }
  return {
    module: "Mapeamento",
    format: "Word editável",
    icon: <FileText className="h-5 w-5" />,
  };
}

function SettingsSurface({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
            {eyebrow}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function DataTableFrame({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Carregando registros...
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {error instanceof Error ? error.message : "Não foi possível carregar os registros."}
      </div>
    );
  if (empty)
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhum registro cadastrado.
      </div>
    );
  return <div className="overflow-x-auto rounded-lg border border-border bg-card">{children}</div>;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function OrganizationLogo({
  row,
  large = false,
}: {
  row: Pick<OrganizationRow, "name" | "logo_data_url">;
  large?: boolean;
}) {
  const size = large ? "h-12 w-12" : "h-9 w-9";
  return row.logo_data_url ? (
    <img
      src={row.logo_data_url}
      alt=""
      className={`${size} rounded-md border border-border object-contain`}
    />
  ) : (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]`}
    >
      <Building2 className={large ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

function ModelDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
const iconButtonClass =
  "grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";
