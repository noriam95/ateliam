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
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

// Busca + ordenação reutilizáveis para as tabelas de Configurações,
// no mesmo padrão das tabelas de cadastro.
function useSettingsTable<T>(
  rows: T[],
  getSearchText: (row: T) => string[],
  sortKeys: ((row: T) => string)[],
) {
  const [search, setSearch] = useState("");
  const [sortIdx, setSortIdx] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q
      ? rows.filter((row) => getSearchText(row).join(" ").toLowerCase().includes(q))
      : rows;
    if (sortIdx !== null && sortKeys[sortIdx]) {
      const dir = sortDir === "asc" ? 1 : -1;
      const key = sortKeys[sortIdx];
      result = [...result].sort(
        (a, b) => key(a).localeCompare(key(b), "pt-BR", { numeric: true }) * dir,
      );
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, sortIdx, sortDir]);
  const toggleSort = (i: number) => {
    if (sortIdx === i) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortIdx(i);
      setSortDir("asc");
    }
  };
  return { search, setSearch, displayRows, sortIdx, sortDir, toggleSort };
}

function SettingsTableSearch({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">
        {count} {count === 1 ? "registro" : "registros"}
      </span>
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filtrar / pesquisar..."
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
        />
      </div>
    </div>
  );
}

function SortTh({
  label,
  index,
  sortIdx,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  index: number;
  sortIdx: number | null;
  sortDir: "asc" | "desc";
  onSort: (index: number) => void;
  className?: string;
}) {
  const active = sortIdx === index;
  return (
    <th className={`px-4 py-3 font-semibold ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(index)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <span className={active ? "opacity-90" : "opacity-30"}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
import { toast } from "sonner";
import { BFFlowMark } from "@/components/bf-flow-mark";
import {
  createOrganization,
  createUserAccess,
  deleteOrganization,
  deleteUserAccess,
  listAccessibleOrganizations,
  listOrganizationDocumentModels,
  listUserAccess,
  saveOrganizationDocumentModel,
  updateOrganization,
  updateUserAccess,
} from "@/lib/config.functions";
import { DEFAULT_DOCUMENT_MODELS, type DocumentModelRow } from "@/lib/document-models";
import {
  type CodeSettings,
  type DocType,
  normalizeCodeSettings,
  previewDocumentCode,
} from "@/lib/code-generation";

export type WorkspaceSystemSettingsView = "users" | "organizations" | "document-models";

type AppRole = "admin" | "editor" | "viewer";
type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo_data_url: string | null;
  word_header_color: string;
  code_settings?: CodeSettings | null;
  created_at?: string;
  updated_at?: string;
};
type UserAccessRow = {
  id: string;
  email: string;
  username: string | null;
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

function normalizeHex(value: string | null | undefined, fallback = "1D1F23") {
  const normalized = (value ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
  return normalized.length === 6 ? normalized : fallback;
}

function isHexCode(value: string | null | undefined) {
  return /^[0-9A-F]{6}$/i.test(value ?? "");
}

function defaultModelsForOrganization(color: string) {
  const primaryColor = normalizeHex(color);
  return DEFAULT_DOCUMENT_MODELS.map((model) => ({
    ...model,
    primary_color: primaryColor,
  }));
}

const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Consulta",
};

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4 text-foreground shadow-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            title="Fechar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  const deleteOrg = useServerFn(deleteOrganization);
  const listUsers = useServerFn(listUserAccess);
  const createUser = useServerFn(createUserAccess);
  const updateUser = useServerFn(updateUserAccess);
  const deleteUser = useServerFn(deleteUserAccess);
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
        id: "demo-bfflow-lab",
        name: "BF Flow Lab",
        slug: "bf-flow-lab",
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
      email: "analista.local@bfflow",
      username: "analista.local",
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
          organization_id: "demo-bfflow-lab",
          is_default: false,
          organization: { id: "demo-bfflow-lab", name: "BF Flow Lab" },
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
        isDemo={isDemo}
        rows={organizations}
        loading={organizationsQ.isLoading && !isDemo}
        error={organizationsQ.error}
        demoDocumentModels={demoDocumentModels}
        setDemoDocumentModels={setDemoDocumentModels}
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
                  code_settings: draft.code_settings,
                },
              });
          await organizationsQ.refetch();
          await queryClient.invalidateQueries({ queryKey: ["organization-dashboard"] });
          return row as OrganizationRow;
        }}
        onDelete={async (row) => {
          if (isDemo) {
            if (row.id === "demo-bom-futuro") {
              throw new Error(
                "Não é possível excluir: existem cadastros vinculados a esta organização.",
              );
            }
            setDemoOrganizations((current) => {
              const next = current.filter((item) => item.id !== row.id);
              window.localStorage.setItem("ateliam-demo-organizations", JSON.stringify(next));
              window.dispatchEvent(new Event("ateliam-organizations-changed"));
              return next;
            });
            return;
          }
          await deleteOrg({ data: { id: row.id } });
          await organizationsQ.refetch();
          await queryClient.invalidateQueries({ queryKey: ["organization-dashboard"] });
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
            username: draft.username || null,
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
          const password = draft.password.trim();
          if (password && password.length < 6) {
            throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
          }
          if (password && password !== draft.passwordConfirmation) {
            throw new Error("A confirmação da nova senha não confere.");
          }
          await updateUser({
            data: {
              userId: draft.id,
              username: draft.username || null,
              password: password || null,
              displayName: draft.displayName || null,
              organizationId: draft.organizationId || null,
              organizationIds: draft.organizationIds,
              roles: [draft.role],
            },
          });
        } else {
          if (draft.password !== draft.passwordConfirmation) {
            throw new Error("A confirmação da senha inicial não confere.");
          }
          await createUser({
            data: {
              email: draft.email,
              username: draft.username || null,
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
      onDelete={async (row) => {
        if (isDemo) {
          setDemoUsers((current) => current.filter((item) => item.id !== row.id));
          return;
        }
        await deleteUser({ data: { userId: row.id } });
        await usersQ.refetch();
      }}
    />
  );
}

type OrganizationDraft = OrganizationRow;

function OrganizationsSettings({
  isDemo,
  rows,
  loading,
  error,
  demoDocumentModels,
  setDemoDocumentModels,
  onSave,
  onDelete,
}: {
  isDemo: boolean;
  rows: OrganizationRow[];
  loading: boolean;
  error: unknown;
  demoDocumentModels: DocumentModelRow[];
  setDemoDocumentModels: Dispatch<SetStateAction<DocumentModelRow[]>>;
  onSave: (draft: OrganizationDraft) => Promise<OrganizationRow>;
  onDelete: (row: OrganizationRow) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const listDocumentModels = useServerFn(listOrganizationDocumentModels);
  const saveDocumentModel = useServerFn(saveOrganizationDocumentModel);
  const [pendingDelete, setPendingDelete] = useState<OrganizationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const emptyDraft = (): OrganizationDraft => ({
    id: "",
    name: "",
    slug: "",
    logo_data_url: null,
    word_header_color: "1D1F23",
  });
  const [draft, setDraft] = useState<OrganizationDraft>(emptyDraft);
  const [draftModels, setDraftModels] = useState<DocumentModelRow[]>(() =>
    mergeDocumentModels(DEFAULT_DOCUMENT_MODELS),
  );
  const [formOpen, setFormOpen] = useState(false);
  const selectedDocumentOrganizationId = draft.id || null;
  const documentModelsQ = useQuery({
    queryKey: ["workspace-document-models", selectedDocumentOrganizationId],
    queryFn: () => listDocumentModels({ data: { organizationId: selectedDocumentOrganizationId } }),
    enabled: !isDemo && formOpen && !!selectedDocumentOrganizationId,
  });
  const table = useSettingsTable(rows, (row) => [row.name, row.slug], [
    (row) => row.name,
    (row) => row.slug,
  ]);
  const saveMut = useMutation({
    mutationFn: async () => {
      const row = await onSave(draft);
      const models = draftModels.map((model) => ({
        ...model,
        primary_color: normalizeHex(model.primary_color || row.word_header_color),
      }));
      if (isDemo) {
        const next = mergeDocumentModels(models);
        setDemoDocumentModels(next);
        window.localStorage.setItem(DEMO_DOCUMENT_MODELS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event("ateliam-document-models-changed"));
      } else {
        await Promise.all(
          models.map((model) =>
            saveDocumentModel({
              data: {
                ...model,
                organizationId: row.id,
              },
            }),
          ),
        );
        await queryClient.invalidateQueries({ queryKey: ["module-document-models"] });
        await queryClient.invalidateQueries({ queryKey: ["workspace-document-models", row.id] });
      }
      return row;
    },
    onSuccess: (row) => {
      toast.success(draft.id ? "Organização atualizada." : "Organização cadastrada.");
      setDraft(row);
      setFormOpen(false);
    },
    onError: (cause: Error) => toast.error(cause.message),
  });
  useEffect(() => {
    if (!formOpen) return;
    if (isDemo) {
      setDraftModels(mergeDocumentModels(demoDocumentModels));
      return;
    }
    if (!draft.id) {
      setDraftModels(defaultModelsForOrganization(draft.word_header_color));
      return;
    }
    if (documentModelsQ.data) {
      setDraftModels(mergeDocumentModels(documentModelsQ.data as DocumentModelRow[]));
    }
  }, [formOpen, isDemo, demoDocumentModels, draft.id, draft.word_header_color, documentModelsQ.data]);

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

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
      toast.success("Organização excluída.");
      setPendingDelete(null);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Não foi possível excluir a organização.",
      );
    } finally {
      setDeleting(false);
    }
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
      <div className="grid gap-4">
        <SettingsTableSearch
          value={table.search}
          onChange={table.setSearch}
          count={table.displayRows.length}
        />
        <DataTableFrame loading={loading} error={error} empty={!rows.length}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 font-semibold">#</th>
                <SortTh
                  label="Organização"
                  index={0}
                  sortIdx={table.sortIdx}
                  sortDir={table.sortDir}
                  onSort={table.toggleSort}
                />
                <SortTh
                  label="Identificador"
                  index={1}
                  sortIdx={table.sortIdx}
                  sortDir={table.sortDir}
                  onSort={table.toggleSort}
                />
                <th className="w-20 px-3 py-3 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {table.displayRows.map((row, rowIndex) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{rowIndex + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <OrganizationLogo row={row} />
                      <span className="font-semibold">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.slug}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
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
                      <button
                        type="button"
                        onClick={() => setPendingDelete(row)}
                        className={iconButtonClass}
                        title="Excluir organização"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>

        {formOpen ? (
          <div
            className="fixed inset-0 z-[70] grid place-items-center overflow-auto bg-slate-950/30 p-4 backdrop-blur-[2px]"
            onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveMut.mutate();
              }}
              className="my-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]"
            >
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <OrganizationLogo row={draft} large />
              <div className="min-w-0">
                <div className="font-display text-lg font-bold">
                  {draft.id ? "Editar organização" : "Nova organização"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Identidade, codificação e layout dos documentos
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-5 overflow-auto p-5">
              <SettingsSection
                title="Organização"
                description="Dados básicos e logo usada na interface do sistema."
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_260px]">
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
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Logo do sistema</div>
                    <div className="mt-1 flex h-10 items-center gap-2">
                      {draft.logo_data_url ? (
                        <img
                          src={draft.logo_data_url}
                          alt="Logo do sistema"
                          className="h-10 w-24 rounded-md border border-border bg-white object-contain p-1"
                        />
                      ) : (
                        <span className="flex h-10 w-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                          Sem logo
                        </span>
                      )}
                      <label className={iconButtonClass} title="Alterar logo">
                        <ImagePlus className="h-4 w-4" />
                        <input type="file" accept="image/*" className="hidden" onChange={selectLogo} />
                      </label>
                      {draft.logo_data_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({ ...current, logo_data_url: null }))
                          }
                          className={iconButtonClass}
                          title="Remover logo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SettingsSection>

              <CodificationSettings
                settings={draft.code_settings}
                onChange={(code_settings) => setDraft((current) => ({ ...current, code_settings }))}
              />

              <OrganizationDocumentModelSettings
                models={draftModels}
                loading={documentModelsQ.isLoading && !isDemo && !!draft.id}
                organizationColor={draft.word_header_color}
                organizationLogo={draft.logo_data_url}
                onChange={setDraftModels}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  saveMut.isPending ||
                  (documentModelsQ.isLoading && !isDemo && !!draft.id) ||
                  !draft.name.trim() ||
                  !draft.slug.trim() ||
                  draftModels.some(
                    (model) => !model.name.trim() || !isHexCode(model.primary_color),
                  )
                }
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
            </form>
          </div>
        ) : null}

        {pendingDelete ? (
          <Modal
            title="Excluir organização"
            subtitle={`Confirma excluir a organização "${pendingDelete.name}"? Só é possível excluir organizações sem nenhum cadastro vinculado.`}
            onClose={() => setPendingDelete(null)}
          >
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </Modal>
        ) : null}
      </div>
    </SettingsSurface>
  );
}

const CODIFICATION_GROUPS: Array<{
  key: string;
  title: string;
  detail: string;
  types: DocType[];
  showPreview: boolean;
}> = [
  {
    key: "normative",
    title: "POP, Norma e IT",
    detail: "Uma chave liga os três; siglas e sequências continuam separadas.",
    types: ["pop", "norma", "it"],
    showPreview: true,
  },
  {
    key: "mapping",
    title: "Relatório de Mapeamento e Apresentação de Mapeamento",
    detail: "Ambos usam a codificação MAP.",
    types: ["mapeamento"],
    showPreview: true,
  },
  {
    key: "flowchart",
    title: "Fluxograma",
    detail: "Reservado para o modelo de desenho.",
    types: ["fluxograma"],
    showPreview: true,
  },
  {
    key: "process",
    title: "Processo",
    detail: "Somente habilita o código do cadastro.",
    types: ["processo"],
    showPreview: false,
  },
];

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CodificationSettings({
  settings,
  onChange,
}: {
  settings?: CodeSettings | null;
  onChange: (settings: CodeSettings) => void;
}) {
  const normalized = normalizeCodeSettings(settings);

  function setGroupMode(types: DocType[], enabled: boolean) {
    onChange(
      types.reduce(
        (acc, type) => ({
          ...acc,
          [type]: { ...acc[type], mode: enabled ? "auto" : "manual" },
        }),
        normalized,
      ),
    );
  }

  return (
    <SettingsSection
      title="Codificação"
      description="Defina quais registros geram código automaticamente. O formato continua SIGLA.AREA.000."
    >
      <div className="overflow-hidden rounded-md border border-border">
        {CODIFICATION_GROUPS.map((group) => {
          const enabled = group.types.every((type) => normalized[type].mode === "auto");
          return (
            <div
              key={group.key}
              className="grid gap-3 border-t border-border p-3 first:border-t-0 md:grid-cols-[1fr_160px]"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">{group.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{group.detail}</div>
                {enabled && group.showPreview ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.types.map((type) => {
                      const rule = normalized[type];
                      return (
                        <span
                          key={type}
                          className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] font-semibold text-foreground"
                        >
                          {previewDocumentCode(type, "ADM", rule)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-start md:justify-end">
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setGroupMode(group.types, event.target.checked)}
                  />
                  Automática
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function ModelLogoControl({
  model,
  organizationLogo,
  onSelect,
  onClear,
}: {
  model: DocumentModelRow;
  organizationLogo: string | null;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {model.logo_data_url || organizationLogo ? (
        <img
          src={model.logo_data_url || organizationLogo || ""}
          alt=""
          className="h-10 w-20 rounded-md border border-border bg-white object-contain p-1"
        />
      ) : (
        <span className="flex h-10 w-20 items-center justify-center rounded-md border border-dashed border-border bg-background p-2">
          <BFFlowMark className="h-6 max-w-full" />
        </span>
      )}
      <label className={iconButtonClass} title="Alterar logo">
        <ImagePlus className="h-4 w-4" />
        <input type="file" accept="image/*" className="hidden" onChange={onSelect} />
      </label>
      {model.logo_data_url ? (
        <button type="button" onClick={onClear} className={iconButtonClass} title="Usar logo do sistema">
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function OrganizationDocumentModelSettings({
  models,
  loading,
  organizationColor,
  organizationLogo,
  onChange,
}: {
  models: DocumentModelRow[];
  loading: boolean;
  organizationColor: string;
  organizationLogo: string | null;
  onChange: (models: DocumentModelRow[]) => void;
}) {
  const rows = mergeDocumentModels(models);
  const normativeModel = rows.find((model) => model.model_key === "pop-word") ?? rows[0];
  const mappingReportModel = rows.find((model) => model.model_key === "ddp-word") ?? rows[0];
  const mappingPresentationModel = rows.find((model) => model.model_key === "ddp-html") ?? rows[0];
  const editableModels = [
    {
      title: "POP, Norma e IT",
      description:
        "Layout compartilhado para documentos normativos. O nome exibido muda conforme o tipo do documento.",
      model: normativeModel,
    },
    {
      title: "Relatório de Mapeamento",
      description: "Modelo documental do relatório completo de mapeamento.",
      model: mappingReportModel,
    },
    {
      title: "Apresentação de Mapeamento",
      description: "Modelo da apresentação gerada a partir do mapeamento.",
      model: mappingPresentationModel,
    },
  ].filter((item): item is { title: string; description: string; model: DocumentModelRow } =>
    Boolean(item.model),
  );

  function patchModel(modelKey: DocumentModelRow["model_key"], patch: Partial<DocumentModelRow>) {
    onChange(
      rows.map((model) => (model.model_key === modelKey ? { ...model, ...patch } : model)),
    );
  }

  function selectModelLogo(modelKey: DocumentModelRow["model_key"], event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem para a logo do documento.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patchModel(modelKey, { logo_data_url: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <SettingsSection
      title="Documentos e layouts"
      description="Ajuste somente o que muda na saída dos documentos: cor do cabeçalho e logo."
    >
      {loading ? <span className="text-xs text-muted-foreground">Carregando modelos...</span> : null}
      <div className="overflow-hidden rounded-md border border-border">
        {editableModels.map(({ title, description, model }) => {
          const metadata = modelMetadata(model.model_key);
          const color = normalizeHex(model.primary_color, organizationColor);
          return (
            <div
              key={model.model_key}
              className="grid gap-3 border-t border-border p-3 first:border-t-0 lg:grid-cols-[1fr_190px_170px]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]">
                  {metadata.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Cor do cabeçalho</div>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={`#${color}`}
                    onChange={(event) =>
                      patchModel(model.model_key, {
                        primary_color: event.target.value.slice(1).toUpperCase(),
                      })
                    }
                    className="h-10 w-12 rounded-md border border-input bg-background p-1"
                  />
                  <input
                    value={model.primary_color ?? ""}
                    onChange={(event) =>
                      patchModel(model.model_key, {
                        primary_color: event.target.value
                          .replace(/[^0-9a-f]/gi, "")
                          .slice(0, 6)
                          .toUpperCase(),
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Logo</div>
                <div className="mt-1">
                  <ModelLogoControl
                    model={model}
                    organizationLogo={organizationLogo}
                    onSelect={(event) => selectModelLogo(model.model_key, event)}
                    onClear={() => patchModel(model.model_key, { logo_data_url: null })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-md bg-muted/45 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Fluxograma ainda não possui documento próprio. Processo não possui layout nesta tela; para
        ele, use apenas a codificação.
      </div>
    </SettingsSection>
  );
}

type UserDraft = {
  id: string;
  email: string;
  username: string;
  password: string;
  passwordConfirmation: string;
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
  onDelete,
}: {
  rows: UserAccessRow[];
  organizations: OrganizationRow[];
  loading: boolean;
  error: unknown;
  onSave: (draft: UserDraft) => Promise<void>;
  onDelete: (row: UserAccessRow) => Promise<void>;
}) {
  const [pendingDelete, setPendingDelete] = useState<UserAccessRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const emptyDraft = (): UserDraft => ({
    id: "",
    email: "",
    username: "",
    password: "",
    passwordConfirmation: "",
    displayName: "",
    organizationId: organizations[0]?.id ?? "",
    organizationIds: organizations[0]?.id ? [organizations[0].id] : [],
    role: "viewer",
  });
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const orgNames = (row: UserAccessRow) =>
    (row.organization_access ?? [])
      .map((access) => access.organization?.name)
      .filter(Boolean)
      .join(", ") ||
    row.organization?.name ||
    "";
  const table = useSettingsTable(
    rows,
    (row) => [
      row.display_name ?? "",
      row.email,
      row.username ?? "",
      orgNames(row),
      row.roles.map((r) => roleLabels[r as AppRole] ?? r).join(" "),
    ],
    [(row) => row.display_name || row.email, orgNames],
  );
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
      username: row.username ?? "",
      password: "",
      passwordConfirmation: "",
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
      toast.success("Usuário excluído.");
      setPendingDelete(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível excluir o usuário.");
    } finally {
      setDeleting(false);
    }
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
      <div className="grid gap-4">
        <SettingsTableSearch
          value={table.search}
          onChange={table.setSearch}
          count={table.displayRows.length}
        />
        <DataTableFrame loading={loading} error={error} empty={!rows.length}>
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 font-semibold">#</th>
                <SortTh
                  label="Usuário"
                  index={0}
                  sortIdx={table.sortIdx}
                  sortDir={table.sortDir}
                  onSort={table.toggleSort}
                />
                <SortTh
                  label="Organização"
                  index={1}
                  sortIdx={table.sortIdx}
                  sortDir={table.sortDir}
                  onSort={table.toggleSort}
                />
                <th className="px-3 py-3 font-semibold">Tipo de acesso</th>
                <th className="w-20 px-3 py-3 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {table.displayRows.map((row, rowIndex) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{rowIndex + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.display_name || row.email}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {row.username ? `${row.username} · ${row.email}` : row.email}
                    </div>
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
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => edit(row)}
                        className={iconButtonClass}
                        title="Editar usuário"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(row)}
                        className={iconButtonClass}
                        title="Excluir usuário"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>

        {formOpen ? (
          <div
            className="fixed inset-0 z-[70] grid place-items-center overflow-auto bg-slate-950/30 p-4 backdrop-blur-[2px]"
            onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveMut.mutate();
              }}
              className="my-auto max-h-[92vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]"
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
              <FormField label="Usuário">
                <input
                  value={draft.username}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="ex.: mairon.conceicao"
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
                <div className="grid gap-3 sm:grid-cols-2">
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
                  <FormField label="Confirmar senha">
                    <input
                      required
                      minLength={6}
                      type="password"
                      value={draft.passwordConfirmation}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          passwordConfirmation: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </FormField>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
                    Alterar senha
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Nova senha">
                      <input
                        minLength={6}
                        type="password"
                        value={draft.password}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, password: event.target.value }))
                        }
                        placeholder="Manter senha atual"
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="Confirmar nova senha">
                      <input
                        minLength={6}
                        type="password"
                        value={draft.passwordConfirmation}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            passwordConfirmation: event.target.value,
                          }))
                        }
                        placeholder="Repita a nova senha"
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                </div>
              )}
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
                  (!draft.id &&
                    (!draft.password.trim() || !draft.passwordConfirmation.trim())) ||
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
          </div>
        ) : null}

        {pendingDelete ? (
          <Modal
            title="Excluir usuário"
            subtitle={`Confirma excluir o acesso de "${pendingDelete.display_name || pendingDelete.email}"?`}
            onClose={() => setPendingDelete(null)}
          >
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </Modal>
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
      <div className="grid gap-4">
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
          <div
            className="fixed inset-0 z-[70] grid place-items-center overflow-auto bg-slate-950/30 p-4 backdrop-blur-[2px]"
            onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveMut.mutate();
              }}
              className="my-auto max-h-[92vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]"
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
                    <span className="flex h-14 w-28 items-center justify-center rounded-md border border-dashed border-border bg-card p-2">
                      <BFFlowMark className="h-8 max-w-full" />
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
                        title="Usar logo padrão do BF Flow"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Esta logo será incorporada somente às exportações deste modelo. Sem imagem, o
                  BF Flow será usado como padrão.
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
          </div>
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
