import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BriefcaseBusiness,
  Database,
  GitBranch,
  Layers3,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  deleteProcessRegistration,
  listProcessRegistrationData,
  reserveCode,
  saveProcessArea,
  saveProcessOwnerRegistration,
  savePositionRegistration,
  saveProcessRegistration,
  saveProcessTypeRegistration,
  saveSystemRegistration,
  saveValueChainRegistration,
} from "@/lib/config.functions";
import {
  type CodeSettings,
  normalizeRule,
  normalizeSigla,
  previewDocumentCode,
  previewDemoDocumentCode,
  reserveDemoDocumentCode,
} from "@/lib/code-generation";

/** Resolve a sigla da área a partir do nome selecionado no formulário. */
function areaSiglaByName(areas: Area[], name: string | null | undefined): string {
  const match = areas.find((area) => area.name === name);
  return normalizeSigla(match?.sigla ?? "");
}

export type ProcessRegistrationView =
  | "value-chains"
  | "processes"
  | "areas"
  | "positions"
  | "owners"
  | "owner-users"
  | "systems"
  | "process-types";

type OwnerUser = { id: string; owner_id: string; user: string };
type SystemItem = { id: string; name: string; description: string };
type Position = { id: string; title: string; description: string | null };

type Area = { id: string; name: string; sigla: string | null };
type Owner = {
  id: string;
  name: string;
  department_id: string | null;
  // Um dono pode ser gestor de várias áreas (mas cada área tem um único gestor).
  department_ids?: string[];
  role_title: string | null;
};

// Áreas que um dono administra (compatível com o campo antigo department_id).
function ownerAreaIds(owner: Owner): string[] {
  if (owner.department_ids && owner.department_ids.length) return owner.department_ids;
  return owner.department_id ? [owner.department_id] : [];
}
type ProcessType = {
  id: string;
  code: "macroprocess" | "process" | "subprocess" | "atividade" | "tarefa";
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
    label: "Processos Finalísticos",
    description: "Entregam valor diretamente ao cliente ou ao negócio.",
  },
  {
    value: "support",
    label: "Processos de Suporte",
    description: "Sustentam os processos principais e a operação.",
  },
  {
    value: "management",
    label: "Processos de Gestão",
    description: "Direcionam e controlam a gestão do negócio.",
  },
];

function valueChainCategoryLabel(value: ValueChainCategory) {
  return VALUE_CHAIN_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowDownUp className="h-3 w-3 opacity-35" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  );
}

type Process = {
  id: string;
  code: string | null;
  name: string;
  type: "macroprocess" | "process" | "subprocess" | "atividade" | "tarefa";
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
  positions: Position[];
  owners: Owner[];
  types: ProcessType[];
  valueChains: ValueChain[];
  processes: Process[];
  ownerUsers: OwnerUser[];
  systems: SystemItem[];
};

const PROCESS_PARENT_BY_TYPE: Partial<Record<Process["type"], Process["type"]>> = {
  subprocess: "process",
  atividade: "subprocess",
  tarefa: "atividade",
};

const PROCESS_PARENT_LABEL: Record<Process["type"], string> = {
  macroprocess: "",
  process: "",
  subprocess: "Processo",
  atividade: "Subprocesso",
  tarefa: "Atividade",
};

