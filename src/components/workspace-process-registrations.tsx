import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Layers3, Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  deleteProcessRegistration,
  listProcessRegistrationData,
  reserveCode,
  saveProcessArea,
  saveProcessOwnerRegistration,
  saveProcessRegistration,
  saveProcessTypeRegistration,
  saveValueChainRegistration,
} from "@/lib/config.functions";
import { type CodeKind, type CodeSettings, normalizeRule, formatCode } from "@/lib/code-generation";

// Em modo demo não há servidor: a sequência é mantida por (organização, tipo)
// no localStorage, inicializada a partir da regra configurada.
function demoCodeNextKey(organizationId: string | null | undefined, kind: CodeKind) {
  return `ateliam-demo-code-next:${organizationId ?? "default"}:${kind}`;
}
function readDemoCodeNext(
  organizationId: string | null | undefined,
  kind: CodeKind,
  fallback: number,
) {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage.getItem(demoCodeNextKey(organizationId, kind)));
  return Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : fallback;
}
function reserveDemoCode(
  organizationId: string | null | undefined,
  kind: CodeKind,
  settings: CodeSettings | null | undefined,
  slug: string | null | undefined,
) {
  const rule = normalizeRule(kind, settings?.[kind]);
  const next = readDemoCodeNext(organizationId, kind, rule.next);
  const code = formatCode(rule.mask, next, { slug });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(demoCodeNextKey(organizationId, kind), String(next + 1));
  }
  return code;
}

export type ProcessRegistrationView =
  | "value-chains"
  | "processes"
  | "areas"
  | "owners"
  | "process-types";

type Area = { id: string; name: string };
type Owner = {
  id: string;
  name: string;
  department_id: string | null;
  role_title: string | null;
};
type ProcessType = {
  id: string;
  code: "macroprocess" | "process" | "subprocess";
  label: string;
  active: boolean;
};
type ValueChainCategory = "primary" | "support" | "management";
type ValueChain = {
  id: string;
  name: string;
  category: ValueChainCategory;
  description: string | null;
  status: string;
};

const VALUE_CHAIN_CATEGORIES: Array<{
  value: ValueChainCategory;
  label: string;
  description: string;
}> = [
  {
    value: "primary",
    label: "Processos Primários / Finalísticos",
    description: "Entregam valor diretamente ao cliente ou ao negócio.",
  },
  {
    value: "support",
    label: "Processos de Apoio / Suporte",
    description: "Sustentam os processos principais e a operação.",
  },
  {
    value: "management",
    label: "Processos de Gestão / Estratégicos",
    description: "Direcionam, controlam e apoiam a tomada de decisão.",
  },
];

function valueChainCategoryLabel(value: ValueChainCategory) {
  return VALUE_CHAIN_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}
type Process = {
  id: string;
  code: string | null;
  name: string;
  type: "macroprocess" | "process" | "subprocess";
  value_chain_id: string | null;
  parent_process_id: string | null;
  department: string | null;
  owner: string | null;
  description: string | null;
  status: string;
  current_version: number;
};
type RegistryData = {
  areas: Area[];
  owners: Owner[];
  types: ProcessType[];
  valueChains: ValueChain[];
  processes: Process[];
};

const STRUCTURAL_PROCESS_TYPES: ProcessType[] = [
  { id: "type-macro", code: "macroprocess", label: "Macroprocesso", active: true },
  { id: "type-process", code: "process", label: "Processo", active: true },
  { id: "type-sub", code: "subprocess", label: "Subprocesso", active: true },
];

export const DEMO_REGISTRY: RegistryData = {
  areas: [
    { id: "area-ti", name: "Tecnologia da Informação" },
    { id: "area-processos", name: "Processos" },
  ],
  owners: [
    {
      id: "owner-gerente-ti",
      name: "Gerente de TI · Tecnologia da Informação",
      department_id: "area-ti",
      role_title: "Gerente de TI",
    },
  ],
  types: STRUCTURAL_PROCESS_TYPES,
  valueChains: [
    {
      id: "chain-operacao",
      name: "Operação e Gestão",
      category: "management",
      description: "Cadeia de valor principal da organização.",
      status: "Ativa",
    },
  ],
  processes: [
    {
      id: "process-bi",
      code: "PMO.007",
      name: "Gestão de Demandas de BI Analytics",
      type: "process",
      value_chain_id: "chain-operacao",
      parent_process_id: null,
      department: "Tecnologia da Informação",
      owner: "Gerente de TI · Tecnologia da Informação",
      description: "Gestão do ciclo de demandas analíticas.",
      status: "Ativo",
      current_version: 14,
    },
  ],
};

type Draft = {
  id: string;
  name: string;
  description: string;
  status: string;
  code: string;
  type: "macroprocess" | "process" | "subprocess";
  valueChainId: string;
  parentProcessId: string;
  department: string;
  departmentId: string;
  owner: string;
  roleTitle: string;
  label: string;
  active: boolean;
  valueChainCategory: ValueChainCategory;
};

function emptyDraft(view: ProcessRegistrationView, data: RegistryData): Draft {
  const type = view === "process-types" ? "macroprocess" : "process";
  return {
    id: "",
    name: "",
    description: "",
    status: view === "value-chains" ? "Ativa" : "Ativo",
    code: "",
    type,
    valueChainId: data.valueChains[0]?.id ?? "",
    parentProcessId: "",
    department: data.areas[0]?.name ?? "",
    departmentId: data.areas[0]?.id ?? "",
    owner: data.owners[0]?.name ?? "",
    roleTitle: "",
    label: "Macroprocesso",
    active: true,
    valueChainCategory: "primary",
  };
}