function ownerDisplayName(owner: Pick<Owner, "name" | "role_title">) {
  const value = owner.role_title || owner.name || "";
  return value
    .replace(/\s*(?:·|•|Â·|Ã‚Â·|-)\s*.*$/u, "")
    .trim() || value.trim();
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

const STRUCTURAL_PROCESS_TYPES: ProcessType[] = [
  { id: "type-process", code: "process", label: "Processo", active: true },
  { id: "type-sub", code: "subprocess", label: "Subprocesso", active: true },
  { id: "type-activity", code: "atividade", label: "Atividade", active: true },
  { id: "type-task", code: "tarefa", label: "Tarefa", active: true },
];

export const DEMO_REGISTRY: RegistryData = {
  areas: [
    { id: "area-ti", name: "Tecnologia da Informação", sigla: "TIN" },
    { id: "area-processos", name: "Processos & Qualidade", sigla: "PRQ" },
    { id: "area-comercial", name: "Comercial & Vendas", sigla: "COM" },
    { id: "area-operacoes", name: "Operações", sigla: "OPE" },
    { id: "area-financeiro", name: "Financeiro & Controladoria", sigla: "FIN" },
    { id: "area-rh", name: "Recursos Humanos", sigla: "RHU" },
    { id: "area-logistica", name: "Logística & Supply Chain", sigla: "LOG" },
  ],
  owners: [
    {
      id: "owner-gerente-ti",
      name: "Gerente de TI · Tecnologia da Informação",
      department_id: "area-ti",
      role_title: "Gerente de TI",
    },
    {
      id: "owner-coord-processos",
      name: "Coordenadora de Processos · Processos & Qualidade",
      department_id: "area-processos",
      role_title: "Coordenadora de Processos",
    },
    {
      id: "owner-dir-comercial",
      name: "Diretor Comercial · Comercial & Vendas",
      department_id: "area-comercial",
      role_title: "Diretor Comercial",
    },
    {
      id: "owner-ger-operacoes",
      name: "Gerente de Operações · Operações",
      department_id: "area-operacoes",
      role_title: "Gerente de Operações",
    },
    {
      id: "owner-ger-financeiro",
      name: "Gerente Financeiro · Financeiro & Controladoria",
      department_id: "area-financeiro",
      role_title: "Gerente Financeiro",
    },
    {
      id: "owner-bphr",
      name: "BP de RH · Recursos Humanos",
      department_id: "area-rh",
      role_title: "BP de RH",
    },
    {
      id: "owner-ger-logistica",
      name: "Gerente de Logística · Logística & Supply Chain",
      department_id: "area-logistica",
      role_title: "Gerente de Logística",
    },
  ],
  positions: [
    { id: "position-gerente-ti", title: "Gerente de TI", description: "Responsável pela gestão da área de Tecnologia da Informação." },
    { id: "position-coordenador-processos", title: "Coordenador de Processos", description: "Responsável pela governança de processos e padronização documental." },
    { id: "position-analista-bi", title: "Analista de BI", description: "Responsável por análise, construção e sustentação de relatórios e indicadores." },
  ],
  types: STRUCTURAL_PROCESS_TYPES,
  valueChains: [
    {
      id: "chain-gestao-corp",
      name: "Governança Corporativa",
      category: "management",
      description: "Processos de planejamento estratégico, governança e gestão de desempenho.",
      status: "Ativa",
    },
    {
      id: "chain-gestao-pessoas",
      name: "Gestão de Pessoas",
      category: "management",
      description: "Gestão do ciclo de vida do colaborador e desenvolvimento organizacional.",
      status: "Ativa",
    },
    {
      id: "chain-gestao-ti",
      name: "Gestão de TI & Inovação",
      category: "management",
      description: "Governança de TI, gestão de projetos e inovação tecnológica.",
      status: "Ativa",
    },
    {
      id: "chain-comercial",
      name: "Comercialização & Vendas",
      category: "primary",
      description: "Do prospecto ao fechamento: geração de demanda, proposta e contrato.",
      status: "Ativa",
    },
    {
      id: "chain-producao",
      name: "Produção & Entrega",
      category: "primary",
      description: "Operação do produto ou serviço principal da organização.",
      status: "Ativa",
    },
    {
      id: "chain-pos-venda",
      name: "Pós-Venda & Sucesso do Cliente",
      category: "primary",
      description: "Suporte, retenção e expansão de receita nos clientes ativos.",
      status: "Ativa",
    },
    {
      id: "chain-financeiro",
      name: "Gestão Financeira",
      category: "support",
      description: "Controladoria, tesouraria, contas a pagar e receber.",
      status: "Ativa",
    },
    {
      id: "chain-logistica",
      name: "Logística & Supply Chain",
      category: "support",
      description: "Compras, estoque, transporte e distribuição.",
      status: "Ativa",
    },
    {
      id: "chain-qualidade",
      name: "Qualidade & Melhoria Contínua",
      category: "support",
      description: "Auditorias, não conformidades, certificações e melhoria de processos.",
      status: "Ativa",
    },
    // ── Cadeias inativas (não aparecem no diagrama, apenas na tabela) ──
    {
      id: "chain-marketing-legado",
      name: "Marketing Tradicional (Legado)",
      category: "primary",
      description: "Cadeia descontinuada após a unificação com Comercialização & Vendas.",
      status: "Inativa",
    },
    {
      id: "chain-juridico",
      name: "Jurídico & Compliance",
      category: "support",
      description: "Em estruturação — aguardando definição do responsável.",
      status: "Inativa",
    },
    {
      id: "chain-projetos-pmo",
      name: "Escritório de Projetos (PMO)",
      category: "management",
      description: "Suspensa temporariamente durante a reorganização da governança.",
      status: "Inativa",
    },
  ],
  processes: [
    // ── Governança Corporativa ──
    {
      id: "proc-planejamento",
      code: "GOV.001",
      name: "Planejamento Estratégico",
      type: "process",
      value_chain_id: "chain-gestao-corp",
      parent_process_id: null,
      department: "Processos & Qualidade",
      owner: "Coordenadora de Processos · Processos & Qualidade",
      description: "Ciclo anual de planejamento estratégico, OKRs e revisão de metas.",
      status: "Ativo",
      current_version: 5,
    },
    {
      id: "proc-gestao-desempenho",
      code: "GOV.002",
      name: "Gestão de Indicadores e Desempenho",
      type: "process",
      value_chain_id: "chain-gestao-corp",
      parent_process_id: null,
      department: "Processos & Qualidade",
      owner: "Coordenadora de Processos · Processos & Qualidade",
      description: "Apuração mensal de KPIs, reuniões de análise crítica e planos de ação.",
      status: "Ativo",
      current_version: 8,
    },
    {
      id: "proc-gestao-riscos",
      code: "GOV.003",
      name: "Gestão de Riscos Corporativos",
      type: "process",
      value_chain_id: "chain-gestao-corp",
      parent_process_id: null,
      department: "Processos & Qualidade",
      owner: "Coordenadora de Processos · Processos & Qualidade",
      description: "Identificação, avaliação e mitigação de riscos operacionais e estratégicos.",
      status: "Em revisão",
      current_version: 3,
    },
    // ── Gestão de Pessoas ──
    {
      id: "proc-recrutamento",
      code: "RH.001",
      name: "Recrutamento e Seleção",
      type: "process",
      value_chain_id: "chain-gestao-pessoas",
      parent_process_id: null,
      department: "Recursos Humanos",
      owner: "BP de RH · Recursos Humanos",
      description: "Abertura de vaga, triagem, entrevistas e admissão.",
      status: "Ativo",
      current_version: 6,
    },
    {
      id: "proc-onboarding",
      code: "RH.002",
      name: "Integração e Onboarding",
      type: "process",
      value_chain_id: "chain-gestao-pessoas",
      parent_process_id: null,
      department: "Recursos Humanos",
      owner: "BP de RH · Recursos Humanos",
      description: "Recepção, treinamento inicial e ambientação de novos colaboradores.",
      status: "Ativo",
      current_version: 4,
    },
    {
      id: "proc-avaliacao-desempenho",
      code: "RH.003",
      name: "Avaliação de Desempenho",
      type: "process",
      value_chain_id: "chain-gestao-pessoas",
      parent_process_id: null,
      department: "Recursos Humanos",
      owner: "BP de RH · Recursos Humanos",
      description: "Ciclo semestral de avaliação 180° e plano de desenvolvimento individual.",
      status: "Ativo",
      current_version: 2,
    },
    // ── Gestão de TI ──
    {
      id: "proc-demandas-ti",
      code: "TI.001",
      name: "Gestão de Demandas de TI",
      type: "process",
      value_chain_id: "chain-gestao-ti",
      parent_process_id: null,
      department: "Tecnologia da Informação",
      owner: "Gerente de TI · Tecnologia da Informação",
      description: "Recebimento, priorização e entrega de demandas de sistemas e infraestrutura.",
      status: "Ativo",
      current_version: 14,
    },
    {
      id: "proc-bi",
      code: "TI.002",
      name: "Gestão de Demandas de BI Analytics",
      type: "process",
      value_chain_id: "chain-gestao-ti",
      parent_process_id: null,
      department: "Tecnologia da Informação",
      owner: "Gerente de TI · Tecnologia da Informação",
      description: "Ciclo de desenvolvimento de dashboards e relatórios analíticos.",
      status: "Ativo",
      current_version: 11,
    },
    {
      id: "proc-seguranca",
      code: "TI.003",
      name: "Gestão de Segurança da Informação",
      type: "process",
      value_chain_id: "chain-gestao-ti",
      parent_process_id: null,
      department: "Tecnologia da Informação",
      owner: "Gerente de TI · Tecnologia da Informação",
      description: "Política de acessos, backup, gestão de vulnerabilidades e LGPD.",
      status: "Em revisão",
      current_version: 2,
    },
    // ── Comercialização ──
    {
      id: "proc-prospecção",
      code: "COM.001",
      name: "Prospecção e Geração de Leads",
      type: "process",
      value_chain_id: "chain-comercial",
      parent_process_id: null,
      department: "Comercial & Vendas",
      owner: "Diretor Comercial · Comercial & Vendas",
      description: "Campanhas de outbound, inbound e qualificação de oportunidades.",
      status: "Ativo",
      current_version: 7,
    },
    {
      id: "proc-proposta",
      code: "COM.002",
      name: "Elaboração e Aprovação de Propostas",
      type: "process",
      value_chain_id: "chain-comercial",
      parent_process_id: null,
      department: "Comercial & Vendas",
      owner: "Diretor Comercial · Comercial & Vendas",
      description: "Criação, precificação e aprovação interna de propostas comerciais.",
      status: "Ativo",
      current_version: 9,
    },
    // ── Produção & Entrega ──
    {
      id: "proc-planejamento-producao",
      code: "OPE.001",
      name: "Planejamento da Produção",
      type: "process",
      value_chain_id: "chain-producao",
      parent_process_id: null,
      department: "Operações",
      owner: "Gerente de Operações · Operações",
      description: "S&OP, programação de produção e gestão de capacidade.",
      status: "Ativo",
      current_version: 5,
    },
    {
      id: "proc-controle-qualidade",
      code: "OPE.002",
      name: "Controle de Qualidade na Produção",
      type: "process",
      value_chain_id: "chain-producao",
      parent_process_id: null,
      department: "Operações",
      owner: "Gerente de Operações · Operações",
      description: "Inspeção, testes e liberação de lotes conforme padrões de qualidade.",
      status: "Ativo",
      current_version: 6,
    },
    // ── Financeiro ──
    {
      id: "proc-contas-receber",
      code: "FIN.001",
      name: "Contas a Receber",
      type: "process",
      value_chain_id: "chain-financeiro",
      parent_process_id: null,
      department: "Financeiro & Controladoria",
      owner: "Gerente Financeiro · Financeiro & Controladoria",
      description: "Emissão de fatura, cobrança, baixa e conciliação bancária.",
      status: "Ativo",
      current_version: 10,
    },
    {
      id: "proc-contas-pagar",
      code: "FIN.002",
      name: "Contas a Pagar",
      type: "process",
      value_chain_id: "chain-financeiro",
      parent_process_id: null,
      department: "Financeiro & Controladoria",
      owner: "Gerente Financeiro · Financeiro & Controladoria",
      description: "Aprovação de notas, programação de pagamentos e conciliação.",
      status: "Ativo",
      current_version: 8,
    },
    // ── Logística ──
    {
      id: "proc-compras",
      code: "LOG.001",
      name: "Gestão de Compras",
      type: "process",
      value_chain_id: "chain-logistica",
      parent_process_id: null,
      department: "Logística & Supply Chain",
      owner: "Gerente de Logística · Logística & Supply Chain",
      description: "Solicitação, cotação, aprovação e pedido de compras.",
      status: "Ativo",
      current_version: 12,
    },
    {
      id: "proc-estoque",
      code: "LOG.002",
      name: "Gestão de Estoque",
      type: "process",
      value_chain_id: "chain-logistica",
      parent_process_id: null,
      department: "Logística & Supply Chain",
      owner: "Gerente de Logística · Logística & Supply Chain",
      description: "Recebimento, armazenagem, inventário e controle de perdas.",
      status: "Em revisão",
      current_version: 4,
    },
    // ── Qualidade ──
    {
      id: "proc-nao-conformidade",
      code: "QUA.001",
      name: "Tratamento de Não Conformidades",
      type: "process",
      value_chain_id: "chain-qualidade",
      parent_process_id: null,
      department: "Processos & Qualidade",
      owner: "Coordenadora de Processos · Processos & Qualidade",
      description: "Registro, análise de causa raiz, ação corretiva e verificação de eficácia.",
      status: "Ativo",
      current_version: 7,
    },
    {
      id: "proc-auditoria-interna",
      code: "QUA.002",
      name: "Auditoria Interna de Processos",
      type: "process",
      value_chain_id: "chain-qualidade",
      parent_process_id: null,
      department: "Processos & Qualidade",
      owner: "Coordenadora de Processos · Processos & Qualidade",
      description: "Planejamento e execução do programa anual de auditorias internas.",
      status: "Ativo",
      current_version: 3,
    },
  ],
  ownerUsers: [
    { id: "ou-ti", owner_id: "owner-gerente-ti", user: "carlos.menezes@bomfuturo.com" },
    { id: "ou-rh", owner_id: "owner-bphr", user: "juliana.castro@bomfuturo.com" },
    { id: "ou-fin", owner_id: "owner-ger-financeiro", user: "bruno.cardoso@bomfuturo.com" },
  ],
  systems: [
    { id: "sys-erp", name: "ERP TOTVS", description: "Sistema transacional de gestão (financeiro, fiscal, estoque)." },
    { id: "sys-powerbi", name: "Power BI", description: "Plataforma de dashboards e relatórios analíticos." },
    { id: "sys-crm", name: "HubSpot CRM", description: "Gestão de leads, funil e atividades comerciais." },
    { id: "sys-ats", name: "Gupy (ATS)", description: "Recrutamento e seleção: publicação de vagas e triagem." },
    { id: "sys-jira", name: "Jira", description: "Gestão de demandas e projetos de TI." },
    { id: "sys-workspace", name: "Google Workspace", description: "E-mail, colaboração e agenda corporativa." },
  ],
};

type Draft = {
  id: string;
  name: string;
  sigla: string;
  description: string;
  status: string;
  code: string;
  type: "macroprocess" | "process" | "subprocess" | "atividade" | "tarefa";
  valueChainId: string;
  parentProcessId: string;
  department: string;
  departmentId: string;
  departmentIds: string[];
  owner: string;
  roleTitle: string;
  linkOwnerId: string;
  userName: string;
  label: string;
  active: boolean;
  valueChainCategory: ValueChainCategory;
};

type RelatedCreateTarget = "valueChain" | "area" | "owner";
type RelatedCreateView = "value-chains" | "areas" | "owners";
type RelatedCreateState = {
  target: RelatedCreateTarget;
  view: RelatedCreateView;
  draft: Draft;
};

function emptyDraft(view: ProcessRegistrationView, data: RegistryData): Draft {
  const type = "process";
  const firstActiveValueChain =
    data.valueChains.find((chain) => chain.status !== "Inativa") ?? data.valueChains[0];
  return {
    id: "",
    name: "",
    sigla: "",
    description: "",
    status: view === "value-chains" ? "Ativa" : "Ativo",
    code: "",
    type,
    valueChainId: firstActiveValueChain?.id ?? "",
    parentProcessId: "",
    department: data.areas[0]?.name ?? "",
    departmentId: data.areas[0]?.id ?? "",
    departmentIds: [],
    owner: data.owners[0] ? ownerDisplayName(data.owners[0]) : "",
    roleTitle: "",
    linkOwnerId: data.owners[0]?.id ?? "",
    userName: "",
    label: "Processo",
    active: true,
    valueChainCategory: "primary",
  };
}

export function WorkspaceProcessRegistrations({
  view,
  organizationId,
  organizationName,
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
  const savePosition = useServerFn(savePositionRegistration);
  const saveType = useServerFn(saveProcessTypeRegistration);
  const saveValueChain = useServerFn(saveValueChainRegistration);
  const saveProcess = useServerFn(saveProcessRegistration);
  const saveSystem = useServerFn(saveSystemRegistration);
  const reserveCodeFn = useServerFn(reserveCode);
  const removeRegistration = useServerFn(deleteProcessRegistration);
  const processRule = normalizeRule(codeSettings?.processo);
  const isAutoProcessCode = view === "processes" && processRule.mode === "auto";
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
  const [relatedCreate, setRelatedCreate] = useState<RelatedCreateState | null>(null);
  const [pendingProcessStatus, setPendingProcessStatus] = useState<{
    process: Process;
    status: "Ativo" | "Arquivado";
  } | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<ReturnType<typeof registryRows>[number] | null>(
    null,
  );

  // O código do Processo (PR) depende da sigla da área selecionada no formulário.
  const processAreaSigla = areaSiglaByName(data.areas, draft.department);
  const processCodePreview =
    isAutoProcessCode && processAreaSigla
      ? isDemo
        ? previewDemoDocumentCode(organizationId, "processo", processAreaSigla, codeSettings)
        : previewDocumentCode("processo", processAreaSigla, processRule)
      : "";

  const copy = registryCopy(view);
  const rows = useMemo(() => registryRows(view, data), [data, view]);

  // Busca + ordenação por coluna (mesma lógica do relatório de cadeia de valor).
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  useEffect(() => {
    setSortCol(null);
    setSortDir("asc");
    setSearch("");
  }, [view]);
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q
      ? rows.filter((row) => row.values.join(" ").toLowerCase().includes(q))
      : rows;
    if (sortCol !== null) {
      const dir = sortDir === "asc" ? 1 : -1;
      result = [...result].sort(
        (a, b) =>
          String(a.values[sortCol] ?? "").localeCompare(
            String(b.values[sortCol] ?? ""),
            "pt-BR",
            { numeric: true },
          ) * dir,
      );
    }
    return result;
  }, [rows, search, sortCol, sortDir]);
  function toggleSort(col: number) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      let processCode = draft.code || null;
      if (
        view === "processes" &&
        !draft.id &&
        isAutoProcessCode &&
        !processCode &&
        processAreaSigla
      ) {
        processCode = isDemo
          ? reserveDemoDocumentCode(organizationId, "processo", processAreaSigla, codeSettings)
          : (
              await reserveCodeFn({
                data: { organizationId, type: "processo", areaSigla: processAreaSigla },
              })
            ).code;
      }
      if (isDemo) {
        return saveDemoRegistration(
          view,
          {
            ...draft,
            code: processCode ?? draft.code,
            status: view === "processes" && !draft.id ? "Ativo" : draft.status,
          },
          demoData,
          setDemoData,
        );
      }
      if (view === "areas") {
        return saveArea({
          data: { id: draft.id || undefined, organizationId, name: draft.name, sigla: draft.sigla },
        });
      }
      if (view === "positions") {
        return savePosition({
          data: {
            id: draft.id || undefined,
            organizationId,
            title: draft.roleTitle || draft.name,
            description: draft.description || null,
          },
        });
      }
      if (view === "owners") {
        return saveOwner({
          data: {
            id: draft.id || undefined,
            organizationId,
            departmentId: draft.departmentId,
            departmentIds: draft.departmentIds.length ? draft.departmentIds : [draft.departmentId],
            roleTitle: draft.roleTitle,
          },
        });
      }
      if (view === "owner-users") {
        // Vínculo dono × usuário disponível no modo de demonstração.
        throw new Error("Vínculo de usuário disponível no modo de demonstração.");
      }
      if (view === "systems") {
        return saveSystem({
          data: {
            id: draft.id || undefined,
            organizationId,
            name: draft.name,
            description: draft.description || null,
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
      const processStatus = draft.id ? draft.status : "Ativo";
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
          status: processStatus,
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
              : view === "systems"
                ? "system"
                : view === "positions"
                  ? "position"
                : "owner";
      await removeRegistration({ data: { organizationId, kind, id } });
    },
    onSuccess: async () => {
      toast.success("Registro excluído.");
      if (!isDemo) await query.refetch();
      setPendingDeleteRow(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const processStatusMutation = useMutation({
    mutationFn: async ({ process, status }: { process: Process; status: "Ativo" | "Arquivado" }) => {
      if (isDemo) {
        setDemoData((current) => ({
          ...current,
          processes: current.processes.map((item) =>
            item.id === process.id ? { ...item, status } : item,
          ),
        }));
        return;
      }
      await saveProcess({
        data: {
          id: process.id,
          organizationId,
          code: process.code,
          name: process.name,
          type: process.type,
          valueChainId: process.value_chain_id,
          parentProcessId: process.parent_process_id,
          department: process.department,
          owner: process.owner,
          description: process.description,
          status,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Status do processo atualizado.");
      setPendingProcessStatus(null);
      if (!isDemo) await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openRelatedCreate(target: RelatedCreateTarget, name: string) {
    const targetView: RelatedCreateView =
      target === "valueChain" ? "value-chains" : target === "area" ? "areas" : "owners";
    const next = emptyDraft(targetView, data);
    if (target === "valueChain") {
      next.name = name;
      next.valueChainCategory = "primary";
      next.status = "Ativa";
    }
    if (target === "area") {
      next.name = name;
      next.sigla = `${normalizeSigla(name)}XXX`.slice(0, 3);
    }
    if (target === "owner") {
      const departmentId =
        draft.departmentId || data.areas.find((area) => area.name === draft.department)?.id || "";
      next.roleTitle = name;
      next.departmentId = departmentId;
      next.departmentIds = departmentId ? [departmentId] : [];
    }
    setRelatedCreate({ target, view: targetView, draft: next });
  }

  const relatedCreateMutation = useMutation({
    mutationFn: async () => {
      if (!relatedCreate) throw new Error("Cadastro relacionado não identificado.");
      const { view: relatedView, draft: relatedDraft } = relatedCreate;
      if (isDemo) {
        const id = relatedDraft.id || `demo-${relatedView}-${Date.now()}`;
        await saveDemoRegistration(relatedView, { ...relatedDraft, id }, demoData, setDemoData);
        return { id };
      }
      if (relatedView === "value-chains") {
        return saveValueChain({
          data: {
            organizationId,
            name: relatedDraft.name,
            category: relatedDraft.valueChainCategory,
            description: relatedDraft.description || null,
            status: relatedDraft.status as "Ativa" | "Inativa",
          },
        });
      }
      if (relatedView === "areas") {
        return saveArea({
          data: { organizationId, name: relatedDraft.name, sigla: relatedDraft.sigla },
        });
      }
      return saveOwner({
        data: {
          organizationId,
          departmentId: relatedDraft.departmentId,
          roleTitle: relatedDraft.roleTitle,
        },
      });
    },
    onSuccess: async (row: unknown) => {
      if (!relatedCreate) return;
      const saved = row as { id?: string; name?: string; role_title?: string | null };
      const savedId = saved.id || relatedCreate.draft.id;
      const savedName = saved.name || relatedCreate.draft.name;
      if (!savedId) throw new Error("Cadastro salvo sem identificador.");
      if (relatedCreate.target === "valueChain") {
        setDraft((current) => ({ ...current, valueChainId: savedId }));
        toast.success("Macroprocesso cadastrado.");
      }
      if (relatedCreate.target === "area") {
        setDraft((current) => ({ ...current, departmentId: savedId, department: savedName }));
        toast.success("Área cadastrada.");
      }
      if (relatedCreate.target === "owner") {
        const ownerName = ownerDisplayName({
          name: saved.name || relatedCreate.draft.roleTitle,
          role_title: saved.role_title ?? relatedCreate.draft.roleTitle,
        });
        setDraft((current) => ({ ...current, linkOwnerId: savedId, owner: ownerName }));
        toast.success("Dono cadastrado.");
      }
      if (!isDemo) await query.refetch();
      setRelatedCreate(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function setRelatedDraft(update: SetStateAction<Draft>) {
    setRelatedCreate((current) => {
      if (!current) return current;
      const nextDraft =
        typeof update === "function"
          ? (update as (draft: Draft) => Draft)(current.draft)
          : update;
      return { ...current, draft: nextDraft };
    });
  }

  function editRow(id: string) {
    setDraft(draftFromRow(view, id, data));
    setFormOpen(true);
  }

  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
            processos · cadastros
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {copy.description}
          </p>
        </div>
        {view !== "process-types" ? (
          <button
            onClick={() => {
              setDraft(emptyDraft(view, data));
              setFormOpen(true);
            }}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" /> Novo
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {displayRows.length} {displayRows.length === 1 ? "registro" : "registros"}
        </span>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar / pesquisar..."
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {query.isLoading && !isDemo ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-muted/75 text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 font-semibold">#</th>
                {copy.columns.map((column, colIndex) => (
                  <th key={column} className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort(colIndex)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column}
                      <SortIcon active={sortCol === colIndex} dir={sortDir} />
                    </button>
                  </th>
                ))}
                <th className="w-24 px-3 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIndex) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/45">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{rowIndex + 1}</td>
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
                      {view === "processes" ? (
                        <ProcessStatusSwitch
                          process={data.processes.find((item) => item.id === row.id)}
                          disabled={processStatusMutation.isPending}
                          onRequest={(process, status) =>
                            setPendingProcessStatus({ process, status })
                          }
                        />
                      ) : null}
                      <IconButton label="Editar" onClick={() => editRow(row.id)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      {view !== "process-types" ? (
                        <IconButton
                          label="Excluir"
                          onClick={() => setPendingDeleteRow(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!displayRows.length ? (
                <tr>
                  <td
                    colSpan={copy.columns.length + 2}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]">
                {copy.icon}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold">
                  {draft.id
                    ? "Editar"
                    : view === "value-chains" || view === "areas"
                      ? "Nova"
                      : "Novo"}{" "}
                  {copy.singular.toLowerCase()}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  Campos específicos deste cadastro
                </p>
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
            </header>

            <div className="grid gap-4 p-5">
              <RegistrationFields
                view={view}
                draft={draft}
                setDraft={setDraft}
                data={data}
                autoCode={isAutoProcessCode}
                codePreview={processCodePreview}
                quickCreate={
                  view === "processes"
                      ? {
                          onCreateValueChain: (name) => openRelatedCreate("valueChain", name),
                          onCreateArea: (name) => openRelatedCreate("area", name),
                          onCreateOwner: (name) => openRelatedCreate("owner", name),
                        }
                    : undefined
                }
              />
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending || !isValidDraft(view, draft)}
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />{" "}
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {relatedCreate ? (
        <div
          className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={(event) => event.target === event.currentTarget && setRelatedCreate(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              relatedCreateMutation.mutate();
            }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]">
                {registryCopy(relatedCreate.view).icon}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold">
                  Novo {registryCopy(relatedCreate.view).singular.toLowerCase()}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  Cadastro oficial usado em Cadastros
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRelatedCreate(null)}
                className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-4 p-5">
              <RegistrationFields
                view={relatedCreate.view}
                draft={relatedCreate.draft}
                setDraft={setRelatedDraft}
                data={data}
              />
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setRelatedCreate(null)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  relatedCreateMutation.isPending ||
                  !isValidDraft(relatedCreate.view, relatedCreate.draft)
                }
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />{" "}
                {relatedCreateMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {pendingProcessStatus ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold">
                  {pendingProcessStatus.status === "Ativo"
                    ? "Ativar processo"
                    : "Desativar processo"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirma {pendingProcessStatus.status === "Ativo" ? "ativar" : "desativar"} o
                  processo "{pendingProcessStatus.process.name}"?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingProcessStatus(null)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingProcessStatus(null)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={processStatusMutation.isPending}
                onClick={() => processStatusMutation.mutate(pendingProcessStatus)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-45"
              >
                {pendingProcessStatus.status === "Ativo" ? "Ativar" : "Desativar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteRow ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold">Excluir registro</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirma excluir o registro "{pendingDeleteRow.values[0] || pendingDeleteRow.id}"?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteRow(null)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteRow(null)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(pendingDeleteRow.id)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-45"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  quickCreate,
}: {
  view: ProcessRegistrationView;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  data: RegistryData;
  autoCode?: boolean;
  codePreview?: string;
  quickCreate?: QuickCreateHandlers;
}) {
  if (view === "areas")
    return (
      <>
        <Field label="Nome da área">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label="Sigla (3 letras)">
          <input
            value={draft.sigla}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                sigla: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3),
              }))
            }
            maxLength={3}
            placeholder="Ex.: ADM"
            className={`${inputClass} font-mono uppercase tracking-[0.3em]`}
          />
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            Usada na codificação dos documentos desta área (ex.:{" "}
            <span className="font-mono">POP.{draft.sigla || "ADM"}.001</span>).
          </p>
        </Field>
      </>
    );
  if (view === "systems")
    return (
      <>
        <Field label="Sistema">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nome do sistema"
            className={inputClass}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            rows={4}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Informações pertinentes sobre o sistema"
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
      </>
    );
  if (view === "positions")
    return (
      <>
        <Field label="Título do cargo">
          <input
            value={draft.roleTitle}
            onChange={(e) =>
              setDraft((d) => ({ ...d, roleTitle: e.target.value, name: e.target.value }))
            }
            placeholder="Ex.: Coordenador de Atendimento"
            className={inputClass}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            rows={4}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Descreva a finalidade ou escopo do cargo"
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
      </>
    );
  if (view === "owner-users")
    return (
      <>
        <Field label="Dono de processo">
          <select
            value={draft.linkOwnerId}
            onChange={(e) => setDraft((d) => ({ ...d, linkOwnerId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {data.owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Usuário (e-mail ou nome)">
          <input
            value={draft.userName}
            onChange={(e) => setDraft((d) => ({ ...d, userName: e.target.value }))}
            placeholder="usuario@empresa.com"
            className={inputClass}
          />
        </Field>
      </>
    );
  if (view === "owners")
    return (
      <>
        <Field label="Áreas (um dono pode gerir várias)">
          <div className="grid max-h-56 gap-1 overflow-auto rounded-md border border-border p-2">
            {data.areas.length === 0 ? (
              <span className="px-1 text-xs text-muted-foreground">
                Cadastre áreas antes de vincular um gestor.
              </span>
            ) : (
              data.areas.map((area) => {
                const otherManager = data.owners.find(
                  (owner) => owner.id !== draft.id && ownerAreaIds(owner).includes(area.id),
                );
                const checked = draft.departmentIds.includes(area.id);
                const disabled = !!otherManager && !checked;
                return (
                  <label
                    key={area.id}
                    className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
                      disabled ? "opacity-50" : "hover:bg-muted/50"
                    }`}
                    title={
                      disabled
                        ? `Área já tem gestor: ${otherManager?.role_title || otherManager?.name}`
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) =>
                        setDraft((d) => {
                          const next = e.target.checked
                            ? [...d.departmentIds, area.id]
                            : d.departmentIds.filter((id) => id !== area.id);
                          return { ...d, departmentIds: next, departmentId: next[0] ?? "" };
                        })
                      }
                    />
                    <span>{area.name}</span>
                    {disabled ? (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        já tem gestor
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
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
        <Field label="Nível estrutural (fixo)">
          <input
            value={draft.type}
            readOnly
            tabIndex={-1}
            className={`${inputClass} cursor-not-allowed border-dashed bg-muted/70 text-muted-foreground`}
          />
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
  const parentType = PROCESS_PARENT_BY_TYPE[draft.type];
  const parentOptions = parentType
    ? data.processes.filter((process) => process.type === parentType && process.status === "Ativo")
    : [];
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
      <div className="rounded-lg border border-border bg-background/55 p-3">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Hierarquia do processo
        </div>
        <div className="grid gap-3">
          <SearchableCreateSelect
            label="Macroprocesso pai"
            value={draft.valueChainId}
            options={data.valueChains
              .filter((chain) => chain.status !== "Inativa")
              .map((chain) => ({ value: chain.id, label: chain.name }))}
            createLabel="Cadastrar macroprocesso"
            onChange={(valueChainId) => setDraft((d) => ({ ...d, valueChainId }))}
            onCreate={
              quickCreate?.onCreateValueChain
                ? (name) => quickCreate.onCreateValueChain?.(name)
                : undefined
            }
          />
          <Field label="Tipo">
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  type: e.target.value as Draft["type"],
                  parentProcessId: "",
                }))
              }
              className={inputClass}
            >
              {data.types
                .filter((type) => type.active && type.code !== "macroprocess")
                .map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
            </select>
          </Field>
          {draft.type !== "process" && draft.type !== "macroprocess" ? (
            <Field label={`${PROCESS_PARENT_LABEL[draft.type]} pai`}>
              <select
                required
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
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableCreateSelect
          label="Área"
          value={draft.department}
          options={data.areas.map((area) => ({ value: area.name, label: area.name }))}
          createLabel="Cadastrar área"
          onChange={(department) => {
            const area = data.areas.find((item) => item.name === department);
            setDraft((d) => ({ ...d, department, departmentId: area?.id ?? d.departmentId }));
          }}
          onCreate={
            quickCreate?.onCreateArea
              ? (name) => quickCreate.onCreateArea?.(name)
              : undefined
          }
        />
        <SearchableCreateSelect
          label="Dono do processo"
          value={draft.owner}
          options={data.owners.map((owner) => {
            const label = ownerDisplayName(owner);
            return { value: label, label };
          })}
          createLabel="Cadastrar dono"
          onChange={(owner) => setDraft((d) => ({ ...d, owner }))}
          onCreate={
            quickCreate?.onCreateOwner
              ? (name) => quickCreate.onCreateOwner?.(name)
              : undefined
          }
        />
      </div>
      <Field label="Descrição">
        <textarea
          rows={4}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className={`${inputClass} h-auto py-2`}
        />
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
      columns: ["Sigla", "Área"],
      icon: <Layers3 className="h-5 w-5" />,
    };
  if (view === "positions")
    return {
      title: "Cargos",
      singular: "Cargo",
      description: "Cadastre cargos para reutilização nas responsabilidades dos documentos.",
      columns: ["Cargo", "Descrição"],
      icon: <BriefcaseBusiness className="h-5 w-5" />,
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
  if (view === "owner-users")
    return {
      title: "Vínculo Dono x Usuário",
      singular: "Vínculo",
      description: "Associe cada dono de processo a um usuário do sistema.",
      columns: ["Dono", "Usuário"],
      icon: <UserRound className="h-5 w-5" />,
    };
  if (view === "systems")
    return {
      title: "Sistemas",
      singular: "Sistema",
      description: "Cadastre os sistemas da empresa para reutilizá-los nos mapeamentos.",
      columns: ["Sistema", "Descrição"],
      icon: <Database className="h-5 w-5" />,
    };
  if (view === "process-types")
    return {
      title: "Categorias de Processo",
      singular: "Categoria",
      description: "Mantenha os níveis estruturais da arquitetura de processos.",
      columns: ["Código", "Nome", "Status"],
      icon: <GitBranch className="h-5 w-5" />,
    };
  return {
    title: "Processos",
    singular: "Processo",
    description:
      "Cadastre Processos, Subprocessos, Atividades e Tarefas vinculados à Cadeia de Valor.",
    columns: ["Código", "Processo", "Tipo", "Macroprocesso pai", "Área", "Dono"],
    icon: <GitBranch className="h-5 w-5" />,
  };
}

function registryRows(view: ProcessRegistrationView, data: RegistryData) {
  if (view === "areas")
    return data.areas.map((item) => ({ id: item.id, values: [item.sigla || "—", item.name] }));
  if (view === "positions")
    return (data.positions ?? []).map((item) => ({
      id: item.id,
      values: [item.title, item.description || "-"],
    }));
  if (view === "owners")
    return data.owners.map((item) => ({
      id: item.id,
      values: [
        item.role_title || item.name,
        ownerAreaIds(item)
          .map((areaId) => data.areas.find((area) => area.id === areaId)?.name)
          .filter(Boolean)
          .join(", ") || "-",
      ],
    }));
  if (view === "owner-users")
    return (data.ownerUsers ?? []).map((item) => ({
      id: item.id,
      values: [
        (() => {
          const owner = data.owners.find((row) => row.id === item.owner_id);
          return owner ? ownerDisplayName(owner) : "-";
        })(),
        item.user,
      ],
    }));
  if (view === "systems")
    return (data.systems ?? []).map((item) => ({
      id: item.id,
      values: [item.name, item.description || "-"],
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
  return data.processes.map((item) => {
    const directChain = data.valueChains.find((chain) => chain.id === item.value_chain_id);
    const parent = item.parent_process_id
      ? data.processes.find((process) => process.id === item.parent_process_id)
      : null;
    const parentChain = parent?.value_chain_id
      ? data.valueChains.find((chain) => chain.id === parent.value_chain_id)
      : null;
    return {
      id: item.id,
      values: [
        item.code || "-",
        item.name,
        data.types.find((type) => type.code === item.type)?.label || item.type,
        directChain?.name || parentChain?.name || "-",
        item.department || "-",
        item.owner ? ownerDisplayName({ name: item.owner, role_title: null }) : "-",
      ],
    };
  });
}

function draftFromRow(view: ProcessRegistrationView, id: string, data: RegistryData): Draft {
  const draft = emptyDraft(view, data);
  if (view === "areas") {
    const item = data.areas.find((row) => row.id === id);
    return item ? { ...draft, id, name: item.name, sigla: normalizeSigla(item.sigla) } : draft;
  }
  if (view === "positions") {
    const item = data.positions.find((row) => row.id === id);
    return item
      ? {
          ...draft,
          id,
          name: item.title,
          roleTitle: item.title,
          description: item.description || "",
        }
      : draft;
  }
  if (view === "owner-users") {
    const item = data.ownerUsers.find((row) => row.id === id);
    return item ? { ...draft, id, linkOwnerId: item.owner_id, userName: item.user } : draft;
  }
  if (view === "systems") {
    const item = data.systems.find((row) => row.id === id);
    return item ? { ...draft, id, name: item.name, description: item.description } : draft;
  }
  if (view === "owners") {
    const item = data.owners.find((row) => row.id === id);
    return item
      ? {
          ...draft,
          id,
          departmentId: item.department_id || "",
          departmentIds: ownerAreaIds(item),
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
        owner: item.owner ? ownerDisplayName({ name: item.owner, role_title: null }) : "",
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
    if (view === "areas") {
      const previous = current.areas.find((item) => item.id === id);
      return {
        ...current,
        areas: upsert(current.areas, { id, name: draft.name, sigla: draft.sigla }),
        processes:
          previous && previous.name !== draft.name
            ? current.processes.map((process) =>
                process.department === previous.name ? { ...process, department: draft.name } : process,
              )
            : current.processes,
      };
    }
    if (view === "positions")
      return {
        ...current,
        positions: upsert(current.positions, {
          id,
          title: draft.roleTitle || draft.name,
          description: draft.description || null,
        }),
      };
    if (view === "owners") {
      const previous = current.owners.find((item) => item.id === id);
      const areaIds = draft.departmentIds.length
        ? draft.departmentIds
        : draft.departmentId
          ? [draft.departmentId]
          : [];
      const previousAliases = [previous?.name, previous?.role_title].filter(Boolean) as string[];
      return {
        ...current,
        owners: upsert(current.owners, {
          id,
          department_id: areaIds[0] ?? null,
          department_ids: areaIds,
          role_title: draft.roleTitle,
          name: draft.roleTitle,
        }),
        processes: previousAliases.length
          ? current.processes.map((process) =>
              process.owner && previousAliases.includes(process.owner)
                ? { ...process, owner: draft.roleTitle }
                : process,
            )
          : current.processes,
      };
    }
    if (view === "owner-users")
      return {
        ...current,
        ownerUsers: upsert(current.ownerUsers, {
          id,
          owner_id: draft.linkOwnerId,
          user: draft.userName.trim(),
        }),
      };
    if (view === "systems")
      return {
        ...current,
        systems: upsert(current.systems, {
          id,
          name: draft.name.trim(),
          description: draft.description.trim(),
        }),
      };
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
        // Processos não são versionados: mantém o valor existente sem incrementar.
        current_version: previous?.current_version ?? 1,
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
      : view === "positions"
        ? { ...current, positions: current.positions.filter((item) => item.id !== id) }
      : view === "owners"
        ? { ...current, owners: current.owners.filter((item) => item.id !== id) }
        : view === "owner-users"
          ? { ...current, ownerUsers: current.ownerUsers.filter((item) => item.id !== id) }
          : view === "systems"
            ? { ...current, systems: current.systems.filter((item) => item.id !== id) }
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
    positions: [],
    owners: [],
    types: STRUCTURAL_PROCESS_TYPES,
    valueChains: [],
    processes: [],
    ownerUsers: [],
    systems: [],
  };
}
function isValidDraft(view: ProcessRegistrationView, draft: Draft) {
  if (view === "areas") return !!draft.name.trim() && /^[A-Z]{3}$/.test(draft.sigla);
  if (view === "positions") return !!draft.roleTitle.trim();
  if (view === "owners") return draft.departmentIds.length > 0 && !!draft.roleTitle.trim();
  if (view === "owner-users") return !!draft.linkOwnerId && !!draft.userName.trim();
  if (view === "systems") return !!draft.name.trim();
  if (view === "process-types") return !!draft.label.trim();
  if (view === "processes") {
    const needsParent = draft.type !== "process";
    return (
      !!draft.name.trim() &&
      !!draft.valueChainId &&
      (!needsParent || !!draft.parentProcessId) &&
      !!draft.department &&
      !!draft.owner &&
      !!draft.description.trim()
    );
  }
  return !!draft.name.trim();
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </div>
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

// Processo devolvido pelo diálogo ao concluir o cadastro. Estrutura compatível
// com `organization_processes` para poder ser selecionado em qualquer contexto.
type QuickCreateHandlers = {
  onCreateValueChain?: (name: string) => void;
  onCreateArea?: (name: string) => void;
  onCreateOwner?: (name: string) => void;
};

function SearchableCreateSelect({
  label,
  value,
  options,
  placeholder = "Selecione",
  createLabel = "Cadastrar",
  disabled,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  createLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCreate?: (label: string) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = normalizeLabel(query);
  const visible = normalized
    ? options.filter((option) => normalizeLabel(option.label).includes(normalized))
    : options;
  const canCreate =
    !!onCreate &&
    !!query.trim() &&
    !options.some((option) => normalizeLabel(option.label) === normalized);

  function createItem() {
    if (!onCreate || !query.trim()) return;
    onCreate(query.trim());
    setQuery("");
    setOpen(false);
  }

  return (
    <Field label={label}>
      <div className="relative">
        <input
          value={open ? query : selectedLabel}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={onCreate ? `${placeholder} ou digite para cadastrar` : placeholder}
          className={inputClass}
        />
        {open ? (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-lg">
            {visible.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center rounded px-2 py-2 text-left text-sm hover:bg-muted"
              >
                {option.label}
              </button>
            ))}
            {!visible.length ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                Nenhum item encontrado.
              </div>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={createItem}
                className="mt-1 flex w-full items-center gap-2 rounded border border-dashed border-[var(--gold)] px-2 py-2 text-left text-sm font-semibold text-[var(--gold)] hover:bg-accent disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {createLabel} "{query.trim()}"
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

export type CreatedProcess = {
  id: string;
  organization_id: string;
  current_version: number;
  code: string | null;
  name: string;
  type: "macroprocess" | "process" | "subprocess" | "atividade" | "tarefa";
  value_chain_id: string | null;
  parent_process_id: string | null;
  department: string | null;
  owner: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

// Janela de cadastro de Processo reaproveitável. Usa exatamente os mesmos campos
// (RegistrationFields), validação (isValidDraft) e persistência
// (saveProcessRegistration / reserva de código) do cadastro em Cadastros, para
// que qualquer alteração no cadastro de processos reflita também aqui.
export function ProcessRegistrationDialog({
  organizationId,
  isDemo,
  codeSettings,
  initialName = "",
  onClose,
  onCreated,
}: {
  organizationId: string | null;
  isDemo: boolean;
  codeSettings: CodeSettings | null;
  initialName?: string;
  onClose: () => void;
  onCreated: (process: CreatedProcess) => void;
}) {
  const listRegistry = useServerFn(listProcessRegistrationData);
  const saveArea = useServerFn(saveProcessArea);
  const saveOwner = useServerFn(saveProcessOwnerRegistration);
  const saveValueChain = useServerFn(saveValueChainRegistration);
  const saveProcess = useServerFn(saveProcessRegistration);
  const reserveCodeFn = useServerFn(reserveCode);
  const query = useQuery({
    queryKey: ["process-registration-data", organizationId],
    queryFn: () => listRegistry({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo,
  });
  const [demoData, setDemoData] = useState<RegistryData>(() =>
    organizationId === "demo-bom-futuro" ? DEMO_REGISTRY : emptyRegistryData(),
  );
  const data: RegistryData = isDemo
    ? demoData
    : ((query.data ?? emptyRegistryData()) as RegistryData);

  const [draft, setDraft] = useState<Draft>(() => ({
    ...emptyDraft("processes", data),
    name: initialName,
  }));
  const [relatedCreate, setRelatedCreate] = useState<RelatedCreateState | null>(null);

  // Quando os catálogos chegam (nuvem), completa os defaults que ainda não
  // tinham opção disponível no primeiro render.
  useEffect(() => {
    const firstActiveValueChain =
      data.valueChains.find((chain) => chain.status !== "Inativa") ?? data.valueChains[0];
    setDraft((current) => ({
      ...current,
      valueChainId: current.valueChainId || firstActiveValueChain?.id || "",
      department: current.department || data.areas[0]?.name || "",
      departmentId: current.departmentId || data.areas[0]?.id || "",
      owner: current.owner || (data.owners[0] ? ownerDisplayName(data.owners[0]) : ""),
      linkOwnerId: current.linkOwnerId || data.owners[0]?.id || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.valueChains.length, data.areas.length, data.owners.length]);

  const processRule = normalizeRule(codeSettings?.processo);
  const isAutoProcessCode = processRule.mode === "auto";
  const processAreaSigla = areaSiglaByName(data.areas, draft.department);
  const processCodePreview =
    isAutoProcessCode && processAreaSigla
      ? isDemo
        ? previewDemoDocumentCode(organizationId, "processo", processAreaSigla, codeSettings)
        : previewDocumentCode("processo", processAreaSigla, processRule)
      : "";
  const copy = registryCopy("processes");

  function openRelatedCreate(target: RelatedCreateTarget, name: string) {
    const targetView: RelatedCreateView =
      target === "valueChain" ? "value-chains" : target === "area" ? "areas" : "owners";
    const next = emptyDraft(targetView, data);
    if (target === "valueChain") {
      next.name = name;
      next.valueChainCategory = "primary";
      next.status = "Ativa";
    }
    if (target === "area") {
      next.name = name;
      next.sigla = `${normalizeSigla(name)}XXX`.slice(0, 3);
    }
    if (target === "owner") {
      const departmentId =
        draft.departmentId || data.areas.find((area) => area.name === draft.department)?.id || "";
      next.roleTitle = name;
      next.departmentId = departmentId;
      next.departmentIds = departmentId ? [departmentId] : [];
    }
    setRelatedCreate({ target, view: targetView, draft: next });
  }

  const relatedCreateMutation = useMutation({
    mutationFn: async () => {
      if (!relatedCreate) throw new Error("Cadastro relacionado não identificado.");
      const { view: relatedView, draft: relatedDraft } = relatedCreate;
      if (isDemo) {
        const id = relatedDraft.id || `demo-${relatedView}-${Date.now()}`;
        await saveDemoRegistration(relatedView, { ...relatedDraft, id }, demoData, setDemoData);
        return { id };
      }
      if (relatedView === "value-chains") {
        return saveValueChain({
          data: {
            organizationId,
            name: relatedDraft.name,
            category: relatedDraft.valueChainCategory,
            description: relatedDraft.description || null,
            status: relatedDraft.status as "Ativa" | "Inativa",
          },
        });
      }
      if (relatedView === "areas") {
        return saveArea({
          data: { organizationId, name: relatedDraft.name, sigla: relatedDraft.sigla },
        });
      }
      return saveOwner({
        data: {
          organizationId,
          departmentId: relatedDraft.departmentId,
          roleTitle: relatedDraft.roleTitle,
        },
      });
    },
    onSuccess: async (row: unknown) => {
      if (!relatedCreate) return;
      const saved = row as { id?: string; name?: string; role_title?: string | null };
      const savedId = saved.id || relatedCreate.draft.id;
      const savedName = saved.name || relatedCreate.draft.name;
      if (!savedId) throw new Error("Cadastro salvo sem identificador.");
      if (relatedCreate.target === "valueChain") {
        setDraft((current) => ({ ...current, valueChainId: savedId }));
        toast.success("Macroprocesso cadastrado.");
      }
      if (relatedCreate.target === "area") {
        setDraft((current) => ({ ...current, departmentId: savedId, department: savedName }));
        toast.success("Área cadastrada.");
      }
      if (relatedCreate.target === "owner") {
        const ownerName = ownerDisplayName({
          name: saved.name || relatedCreate.draft.roleTitle,
          role_title: saved.role_title ?? relatedCreate.draft.roleTitle,
        });
        setDraft((current) => ({ ...current, linkOwnerId: savedId, owner: ownerName }));
        toast.success("Dono cadastrado.");
      }
      if (!isDemo) await query.refetch();
      setRelatedCreate(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function setRelatedDraft(update: SetStateAction<Draft>) {
    setRelatedCreate((current) => {
      if (!current) return current;
      const nextDraft =
        typeof update === "function"
          ? (update as (draft: Draft) => Draft)(current.draft)
          : update;
      return { ...current, draft: nextDraft };
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (): Promise<CreatedProcess> => {
      let processCode = draft.code || null;
      if (isAutoProcessCode && !processCode && processAreaSigla) {
        processCode = isDemo
          ? reserveDemoDocumentCode(organizationId, "processo", processAreaSigla, codeSettings)
          : (
              await reserveCodeFn({
                data: { organizationId, type: "processo", areaSigla: processAreaSigla },
              })
            ).code;
      }
      const nowIso = new Date().toISOString();
      if (isDemo) {
        return {
          id: `demo-process-${Date.now()}`,
          organization_id: "demo",
          current_version: 1,
          code: processCode,
          name: draft.name,
          type: draft.type,
          value_chain_id: draft.valueChainId || null,
          parent_process_id: draft.parentProcessId || null,
          department: draft.department || null,
          owner: draft.owner || null,
          description: draft.description || null,
          status: "Ativo",
          created_at: nowIso,
          updated_at: nowIso,
        };
      }
      const row = (await saveProcess({
        data: {
          id: undefined,
          organizationId,
          code: processCode,
          name: draft.name,
          type: draft.type,
          valueChainId: draft.valueChainId || null,
          parentProcessId: draft.parentProcessId || null,
          department: draft.department || null,
          owner: draft.owner || null,
          description: draft.description || null,
          status: "Ativo",
        },
      })) as unknown as CreatedProcess;
      return row;
    },
    onSuccess: (process) => {
      toast.success("Processo cadastrado.");
      onCreated(process);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div
      className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]">
            {copy.icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold">Novo processo</h2>
            <p className="truncate text-xs text-muted-foreground">
              Cadastro de processo (mesmos campos do menu Cadastros)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Fechar"
            aria-label="Fechar formulário"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid gap-4 p-5">
          <RegistrationFields
            view="processes"
            draft={draft}
            setDraft={setDraft}
            data={data}
            autoCode={isAutoProcessCode}
            codePreview={processCodePreview}
            quickCreate={{
              onCreateValueChain: (name) => openRelatedCreate("valueChain", name),
              onCreateArea: (name) => openRelatedCreate("area", name),
              onCreateOwner: (name) => openRelatedCreate("owner", name),
            }}
          />
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending || !isValidDraft("processes", draft)}
            className={primaryButtonClass}
          >
            <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </footer>
      </form>
      {relatedCreate ? (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={(event) => event.target === event.currentTarget && setRelatedCreate(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              relatedCreateMutation.mutate();
            }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-[var(--gold)]">
                {registryCopy(relatedCreate.view).icon}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold">
                  Novo {registryCopy(relatedCreate.view).singular.toLowerCase()}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  Cadastro oficial usado em Cadastros
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRelatedCreate(null)}
                className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-4 p-5">
              <RegistrationFields
                view={relatedCreate.view}
                draft={relatedCreate.draft}
                setDraft={setRelatedDraft}
                data={data}
              />
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setRelatedCreate(null)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  relatedCreateMutation.isPending ||
                  !isValidDraft(relatedCreate.view, relatedCreate.draft)
                }
                className={primaryButtonClass}
              >
                <Save className="h-4 w-4" />{" "}
                {relatedCreateMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}

// Mesmo formulário do cadastro de sistemas (view "systems"), em modal, para
// permitir cadastrar um sistema novo sem sair do preenchimento do mapeamento.
export function SystemRegistrationDialog({
  organizationId,
  isDemo,
  initialName = "",
  onClose,
  onCreated,
}: {
  organizationId: string | null;
  isDemo: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (system: SystemItem) => void;
}) {
  const saveSystem = useServerFn(saveSystemRegistration);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const valid = name.trim().length >= 2;

  const mutation = useMutation({
    mutationFn: async (): Promise<SystemItem> => {
      if (isDemo) {
        return { id: `demo-system-${Date.now()}`, name: name.trim(), description };
      }
      const row = await saveSystem({
        data: { organizationId, name: name.trim(), description: description || null },
      });
      return { id: row.id, name: row.name, description: row.description ?? "" };
    },
    onSuccess: (system) => {
      toast.success("Sistema cadastrado.");
      onCreated(system);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="font-display text-lg font-bold">Novo sistema</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) mutation.mutate();
          }}
          className="grid gap-4 pt-4"
        >
          <Field label="Sistema">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do sistema"
              className={inputClass}
            />
          </Field>
          <Field label="Descrição">
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Informações pertinentes sobre o sistema"
              className={`${inputClass} h-auto py-2`}
            />
          </Field>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valid || mutation.isPending}
              className={primaryButtonClass}
            >
              <Save className="h-4 w-4" /> {mutation.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProcessStatusSwitch({
  process,
  disabled,
  onRequest,
}: {
  process?: Process;
  disabled?: boolean;
  onRequest: (process: Process, status: "Ativo" | "Arquivado") => void;
}) {
  if (!process) return null;
  const active = process.status === "Ativo";
  return (
    <button
      type="button"
      title={active ? "Desativar processo" : "Ativar processo"}
      aria-label={active ? "Desativar processo" : "Ativar processo"}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onRequest(process, active ? "Arquivado" : "Ativo")}
      className={`relative h-8 w-14 rounded-full border px-1 transition disabled:opacity-45 ${
        active
          ? "border-emerald-500/40 bg-emerald-500/15"
          : "border-border bg-muted"
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full transition ${
          active ? "translate-x-6 bg-emerald-600" : "translate-x-0 bg-muted-foreground"
        }`}
      />
    </button>
  );
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10";
const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-45";