export function WorkspaceProcessRegistrations({
  view,
  organizationId,
  organizationName,
  organizationSlug,
  codeSettings,
  isDemo,
}: {
  view: ProcessRegistrationView;
  organizationId?: string | null;
  organizationName: string;
  organizationSlug?: string | null;
  codeSettings?: CodeSettings | null;
  isDemo: boolean;
}) {
  const listRegistry = useServerFn(listProcessRegistrationData);
  const saveArea = useServerFn(saveProcessArea);
  const saveOwner = useServerFn(saveProcessOwnerRegistration);
  const saveType = useServerFn(saveProcessTypeRegistration);
  const saveValueChain = useServerFn(saveValueChainRegistration);
  const saveProcess = useServerFn(saveProcessRegistration);
  const reserveCodeFn = useServerFn(reserveCode);
  const removeRegistration = useServerFn(deleteProcessRegistration);
  const processRule = normalizeRule("process", codeSettings?.process);
  const isAutoProcessCode = view === "processes" && processRule.mode === "auto";
  const processCodePreview = isAutoProcessCode
    ? formatCode(
        processRule.mask,
        isDemo ? readDemoCodeNext(organizationId, "process", processRule.next) : processRule.next,
        { slug: organizationSlug },
      )
    : "";
  const [demoData, setDemoData] = useState<RegistryData>(() =>
    organizationId === "demo-bom-futuro" ? DEMO_REGISTRY : emptyRegistryData(),
  );
  const query = useQuery({
    queryKey: ["process-registration-data", organizationId],
    queryFn: () => listRegistry({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo,
  });
  const data = isDemo ? demoData : ((query.data ?? emptyRegistryData()) as RegistryData);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(view, data));
  const [formOpen, setFormOpen] = useState(false);

  const copy = registryCopy(view);
  const rows = useMemo(() => registryRows(view, data), [data, view]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Gera o código do processo quando configurado para geração automática.
      let processCode = draft.code || null;
      if (view === "processes" && !draft.id && isAutoProcessCode && !processCode) {
        processCode = isDemo
          ? reserveDemoCode(organizationId, "process", codeSettings, organizationSlug)
          : (await reserveCodeFn({ data: { organizationId, kind: "process" } })).code;
      }
      if (isDemo) {
        return saveDemoRegistration(
          view,
          { ...draft, code: processCode ?? draft.code },
          demoData,
          setDemoData,
        );
      }
      if (view === "areas") {
        return saveArea({
          data: { id: draft.id || undefined, organizationId, name: draft.name },
        });
      }
      if (view === "owners") {
        return saveOwner({
          data: {
            id: draft.id || undefined,
            organizationId,
            departmentId: draft.departmentId,
            roleTitle: draft.roleTitle,
          },
        });
      }
      if (view === "process-types") {
        return saveType({
          data: {
            id: draft.id || undefined,
            organizationId,
            code: draft.type,
            label: draft.label,
            active: draft.active,
          },
        });
      }
      if (view === "value-chains") {
        return saveValueChain({
          data: {
            id: draft.id || undefined,
            organizationId,
            name: draft.name,
            category: draft.valueChainCategory,
            description: draft.description || null,
            status: draft.status as "Ativa" | "Inativa",
          },
        });
      }
      return saveProcess({
        data: {
          id: draft.id || undefined,
          organizationId,
          code: processCode,
          name: draft.name,
          type: draft.type,
          valueChainId: draft.valueChainId || null,
          parentProcessId: draft.parentProcessId || null,
          department: draft.department || null,
          owner: draft.owner || null,
          description: draft.description || null,
          status: draft.status as "Ativo" | "Em revisão" | "Arquivado",
        },
      });
    },
    onSuccess: async () => {
      toast.success(`${copy.singular} salvo.`);
      if (!isDemo) await query.refetch();
      setDraft(emptyDraft(view, data));
      setFormOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (view === "process-types") throw new Error("Os três tipos estruturais não são excluídos.");
      if (isDemo) {
        deleteDemoRegistration(view, id, setDemoData);
        return;
      }
      const kind =
        view === "value-chains"
          ? "value-chain"
          : view === "processes"
            ? "process"
            : view === "areas"
              ? "area"
              : "owner";
      await removeRegistration({ data: { organizationId, kind, id } });
    },
    onSuccess: async () => {
      toast.success("Registro excluído.");
      if (!isDemo) await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function editRow(id: string) {
    setDraft(draftFromRow(view, id, data));
    setFormOpen(true);
  }

  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
            cadastros · {organizationName}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <button
          onClick={() => {
            setDraft(emptyDraft(view, data));
            setFormOpen(true);
          }}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </header>

      <div
        className={`grid gap-4 ${formOpen ? "xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]" : ""}`}
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {query.isLoading && !isDemo ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : rows.length ? (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-muted/75 text-xs text-muted-foreground">
                <tr>
                  {copy.columns.map((column) => (
                    <th key={column} className="px-4 py-3">
                      {column}
                    </th>
                  ))}
                  <th className="w-24 px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                    {row.values.map((value, index) => (
                      <td
                        key={`${row.id}-${index}`}
                        className={
                          index ? "px-4 py-3 text-muted-foreground" : "px-4 py-3 font-semibold"
                        }
                      >
                        {value}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <IconButton label="Editar" onClick={() => editRow(row.id)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        {view !== "process-types" ? (
                          <IconButton
                            label="Excluir"
                            onClick={() =>
                              window.confirm("Excluir este registro?") &&
                              deleteMutation.mutate(row.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhum registro cadastrado.
            </div>
          )}
        </div>

        {formOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-accent text-[var(--gold)]">
                {copy.icon}
              </span>
              <div>
                <h2 className="font-display text-lg font-bold">
                  {draft.id
                    ? "Editar"
                    : view === "value-chains" || view === "areas"
                      ? "Nova"
                      : "Novo"}{" "}
                  {copy.singular.toLowerCase()}
                </h2>
                <p className="text-xs text-muted-foreground">Campos específicos deste cadastro</p>
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
              <RegistrationFields
                view={view}
                draft={draft}
                setDraft={setDraft}
                data={data}
                autoCode={isAutoProcessCode}
                codePreview={processCodePreview}
              />
              <button
                type="submit"
                disabled={saveMutation.isPending || !isValidDraft(view, draft)}
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function RegistrationFields({
  view,
  draft,
  setDraft,
  data,
  autoCode = false,
  codePreview = "",
}: {
  view: ProcessRegistrationView;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  data: RegistryData;
  autoCode?: boolean;
  codePreview?: string;
}) {
  if (view === "areas")
    return (
      <Field label="Nome da área">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={inputClass}
        />
      </Field>
    );
  if (view === "owners")
    return (
      <>
        <Field label="Área">
          <select
            value={draft.departmentId}
            onChange={(e) => setDraft((d) => ({ ...d, departmentId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {data.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cargo">
          <input
            value={draft.roleTitle}
            onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))}
            className={inputClass}
          />
        </Field>
      </>
    );
  if (view === "process-types")
    return (
      <>
        <Field label="Tipo estrutural">
          <select
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as Draft["type"];
              setDraft((d) => ({
                ...d,
                type,
                label:
                  type === "macroprocess"
                    ? "Macroprocesso"
                    : type === "process"
                      ? "Processo"
                      : "Subprocesso",
              }));
            }}
            className={inputClass}
          >
            <option value="macroprocess">Macroprocesso</option>
            <option value="process">Processo</option>
            <option value="subprocess">Subprocesso</option>
          </select>
        </Field>
        <Field label="Nome exibido">
          <input
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
          />{" "}
          Ativo
        </label>
      </>
    );
  if (view === "value-chains")
    return (
      <>
        <Field label="Nome">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label="Categoria">
          <select
            required
            value={draft.valueChainCategory}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                valueChainCategory: e.target.value as ValueChainCategory,
              }))
            }
            className={inputClass}
          >
            {VALUE_CHAIN_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {
              VALUE_CHAIN_CATEGORIES.find((category) => category.value === draft.valueChainCategory)
                ?.description
            }
          </p>
        </Field>
        <Field label="Descrição">
          <textarea
            rows={4}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            className={inputClass}
          >
            <option>Ativa</option>
            <option>Inativa</option>
          </select>
        </Field>
      </>
    );
  const parentOptions = data.processes.filter((process) =>
    draft.type === "subprocess"
      ? process.type === "process"
      : draft.type === "process"
        ? process.type === "macroprocess"
        : false,
  );
  return (
    <>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Código">
          {autoCode ? (
            <input
              value={draft.code || codePreview}
              readOnly
              title="Código gerado automaticamente"
              className={`${inputClass} cursor-not-allowed bg-muted/60 text-muted-foreground`}
            />
          ) : (
            <input
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Nome">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Cadeia de valor">
        <select
          value={draft.valueChainId}
          onChange={(e) => setDraft((d) => ({ ...d, valueChainId: e.target.value }))}
          className={inputClass}
        >
          <option value="">Sem vínculo</option>
          {data.valueChains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tipo">
        <select
          value={draft.type}
          onChange={(e) =>
            setDraft((d) => ({ ...d, type: e.target.value as Draft["type"], parentProcessId: "" }))
          }
          className={inputClass}
        >
          {data.types
            .filter((type) => type.active)
            .map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))}
        </select>
      </Field>
      {draft.type !== "macroprocess" ? (
        <Field label={draft.type === "process" ? "Macroprocesso pai" : "Processo pai"}>
          <select
            value={draft.parentProcessId}
            onChange={(e) => setDraft((d) => ({ ...d, parentProcessId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {parentOptions.map((process) => (
              <option key={process.id} value={process.id}>
                {process.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Área">
        <select
          value={draft.department}
          onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
          className={inputClass}
        >
          <option value="">Selecione</option>
          {data.areas.map((area) => (
            <option key={area.id}>{area.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Dono do processo">
        <select
          value={draft.owner}
          onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
          className={inputClass}
        >
          <option value="">Selecione</option>
          {data.owners.map((owner) => (
            <option key={owner.id}>{owner.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Descrição">
        <textarea
          rows={4}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className={`${inputClass} h-auto py-2`}
        />
      </Field>
      <Field label="Status">
        <select
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
          className={inputClass}
        >
          <option>Ativo</option>
          <option>Em revisão</option>
          <option>Arquivado</option>
        </select>
      </Field>
    </>
  );
}

function registryCopy(view: ProcessRegistrationView) {
  if (view === "value-chains")
    return {
      title: "Cadeia de valor",
      singular: "Cadeia de valor",
      description:
        "Organize os grandes fluxos de geração de valor que agrupam os processos da organização.",
      columns: ["Nome", "Categoria", "Descrição", "Status"],
      icon: <Layers3 className="h-5 w-5" />,
    };
  if (view === "areas")
    return {
      title: "Áreas",
      singular: "Área",
      description: "Mantenha as áreas utilizadas nos processos, donos e documentos.",
      columns: ["Área"],
      icon: <Layers3 className="h-5 w-5" />,
    };
  if (view === "owners")
    return {
      title: "Donos de Processo",
      singular: "Dono",
      description:
        "Defina donos por combinação de área e cargo, sem vincular o processo a uma pessoa específica.",
      columns: ["Cargo", "Área"],
      icon: <UserRound className="h-5 w-5" />,
    };
  if (view === "process-types")
    return {
      title: "Tipos de Processo",
      singular: "Tipo",
      description: "Mantenha os três níveis estruturais da arquitetura de processos.",
      columns: ["Código", "Nome", "Status"],
      icon: <GitBranch className="h-5 w-5" />,
    };
  return {
    title: "Processos",
    singular: "Processo",
    description:
      "Cadastre e versione Macroprocessos, Processos e Subprocessos vinculados à Cadeia de Valor.",
    columns: ["Código", "Processo", "Tipo", "Cadeia de Valor", "Área", "Dono", "Versão"],
    icon: <GitBranch className="h-5 w-5" />,
  };
}

function registryRows(view: ProcessRegistrationView, data: RegistryData) {
  if (view === "areas") return data.areas.map((item) => ({ id: item.id, values: [item.name] }));
  if (view === "owners")
    return data.owners.map((item) => ({
      id: item.id,
      values: [
        item.role_title || item.name,
        data.areas.find((area) => area.id === item.department_id)?.name || "-",
      ],
    }));
  if (view === "process-types")
    return data.types.map((item) => ({
      id: item.id,
      values: [item.code, item.label, item.active ? "Ativo" : "Inativo"],
    }));
  if (view === "value-chains")
    return data.valueChains.map((item) => ({
      id: item.id,
      values: [
        item.name,
        valueChainCategoryLabel(item.category),
        item.description || "-",
        item.status,
      ],
    }));
  return data.processes.map((item) => ({
    id: item.id,
    values: [
      item.code || "-",
      item.name,
      data.types.find((type) => type.code === item.type)?.label || item.type,
      data.valueChains.find((chain) => chain.id === item.value_chain_id)?.name || "-",
      item.department || "-",
      item.owner || "-",
      `v${item.current_version}`,
    ],
  }));
}

function draftFromRow(view: ProcessRegistrationView, id: string, data: RegistryData): Draft {
  const draft = emptyDraft(view, data);
  if (view === "areas") {
    const item = data.areas.find((row) => row.id === id);
    return item ? { ...draft, id, name: item.name } : draft;
  }
  if (view === "owners") {
    const item = data.owners.find((row) => row.id === id);
    return item
      ? {
          ...draft,
          id,
          departmentId: item.department_id || "",
          roleTitle: item.role_title || item.name,
        }
      : draft;
  }
  if (view === "process-types") {
    const item = data.types.find((row) => row.id === id);
    return item ? { ...draft, id, type: item.code, label: item.label, active: item.active } : draft;
  }
  if (view === "value-chains") {
    const item = data.valueChains.find((row) => row.id === id);
    return item
      ? {
          ...draft,
          id,
          name: item.name,
          valueChainCategory: item.category,
          description: item.description || "",
          status: item.status,
        }
      : draft;
  }
  const item = data.processes.find((row) => row.id === id);
  return item
    ? {
        ...draft,
        id,
        code: item.code || "",
        name: item.name,
        type: item.type,
        valueChainId: item.value_chain_id || "",
        parentProcessId: item.parent_process_id || "",
        department: item.department || "",
        owner: item.owner || "",
        description: item.description || "",
        status: item.status,
      }
    : draft;
}

function saveDemoRegistration(
  view: ProcessRegistrationView,
  draft: Draft,
  data: RegistryData,
  setData: Dispatch<SetStateAction<RegistryData>>,
) {
  const id = draft.id || `demo-${view}-${Date.now()}`;
  setData((current) => {
    if (view === "areas")
      return { ...current, areas: upsert(current.areas, { id, name: draft.name }) };
    if (view === "owners") {
      const area = current.areas.find((item) => item.id === draft.departmentId);
      return {
        ...current,
        owners: upsert(current.owners, {
          id,
          department_id: draft.departmentId,
          role_title: draft.roleTitle,
          name: `${draft.roleTitle} · ${area?.name || "Área"}`,
        }),
      };
    }
    if (view === "process-types")
      return {
        ...current,
        types: upsert(current.types, {
          id,
          code: draft.type,
          label: draft.label,
          active: draft.active,
        }),
      };
    if (view === "value-chains")
      return {
        ...current,
        valueChains: upsert(current.valueChains, {
          id,
          name: draft.name,
          category: draft.valueChainCategory,
          description: draft.description || null,
          status: draft.status,
        }),
      };
    const previous = current.processes.find((item) => item.id === id);
    return {
      ...current,
      processes: upsert(current.processes, {
        id,
        code: draft.code || null,
        name: draft.name,
        type: draft.type,
        value_chain_id: draft.valueChainId || null,
        parent_process_id: draft.parentProcessId || null,
        department: draft.department || null,
        owner: draft.owner || null,
        description: draft.description || null,
        status: draft.status,
        current_version: (previous?.current_version ?? 0) + 1,
      }),
    };
  });
  return Promise.resolve({ id });
}

function deleteDemoRegistration(
  view: ProcessRegistrationView,
  id: string,
  setData: Dispatch<SetStateAction<RegistryData>>,
) {
  setData((current) =>
    view === "areas"
      ? { ...current, areas: current.areas.filter((item) => item.id !== id) }
      : view === "owners"
        ? { ...current, owners: current.owners.filter((item) => item.id !== id) }
        : view === "value-chains"
          ? { ...current, valueChains: current.valueChains.filter((item) => item.id !== id) }
          : { ...current, processes: current.processes.filter((item) => item.id !== id) },
  );
}
function upsert<T extends { id: string }>(rows: T[], row: T) {
  return rows.some((item) => item.id === row.id)
    ? rows.map((item) => (item.id === row.id ? row : item))
    : [...rows, row];
}
function emptyRegistryData(): RegistryData {
  return {
    areas: [],
    owners: [],
    types: STRUCTURAL_PROCESS_TYPES,
    valueChains: [],
    processes: [],
  };
}
function isValidDraft(view: ProcessRegistrationView, draft: Draft) {
  if (view === "owners") return !!draft.departmentId && !!draft.roleTitle.trim();
  if (view === "process-types") return !!draft.label.trim();
  return !!draft.name.trim();
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10";
const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-45";
