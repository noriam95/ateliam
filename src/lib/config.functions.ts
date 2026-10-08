import { documentTitle } from "./document-label";
import { bpmnListMetadata } from "./bpmn-list-metadata";
import {
  filterAndSortBpmnRows,
  type BpmnLibrarySortDirection,
  type BpmnLibrarySortField,
} from "./bpmn-library";
import { prepareMappingIdentity } from "./mapping-identity";
import { reserveOrganizationCode } from "./code-reservation";
import { dashboardRows } from "./dashboard-pagination";
import { isPortalCurrentStatus, normalizePortalText, type PortalDocument } from "./document-portal";
import { MODULE_IDS } from "@/lib/module-visibility";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  DOC_TYPES,
  type DocType,
  normalizeCodeSettings,
  normalizeSigla,
} from "@/lib/code-generation";
import { suggestAreaSigla } from "@/lib/mapping-temporary-areas";

type AppRole = "admin" | "editor" | "viewer";
type AuthContext = { supabase: SupabaseClient<Database>; userId: string };

const appRoleSchema = z.enum(["admin", "editor", "viewer"]);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado.")
  .optional()
  .nullable()
  .transform((value) => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
  });
const orgSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logo_data_url: z
    .string()
    .max(1_500_000)
    .optional()
    .nullable()
    .refine((value) => !value || value.startsWith("data:image/"), {
      message: "A logo precisa ser uma imagem.",
    }),
  word_header_color: z
    .string()
    .trim()
    .regex(/^#?[0-9A-Fa-f]{6}$/)
    .transform((value) => value.replace("#", "").toUpperCase()),
});
const codeRuleSchema = z.object({
  mode: z.enum(["auto", "manual"]).default("auto"),
  sequences: z.record(z.string(), z.number().int().min(1)).default({}),
});
const codeSettingsSchema = z.record(z.enum(DOC_TYPES), codeRuleSchema).nullish();
const orgCreateSchema = orgSchema.omit({ id: true }).extend({
  code_settings: codeSettingsSchema,
});
const orgUpdateSchema = orgSchema.extend({
  id: z.string().uuid(),
  code_settings: codeSettingsSchema,
});
const documentModelSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  model_key: z.enum(["ddp-word", "ddp-html", "pop-word"]),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  logo_data_url: z
    .string()
    .max(1_500_000)
    .optional()
    .nullable()
    .refine((value) => !value || value.startsWith("data:image/"), {
      message: "A logo precisa ser uma imagem.",
    }),
  primary_color: z
    .string()
    .trim()
    .regex(/^#?[0-9A-Fa-f]{6}$/)
    .transform((value) => value.replace("#", "").toUpperCase()),
});
const catalogNameSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
const catalogCauseSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  impact: z.string().trim().max(2000).optional().nullable(),
  action: z.string().trim().max(2000).optional().nullable(),
  priority: z.string().trim().max(40).optional().default("Média"),
  status: z
    .enum(["Não iniciada", "Em andamento", "Encerrado", "Cancelada"])
    .optional()
    .default("Não iniciada"),
  responsible: z.string().trim().max(180).optional().nullable(),
  process_id: z.string().uuid().optional().nullable(),
  due_date: z.string().trim().max(40).optional().nullable(),
  comments: z
    .array(
      z.object({
        id: z.string().max(120),
        text: z.string().max(2000),
        createdAt: z.string().max(80).optional(),
      }),
    )
    .optional()
    .default([]),
});
const processSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  type: z.enum(["process", "subprocess", "atividade", "tarefa"]).default("process"),
  parent_process_id: z.string().uuid().optional().nullable(),
  department: z.string().trim().max(160).optional().nullable(),
  owner: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["Ativo", "Em revisão", "Arquivado"]).default("Ativo"),
});
const moduleDocumentSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  id: z.string().uuid().optional().nullable(),
  moduleId: z.enum(["ddp", "pop", "bpmn"]),
  code: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(2).max(220),
  description: z.string().trim().max(1000).optional().nullable(),
  content: z.string().min(2).max(20_000_000),
  comment: z.string().trim().max(500).optional().nullable(),
  saveMode: z.enum(["draft", "final"]).default("final").optional(),
  primaryProcessId: z.string().uuid().optional().nullable(),
  primaryProcessVersion: z.number().int().positive().optional().nullable(),
});

function uppercaseModuleDocumentContent(content: string, moduleId: "ddp" | "pop" | "bpmn") {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const uppercase = (value: unknown) =>
      typeof value === "string" ? value.trim().toLocaleUpperCase("pt-BR") : value;

    if (typeof parsed.titulo === "string") parsed.titulo = uppercase(parsed.titulo);
    if (moduleId === "ddp") {
      const ddp = parsed.ddp as Record<string, unknown> | undefined;
      const meta = ddp?.meta as Record<string, unknown> | undefined;
      const macroprocess = ddp?.macroprocess as Record<string, unknown> | undefined;
      const legacy = ddp?.legacy as Record<string, unknown> | undefined;
      if (meta && typeof meta.titulo === "string") meta.titulo = uppercase(meta.titulo);
      if (macroprocess && typeof macroprocess.titulo === "string") {
        macroprocess.titulo = uppercase(macroprocess.titulo);
      }
      if (legacy && typeof legacy.processName === "string") {
        legacy.processName = uppercase(legacy.processName);
      }
    }
    if (moduleId === "pop") {
      const pop = parsed.pop as Record<string, unknown> | undefined;
      const meta = pop?.meta as Record<string, unknown> | undefined;
      if (meta) {
        if (typeof meta.titulo === "string") meta.titulo = uppercase(meta.titulo);
        if (typeof meta.processo === "string") meta.processo = uppercase(meta.processo);
      }
    }
    if (moduleId === "bpmn") {
      const bpmn = parsed.bpmn as Record<string, unknown> | undefined;
      if (bpmn && typeof bpmn.poolName === "string") bpmn.poolName = uppercase(bpmn.poolName);
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}
const organizationScopeSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
});
const valueChainSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(180),
  category: z.enum(["primary", "support", "management", "output"]),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Ativa", "Inativa"]).default("Ativa"),
  relatedChainIds: z.array(z.string().uuid()).default([]),
});
const systemRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .transform((value) => value.toLocaleUpperCase("pt-BR")),
  modality: z
    .enum([
      "Sistemas corporativos",
      "Ferramentas auxiliares",
      "Documentos e comunicações",
      "Fontes externas",
    ])
    .default("Sistemas corporativos"),
  description: z.string().trim().max(2000).optional().nullable(),
});
const positionRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
});

function isMissingExtendedCauseColumn(message: string) {
  return (
    /organization_causes|status|responsible|process_id|due_date|comments/i.test(message) &&
    /column|schema cache|could not find/i.test(message)
  );
}
const ownerRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  departmentIds: z.array(z.string().uuid()).optional().default([]),
  roleTitle: z.string().trim().min(2).max(160),
});
const processTypeRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  code: z.enum(["process", "subprocess", "atividade", "tarefa"]),
  label: z.string().trim().min(2).max(80),
  active: z.boolean().default(true),
});
const processRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  type: z.enum(["process", "subprocess", "atividade", "tarefa"]),
  valueChainId: z.string().uuid().optional().nullable(),
  parentProcessId: z.string().uuid().optional().nullable(),
  department: z.string().trim().max(160).optional().nullable(),
  owner: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["Ativo", "Em revisão", "Arquivado"]).default("Ativo"),
});

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function rolesFor(context: AuthContext, userId = context.userId) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role) as AppRole[];
}

async function profileFor(context: AuthContext, userId = context.userId) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Perfil não encontrado.");
  return data;
}

async function permissionContext(context: AuthContext, requestedOrganizationId?: string | null) {
  const [profile, roles] = await Promise.all([profileFor(context), rolesFor(context)]);
  const isAdmin = roles.includes("admin");
  const organizationId = requestedOrganizationId || profile.organization_id;
  if (organizationId !== profile.organization_id && !isAdmin) {
    const { data: membership, error } = await context.supabase
      .from("user_organization_access")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!membership) throw new Error("Você não possui acesso a esta organização.");
  }
  return {
    profile,
    roles,
    organizationId,
    isAdmin,
  };
}

async function assertOrganizationAdmin(context: AuthContext, organizationId?: string) {
  const access = await permissionContext(context, organizationId);
  if (!access.isAdmin) throw new Error("Acesso restrito a administradores da organização.");
  return access;
}

async function assertOrganizationEditor(context: AuthContext, organizationId?: string) {
  const access = await permissionContext(context, organizationId);
  if (!access.roles.some((role) => role === "admin" || role === "editor")) {
    throw new Error("Acesso restrito a administradores e editores da organização.");
  }
  return access;
}

export const getAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    const { isSharePointConfigured } = await import("./sharepoint.server");
    return { config: data, connectorReady: isSharePointConfigured() };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { display_name?: string; avatar_data_url?: string | null }) =>
    z
      .object({
        display_name: z.string().trim().min(2).max(120).optional(),
        avatar_data_url: z
          .string()
          .max(1_500_000)
          .nullable()
          .optional()
          .refine((value) => !value || value.startsWith("data:image/"), {
            message: "A foto precisa ser uma imagem.",
          }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const updates: {
      display_name?: string;
      avatar_data_url?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };
    if (data.display_name !== undefined) updates.display_name = data.display_name;
    if (data.avatar_data_url !== undefined) updates.avatar_data_url = data.avatar_data_url;
    const { error } = await context.supabase
      .from("profiles")
      .update(updates)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await permissionContext(context);
    let query = context.supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });
    if (!access.isAdmin) query = query.eq("id", access.organizationId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAccessibleOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await permissionContext(context);
    let organizationIds: string[] | null = null;
    const { data: memberships, error: membershipError } = await context.supabase
      .from("user_organization_access")
      .select("organization_id, is_default")
      .eq("user_id", context.userId);
    if (membershipError) throw new Error(membershipError.message);
    if (!access.isAdmin) {
      organizationIds = Array.from(
        new Set([
          access.profile.organization_id,
          ...(memberships ?? []).map((row) => row.organization_id),
        ]),
      );
    }
    let organizationQuery = context.supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });
    if (organizationIds) organizationQuery = organizationQuery.in("id", organizationIds);
    const { data: organizations, error: organizationError } = await organizationQuery;
    if (organizationError) throw new Error(organizationError.message);
    return (organizations ?? []).map((organization) => {
      const membership = (memberships ?? []).find((row) => row.organization_id === organization.id);
      return {
        ...organization,
        isDefault: membership?.is_default || organization.id === access.profile.organization_id,
      };
    });
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof orgCreateSchema>) => orgCreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrganizationAdmin(context);
    const { data: row, error } = await context.supabase
      .from("organizations")
      .insert({
        name: data.name,
        slug: data.slug,
        logo_data_url: data.logo_data_url ?? null,
        word_header_color: data.word_header_color,
        ...(data.code_settings ? { code_settings: normalizeCodeSettings(data.code_settings) } : {}),
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { error: typeError } = await context.supabase.from("organization_process_types").insert([
      {
        organization_id: row.id,
        code: "process",
        label: "Processo",
      },
      {
        organization_id: row.id,
        code: "subprocess",
        label: "Subprocesso",
      },
      {
        organization_id: row.id,
        code: "atividade",
        label: "Atividade",
      },
      {
        organization_id: row.id,
        code: "tarefa",
        label: "Tarefa",
      },
    ]);
    if (typeError) throw new Error(typeError.message);
    return row;
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof orgUpdateSchema>) => orgUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrganizationAdmin(context, data.id);
    const { data: row, error } = await context.supabase
      .from("organizations")
      .update({
        name: data.name,
        slug: data.slug,
        logo_data_url: data.logo_data_url ?? null,
        word_header_color: data.word_header_color,
        ...(data.code_settings ? { code_settings: normalizeCodeSettings(data.code_settings) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const ORGANIZATION_LINKED_RECORD_CHECKS: Array<{
  table:
    | "organization_departments"
    | "organization_process_owners"
    | "organization_value_chains"
    | "organization_causes"
    | "organization_processes"
    | "documents"
    | "profiles";
  label: string;
}> = [
  { table: "organization_departments", label: "áreas" },
  { table: "organization_process_owners", label: "donos de processo" },
  { table: "organization_value_chains", label: "cadeias de valor" },
  { table: "organization_causes", label: "oportunidades de melhoria" },
  { table: "organization_processes", label: "processos" },
  { table: "documents", label: "documentos" },
  { table: "profiles", label: "usuários vinculados" },
];

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrganizationAdmin(context, data.id);

    for (const check of ORGANIZATION_LINKED_RECORD_CHECKS) {
      const { count, error } = await context.supabase
        .from(check.table)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.id);
      if (error) throw new Error(error.message);
      if ((count ?? 0) > 0) {
        throw new Error(
          `Não é possível excluir: existem ${check.label} vinculados a esta organização.`,
        );
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Gera o próximo código para um tipo de cadastro e incrementa a sequência da
// organização de forma atômica (servidor é a fonte da verdade no modo real).
export const reserveCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null; type: DocType; areaSigla: string }) =>
    z
      .object({
        organizationId: z.string().uuid().optional().nullable(),
        type: z.enum(DOC_TYPES),
        areaSigla: z.string().trim().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    // Editors can reserve codes, but organization settings themselves are admin-only in RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = await reserveOrganizationCode(
      supabaseAdmin,
      access.organizationId,
      data.type,
      data.areaSigla,
    );
    return { code };
  });

export const listOrganizationDocumentModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("organization_document_models")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("model_key", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveOrganizationDocumentModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof documentModelSchema>) => documentModelSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationAdmin(context, data.organizationId ?? undefined);
    const { data: row, error } = await context.supabase
      .from("organization_document_models")
      .upsert(
        {
          organization_id: access.organizationId,
          model_key: data.model_key,
          name: data.name,
          description: data.description ?? null,
          logo_data_url: data.logo_data_url ?? null,
          primary_color: data.primary_color,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,model_key" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listOrganizationCatalogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const organizationId = access.organizationId;
    const [
      { data: departments, error: departmentsError },
      { data: processOwners, error: ownersError },
      { data: extendedCauses, error: causesError },
      { data: processes, error: processesError },
      { data: valueChains, error: valueChainsError },
      { data: systems, error: systemsError },
      { data: positions, error: positionsError },
    ] = await Promise.all([
      context.supabase
        .from("organization_departments")
        .select("id, name, sigla, organization_id, created_at, updated_at")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      context.supabase
        .from("organization_process_owners")
        .select("id, name, organization_id, created_at, updated_at")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      context.supabase
        .from("organization_causes")
        .select(
          "id, title, description, impact, action, priority, status, responsible, process_id, due_date, comments, organization_id, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("title", { ascending: true }),
      context.supabase
        .from("organization_processes")
        .select(
          "id, code, name, type, value_chain_id, parent_process_id, department, owner, description, status, current_version, organization_id, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      context.supabase
        .from("organization_value_chains")
        .select("id, name, category, description, status, organization_id, created_at, updated_at")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      (context.supabase as any)
        .from("organization_systems")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }) as Promise<{
        data:
          | {
              id: string;
              name: string;
              modality?:
                | "Sistemas corporativos"
                | "Ferramentas auxiliares"
                | "Documentos e comunicações"
                | "Fontes externas";
              description: string | null;
            }[]
          | null;
        error: { message: string } | null;
      }>,
      (context.supabase as any)
        .from("organization_positions")
        .select("id, title, description, organization_id, created_at, updated_at")
        .eq("organization_id", organizationId)
        .order("title", { ascending: true }) as Promise<{
        data: { id: string; title: string; description: string | null }[] | null;
        error: { message: string } | null;
      }>,
    ]);
    if (departmentsError) throw new Error(departmentsError.message);
    if (ownersError) throw new Error(ownersError.message);
    let causes = extendedCauses;
    if (causesError) {
      if (!isMissingExtendedCauseColumn(causesError.message)) throw new Error(causesError.message);
      const legacyResult = await context.supabase
        .from("organization_causes")
        .select(
          "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("title", { ascending: true });
      if (legacyResult.error) throw new Error(legacyResult.error.message);
      causes = (legacyResult.data ?? []).map((cause) => ({
        ...cause,
        status: "Não iniciada",
        responsible: null,
        process_id: null,
        due_date: null,
        comments: [],
      }));
    }
    if (processesError) throw new Error(processesError.message);
    if (valueChainsError) throw new Error(valueChainsError.message);
    // organization_systems só existe depois que a migração correspondente é
    // aplicada; não deixa a falta dela derrubar o resto dos catálogos.
    if (systemsError) console.error("organization_systems:", systemsError.message);
    if (positionsError) console.error("organization_positions:", positionsError.message);
    return {
      departments: departments ?? [],
      processOwners: processOwners ?? [],
      causes: causes ?? [],
      processes: (processes ?? []).filter((process) => process.type !== "macroprocess"),
      valueChains: (valueChains ?? []).map((chain) => ({
        ...chain,
        name: chain.name.trim().toLocaleUpperCase("pt-BR"),
      })),
      systems: (systems ?? []).map((system) => ({
        ...system,
        name: system.name.trim().toLocaleUpperCase("pt-BR"),
      })),
      positions: positions ?? [],
    };
  });

export const listProcessRegistrationData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const organizationId = access.organizationId;
    const [areas, owners, types, valueChains, processes, systems, positions, valueChainRelations] =
      await Promise.all([
        context.supabase
          .from("organization_departments")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        context.supabase
          .from("organization_process_owners")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        context.supabase
          .from("organization_process_types")
          .select("*")
          .eq("organization_id", organizationId)
          .order("code"),
        context.supabase
          .from("organization_value_chains")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        context.supabase
          .from("organization_processes")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        (context.supabase as any)
          .from("organization_systems")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name") as Promise<{
          data:
            | {
                id: string;
                name: string;
                modality?:
                  | "Sistemas corporativos"
                  | "Ferramentas auxiliares"
                  | "Documentos e comunicações"
                  | "Fontes externas";
                description: string | null;
              }[]
            | null;
          error: { message: string } | null;
        }>,
        (context.supabase as any)
          .from("organization_positions")
          .select("*")
          .eq("organization_id", organizationId)
          .order("title") as Promise<{
          data: { id: string; title: string; description: string | null }[] | null;
          error: { message: string } | null;
        }>,
        (context.supabase as any)
          .from("organization_value_chain_output_relations")
          .select("output_id, chain_id")
          .eq("organization_id", organizationId) as Promise<{
          data: { output_id: string; chain_id: string }[] | null;
          error: { message: string } | null;
        }>,
      ]);
    for (const result of [areas, owners, types, valueChains, processes]) {
      if (result.error) throw new Error(result.error.message);
    }
    // organization_systems só existe depois que a migração correspondente é
    // aplicada; não deixa a falta dela derrubar o resto dos catálogos.
    if (systems.error) console.error("organization_systems:", systems.error.message);
    if (positions.error) console.error("organization_positions:", positions.error.message);
    if (valueChainRelations.error) {
      console.error(
        "organization_value_chain_output_relations:",
        valueChainRelations.error.message,
      );
    }
    return {
      organizationId,
      areas: areas.data ?? [],
      owners: owners.data ?? [],
      types: (types.data ?? []).filter((type) => type.code !== "macroprocess"),
      valueChains: (valueChains.data ?? []).map((chain) => ({
        ...chain,
        name: chain.name.trim().toLocaleUpperCase("pt-BR"),
      })),
      processes: (processes.data ?? []).filter((process) => process.type !== "macroprocess"),
      systems: (systems.data ?? []).map((system) => ({
        ...system,
        name: system.name.trim().toLocaleUpperCase("pt-BR"),
      })),
      positions: positions.data ?? [],
      valueChainRelations: valueChainRelations.data ?? [],
    };
  });

export const saveProcessArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id?: string; organizationId?: string | null; name: string; sigla: string }) =>
    organizationScopeSchema
      .extend({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(120),
        sigla: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{3}$/, "A sigla deve ter exatamente 3 letras.")
          .transform((value) => value.toUpperCase()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    let previousName: string | null = null;
    if (data.id) {
      const { data: previous, error: previousError } = await context.supabase
        .from("organization_departments")
        .select("name")
        .eq("id", data.id)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (previousError) throw new Error(previousError.message);
      previousName = previous?.name ?? null;
    }
    // Sigla única por organização garante códigos de documento sem ambiguidade.
    const { data: clash, error: clashError } = await context.supabase
      .from("organization_departments")
      .select("id")
      .eq("organization_id", access.organizationId)
      .eq("sigla", data.sigla)
      .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    if (clashError) throw new Error(clashError.message);
    if (clash) throw new Error(`Já existe uma área com a sigla ${data.sigla}.`);
    const payload = {
      organization_id: access.organizationId,
      name: data.name,
      sigla: data.sigla,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? context.supabase.from("organization_departments").update(payload).eq("id", data.id)
      : context.supabase
          .from("organization_departments")
          .insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveSuggestedProcessArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    organizationScopeSchema
      .extend({
        name: z.string().trim().min(2).max(120),
        preferredSigla: z.string().trim().max(3).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const { data: departments, error: listError } = await context.supabase
      .from("organization_departments")
      .select("id,name,sigla")
      .eq("organization_id", access.organizationId);
    if (listError) throw new Error(listError.message);
    const existing = (departments ?? []).find(
      (area) => normalizePortalText(area.name) === normalizePortalText(data.name),
    );
    if (existing) return existing;
    const used = (departments ?? []).map((area) => area.sigla).filter(Boolean) as string[];
    const preferred = normalizeSigla(data.preferredSigla);
    const sigla =
      preferred.length === 3 && !used.includes(preferred)
        ? preferred
        : suggestAreaSigla(data.name, used);
    const { data: row, error } = await context.supabase
      .from("organization_departments")
      .insert({
        organization_id: access.organizationId,
        name: data.name.trim(),
        sigla,
        created_by: context.userId,
      })
      .select("id,name,sigla")
      .single();
    if (!error) return row;
    if (error.code === "23505") {
      const { data: concurrent, error: concurrentError } = await context.supabase
        .from("organization_departments")
        .select("id,name,sigla")
        .eq("organization_id", access.organizationId);
      if (concurrentError) throw new Error(concurrentError.message);
      const match = (concurrent ?? []).find(
        (area) => normalizePortalText(area.name) === normalizePortalText(data.name),
      );
      if (match) return match;
    }
    throw new Error(error.message);
  });

export const saveProcessOwnerRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof ownerRegistrationSchema>) => ownerRegistrationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    let previousNames: string[] = [];
    if (data.id) {
      const { data: previous, error: previousError } = await context.supabase
        .from("organization_process_owners")
        .select("name, role_title")
        .eq("id", data.id)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (previousError) throw new Error(previousError.message);
      previousNames = [previous?.name, previous?.role_title].filter(Boolean) as string[];
    }
    const requestedAreaIds = data.departmentIds.length ? data.departmentIds : [data.departmentId];
    const { data: areas, error: areaError } = await context.supabase
      .from("organization_departments")
      .select("id, name")
      .in("id", requestedAreaIds)
      .eq("organization_id", access.organizationId)
      .order("name");
    if (areaError) throw new Error(areaError.message);
    if (!areas?.length) throw new Error("Selecione ao menos uma área válida.");
    const areaIds = areas.map((area) => area.id);
    const areaNames = areas.map((area) => area.name);
    const payload = {
      organization_id: access.organizationId,
      department_id: areaIds[0],
      department_ids: areaIds,
      role_title: data.roleTitle,
      name: data.roleTitle,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? context.supabase.from("organization_process_owners").update(payload).eq("id", data.id)
      : context.supabase
          .from("organization_process_owners")
          .insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    const aliases = Array.from(
      new Set([
        ...previousNames,
        ...previousNames.flatMap((name) => areaNames.map((areaName) => `${name} · ${areaName}`)),
      ]),
    ).filter((name) => name && name !== data.roleTitle);
    for (const alias of aliases) {
      const { error: processError } = await context.supabase
        .from("organization_processes")
        .update({ owner: data.roleTitle, updated_at: new Date().toISOString() })
        .eq("organization_id", access.organizationId)
        .eq("owner", alias);
      if (processError) throw new Error(processError.message);
    }
    return row;
  });

export const savePositionRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof positionRegistrationSchema>) =>
    positionRegistrationSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const payload = {
      organization_id: access.organizationId,
      title: data.title,
      description: data.description ?? null,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? (context.supabase as any)
          .from("organization_positions")
          .update(payload)
          .eq("id", data.id)
          .eq("organization_id", access.organizationId)
      : (context.supabase as any)
          .from("organization_positions")
          .insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveProcessTypeRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof processTypeRegistrationSchema>) =>
    processTypeRegistrationSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const { data: row, error } = await context.supabase
      .from("organization_process_types")
      .upsert(
        {
          organization_id: access.organizationId,
          code: data.code,
          label: data.label,
          active: data.active,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,code" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveValueChainRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof valueChainSchema>) => valueChainSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const payload = {
      organization_id: access.organizationId,
      name: data.name.trim().toLocaleUpperCase("pt-BR"),
      category: data.category,
      description: data.description ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? context.supabase.from("organization_value_chains").update(payload).eq("id", data.id)
      : context.supabase
          .from("organization_value_chains")
          .insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    const relations = context.supabase as any;
    const { error: deleteRelationsError } = await relations
      .from("organization_value_chain_output_relations")
      .delete()
      .eq("output_id", row.id)
      .eq("organization_id", access.organizationId);
    if (deleteRelationsError) throw new Error(deleteRelationsError.message);

    if (data.category === "output" && data.relatedChainIds.length) {
      const uniqueRelatedIds = [...new Set(data.relatedChainIds)];
      const { data: relatedChains, error: relatedChainsError } = await context.supabase
        .from("organization_value_chains")
        .select("id, category")
        .eq("organization_id", access.organizationId)
        .in("id", uniqueRelatedIds);
      if (relatedChainsError) throw new Error(relatedChainsError.message);
      const validIds = (relatedChains ?? [])
        .filter((chain) => chain.category !== "output")
        .map((chain) => chain.id);
      if (validIds.length !== uniqueRelatedIds.length) {
        throw new Error("Uma ou mais relações da saída são inválidas.");
      }
      const { error: insertRelationsError } = await relations
        .from("organization_value_chain_output_relations")
        .insert(
          validIds.map((chainId) => ({
            organization_id: access.organizationId,
            output_id: row.id,
            chain_id: chainId,
          })),
        );
      if (insertRelationsError) throw new Error(insertRelationsError.message);
    }
    return row;
  });

export const saveSystemRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof systemRegistrationSchema>) =>
    systemRegistrationSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const payload = {
      organization_id: access.organizationId,
      name: data.name.trim().toLocaleUpperCase("pt-BR"),
      modality: data.modality,
      description: data.description ?? null,
      updated_at: new Date().toISOString(),
    };
    const table = context.supabase.from("organization_systems" as any);
    const query = data.id
      ? table.update(payload).eq("id", data.id)
      : table.insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveProcessRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof processRegistrationSchema>) =>
    processRegistrationSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const payload = {
      organization_id: access.organizationId,
      code: data.code ?? null,
      name: data.name.trim().toLocaleUpperCase("pt-BR"),
      type: data.type,
      value_chain_id: data.valueChainId ?? null,
      parent_process_id: data.parentProcessId ?? null,
      department: data.department ?? null,
      owner: data.owner ? cleanOwnerLabel(data.owner, "") : null,
      description: data.description ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    // Processos não são versionados: não incrementamos current_version nem
    // gravamos histórico em organization_process_versions.
    if (!data.id) {
      const { data: row, error } = await context.supabase
        .from("organization_processes")
        .insert({ ...payload, current_version: 1, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("organization_processes")
      .update(payload)
      .eq("id", data.id)
      .eq("organization_id", access.organizationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProcessRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { organizationId?: string | null; kind: string; id?: string; ids?: string[] }) =>
      organizationScopeSchema
        .extend({
          kind: z.enum(["value-chain", "process", "area", "owner", "system", "position"]),
          id: z.string().uuid().optional(),
          ids: z.array(z.string().uuid()).min(1).max(500).optional(),
        })
        .refine((value) => value.id || value.ids?.length, {
          message: "Informe ao menos um registro para exclusão.",
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const ids = data.ids ?? (data.id ? [data.id] : []);
    const table =
      data.kind === "value-chain"
        ? "organization_value_chains"
        : data.kind === "process"
          ? "organization_processes"
          : data.kind === "area"
            ? "organization_departments"
            : data.kind === "system"
              ? "organization_systems"
              : data.kind === "position"
                ? "organization_positions"
                : "organization_process_owners";
    const { error } = await context.supabase
      .from(table as any)
      .delete()
      .in("id", ids)
      .eq("organization_id", access.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createOrganizationDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string }) => catalogNameSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    // Sigla provisória derivada do nome (3 letras); fica nula em caso de colisão
    // e pode ser ajustada depois no cadastro completo de Área.
    const candidate = normalizeSigla(data.name);
    let sigla: string | null = candidate.length === 3 ? candidate : null;
    if (sigla) {
      const { data: clash } = await context.supabase
        .from("organization_departments")
        .select("id")
        .eq("organization_id", access.organizationId)
        .eq("sigla", sigla)
        .maybeSingle();
      if (clash) sigla = null;
    }
    const { data: row, error } = await context.supabase
      .from("organization_departments")
      .insert({
        organization_id: access.organizationId,
        name: data.name,
        sigla,
        created_by: context.userId,
      })
      .select("id, name, sigla, organization_id, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createOrganizationProcessOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string }) => catalogNameSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const { data: row, error } = await context.supabase
      .from("organization_process_owners")
      .insert({
        organization_id: access.organizationId,
        name: data.name,
        created_by: context.userId,
      })
      .select("id, name, organization_id, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOrganizationCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { kind: "department" | "owner"; id: string; name: string }) =>
    z
      .object({
        kind: z.enum(["department", "owner"]),
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    if (data.kind === "department") {
      const { data: row, error } = await context.supabase
        .from("organization_departments")
        .update({ name: data.name })
        .eq("id", data.id)
        .eq("organization_id", access.organizationId)
        .select("id, name, organization_id, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("organization_process_owners")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("organization_id", access.organizationId)
      .select("id, name, organization_id, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteOrganizationCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { kind: "department" | "owner"; id: string }) =>
    z.object({ kind: z.enum(["department", "owner"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const result =
      data.kind === "department"
        ? await context.supabase
            .from("organization_departments")
            .delete()
            .eq("id", data.id)
            .eq("organization_id", access.organizationId)
        : await context.supabase
            .from("organization_process_owners")
            .delete()
            .eq("id", data.id)
            .eq("organization_id", access.organizationId);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const createOrganizationCause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof catalogCauseSchema>) => catalogCauseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const basePayload = {
      organization_id: access.organizationId,
      title: data.title,
      description: data.description ?? null,
      impact: data.impact ?? null,
      action: data.action ?? null,
      priority: data.priority || "Média",
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("organization_causes")
      .insert({
        ...basePayload,
        status: data.status,
        responsible: data.responsible ?? null,
        process_id: data.process_id ?? null,
        due_date: data.due_date ?? null,
        comments: data.comments,
      })
      .select(
        "id, title, description, impact, action, priority, status, responsible, process_id, due_date, comments, organization_id, created_at, updated_at",
      )
      .single();
    if (error && isMissingExtendedCauseColumn(error.message)) {
      const legacyResult = await context.supabase
        .from("organization_causes")
        .insert(basePayload)
        .select(
          "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
        )
        .single();
      if (legacyResult.error) throw new Error(legacyResult.error.message);
      return {
        ...legacyResult.data,
        status: data.status,
        responsible: data.responsible ?? null,
        process_id: null,
        due_date: data.due_date ?? null,
        comments: data.comments,
      };
    }
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOrganizationCause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof catalogCauseSchema> & { id: string }) =>
    catalogCauseSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const basePayload = {
      title: data.title,
      description: data.description ?? null,
      impact: data.impact ?? null,
      action: data.action ?? null,
      priority: data.priority || "Média",
    };
    const { data: row, error } = await context.supabase
      .from("organization_causes")
      .update({
        ...basePayload,
        status: data.status,
        responsible: data.responsible ?? null,
        process_id: data.process_id ?? null,
        due_date: data.due_date ?? null,
        comments: data.comments,
      })
      .eq("id", data.id)
      .eq("organization_id", access.organizationId)
      .select(
        "id, title, description, impact, action, priority, status, responsible, process_id, due_date, comments, organization_id, created_at, updated_at",
      )
      .single();
    if (error && isMissingExtendedCauseColumn(error.message)) {
      const legacyResult = await context.supabase
        .from("organization_causes")
        .update(basePayload)
        .eq("id", data.id)
        .eq("organization_id", access.organizationId)
        .select(
          "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
        )
        .single();
      if (legacyResult.error) throw new Error(legacyResult.error.message);
      return {
        ...legacyResult.data,
        status: data.status,
        responsible: data.responsible ?? null,
        process_id: null,
        due_date: data.due_date ?? null,
        comments: data.comments,
      };
    }
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteOrganizationCause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null; id: string }) =>
    organizationScopeSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const { error } = await context.supabase
      .from("organization_causes")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", access.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createOrganizationProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof processSchema>) => processSchema.omit({ id: true }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const { data: row, error } = await context.supabase
      .from("organization_processes")
      .insert({
        organization_id: access.organizationId,
        code: data.code || null,
        name: data.name,
        type: data.type,
        parent_process_id: data.parent_process_id || null,
        department: data.department || null,
        owner: data.owner ? cleanOwnerLabel(data.owner, "") : null,
        description: data.description || null,
        status: data.status,
        current_version: 1,
        created_by: context.userId,
      })
      .select(
        "id, code, name, type, parent_process_id, department, owner, description, status, current_version, organization_id, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);

    return row;
  });

export const updateOrganizationProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof processSchema>) =>
    processSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const { data: current, error: currentError } = await context.supabase
      .from("organization_processes")
      .select("*")
      .eq("id", data.id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!access.isAdmin && current.organization_id !== access.organizationId) {
      throw new Error("Você só pode alterar processos da sua organização.");
    }
    const { data: row, error } = await context.supabase
      .from("organization_processes")
      .update({
        code: data.code || null,
        name: data.name,
        type: data.type,
        parent_process_id: data.parent_process_id || null,
        department: data.department || null,
        owner: data.owner ? cleanOwnerLabel(data.owner, "") : null,
        description: data.description || null,
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select(
        "id, code, name, type, parent_process_id, department, owner, description, status, current_version, organization_id, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);

    return row;
  });

export const deleteOrganizationProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const { error } = await context.supabase
      .from("organization_processes")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", access.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listModuleDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null; moduleId: "ddp" | "pop" | "bpmn" }) =>
    organizationScopeSchema.extend({ moduleId: z.enum(["ddp", "pop", "bpmn"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("documents")
      .select(
        "id, name, description, module, current_version, updated_at, primary_process_id, primary_process_version, content_inline",
      )
      .eq("organization_id", access.organizationId)
      .eq("module", data.moduleId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

function portalMetadataStrings(value: unknown, target: string[] = [], depth = 0): string[] {
  if (target.length >= 120 || depth > 5 || value == null) return target;
  if (typeof value === "string") {
    const text = value.trim();
    if (text && text.length <= 1000 && !text.startsWith("data:") && !text.startsWith("<svg")) {
      target.push(text);
    }
    return target;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) portalMetadataStrings(item, target, depth + 1);
    return target;
  }
  if (typeof value !== "object") return target;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(xml|src|image|logo|content|content_inline)$/i.test(key)) continue;
    portalMetadataStrings(nested, target, depth + 1);
    if (target.length >= 120) break;
  }
  return target;
}

function portalStatusFromContent(module: string, contentInline: string | null) {
  try {
    const parsed = JSON.parse(contentInline ?? "{}") as Record<string, unknown>;
    const source =
      parsed.modules && typeof parsed.modules === "object"
        ? (parsed.modules as Record<string, unknown>)
        : parsed;
    if (module === "ddp") return readString(objectAt(objectAt(source, "ddp"), "meta").status, "");
    if (module === "pop") return readString(objectAt(objectAt(source, "pop"), "meta").status, "");
    const nestedBpmn = objectAt(source, "bpmn");
    const bpmn = Object.keys(nestedBpmn).length ? nestedBpmn : parsed;
    return readString(bpmn.status, "");
  } catch {
    return "";
  }
}

export const listPortalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null }) => organizationScopeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const [documentResult, processResult] = await Promise.all([
      dashboardRows(
        context.supabase
          .from("documents")
          .select(
            "id,name,description,module,current_version,updated_at,created_at,primary_process_id,content_inline",
          )
          .eq("organization_id", access.organizationId)
          .in("module", ["ddp", "pop", "bpmn"])
          .order("updated_at", { ascending: false }),
      ),
      dashboardRows(
        context.supabase
          .from("organization_processes")
          .select("id,parent_process_id,name,type,department,owner,description,status")
          .eq("organization_id", access.organizationId),
      ),
    ]);
    if (documentResult.error) throw new Error(documentResult.error.message);
    if (processResult.error) throw new Error(processResult.error.message);

    const processById = new Map(
      (processResult.data ?? []).map((process) => [process.id, process] as const),
    );
    const hierarchyFor = (processId: string | null) => {
      const hierarchy: Array<(typeof processResult.data)[number]> = [];
      const visited = new Set<string>();
      let current = processId ? processById.get(processId) : undefined;
      while (current && !visited.has(current.id) && hierarchy.length < 8) {
        hierarchy.unshift(current);
        visited.add(current.id);
        current = current.parent_process_id
          ? processById.get(current.parent_process_id)
          : undefined;
      }
      return hierarchy;
    };

    const documents: PortalDocument[] = [];
    for (const document of documentResult.data ?? []) {
      if (document.module !== "ddp" && document.module !== "pop" && document.module !== "bpmn") {
        continue;
      }
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(document.content_inline ?? "{}") as Record<string, unknown>;
      } catch {
        continue;
      }
      const source =
        parsed.modules && typeof parsed.modules === "object"
          ? (parsed.modules as Record<string, unknown>)
          : parsed;
      const ddp = objectAt(source, "ddp");
      const pop = objectAt(source, "pop");
      const nestedBpmn = objectAt(source, "bpmn");
      const bpmn = Object.keys(nestedBpmn).length ? nestedBpmn : parsed;
      const ddpMeta = objectAt(ddp, "meta");
      const ddpMacro = objectAt(ddp, "macroprocess");
      const ddpLegacy = objectAt(ddp, "legacy");
      const ddpOverview = objectAt(ddp, "overview");
      const popMeta = objectAt(pop, "meta");
      const popPurpose = objectAt(pop, "purpose");
      const hierarchy = hierarchyFor(document.primary_process_id);
      const registeredMacro = hierarchy.find((item) => item.type === "macroprocess");
      const registeredProcess = hierarchy.find((item) => item.type === "process");
      const registeredSubprocess = [...hierarchy]
        .reverse()
        .find((item) => item.type === "subprocess");
      const registeredLeaf = hierarchy.at(-1);

      const status = portalStatusFromContent(document.module, document.content_inline);
      if (!isPortalCurrentStatus(status)) continue;

      const title =
        document.module === "ddp"
          ? readString(ddpMeta.titulo, document.name)
          : document.module === "pop"
            ? readString(popMeta.titulo, document.name)
            : readString(bpmn.processName, readString(bpmn.poolName, document.name));
      const code =
        document.module === "ddp"
          ? readString(ddpMeta.codigo, "")
          : document.module === "pop"
            ? readString(popMeta.codigo, "")
            : readString(bpmn.codigo, "");
      const type =
        document.module === "ddp"
          ? "Mapeamento de processo"
          : document.module === "bpmn"
            ? "Fluxograma BPMN"
            : readString(popMeta.tipo, "Documento");
      const area = readString(
        registeredLeaf?.department,
        document.module === "ddp"
          ? readString(ddpLegacy.processArea, readString(ddpMeta.area, ""))
          : document.module === "pop"
            ? readString(popMeta.area, "")
            : readString(bpmn.area, ""),
      );
      const process = readString(
        registeredProcess?.name,
        document.module === "ddp"
          ? readString(ddpMacro.titulo, readString(ddpLegacy.processName, ""))
          : document.module === "pop"
            ? readString(popMeta.processo, "")
            : readString(bpmn.processName, readString(bpmn.poolName, "")),
      );
      const description = readString(
        document.description,
        document.module === "ddp"
          ? readString(ddpOverview.objetivo, "")
          : document.module === "pop"
            ? readString(popPurpose.objetivo, "")
            : "",
      );
      const responsible = readString(
        registeredLeaf?.owner,
        document.module === "ddp"
          ? readString(ddpMeta.elaborador, readString(ddpOverview.donoProcesso, ""))
          : document.module === "pop"
            ? readString(popMeta.elaboracao, readString(popMeta.aprovacao, ""))
            : "",
      );
      const revision = readString(
        document.module === "ddp"
          ? ddpMeta.versao
          : document.module === "pop"
            ? popMeta.versao
            : document.current_version,
        document.current_version ? String(document.current_version) : "1",
      );
      const effectiveAt = readString(
        document.module === "pop"
          ? popMeta.vigencia || popMeta.publicacao
          : document.module === "ddp"
            ? ddpMeta.data || ddpMeta.dataRelatorio
            : document.updated_at,
        document.updated_at,
      );
      const metadata = portalMetadataStrings(source);
      const explicitTags = [
        ...(Array.isArray(ddpMeta.tags) ? ddpMeta.tags : []),
        ...(Array.isArray(popMeta.tags) ? popMeta.tags : []),
        readString(ddpMeta.palavrasChave, ""),
        readString(popMeta.palavrasChave, ""),
      ]
        .flatMap((value) => String(value ?? "").split(/[,;]+/))
        .map((value) => value.trim())
        .filter(Boolean);
      const tags = Array.from(
        new Set([...explicitTags, area, process, type].filter(Boolean)),
      ).slice(0, 12);

      documents.push({
        id: document.id,
        module: document.module,
        moduleLabel:
          document.module === "ddp"
            ? "Mapeamento"
            : document.module === "pop"
              ? "Documentação"
              : "Fluxograma",
        title,
        code,
        type,
        area,
        macroprocess: readString(registeredMacro?.name, ""),
        process,
        subprocess: readString(registeredSubprocess?.name, ""),
        description,
        tags,
        responsible,
        status,
        revision,
        effectiveAt,
        updatedAt: document.updated_at,
        createdAt: document.created_at,
        searchText: normalizePortalText(metadata.join(" ")).slice(0, 8000),
      });
    }
    return documents;
  });

export const deleteModuleDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null; id: string }) =>
    organizationScopeSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const { error } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", access.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getModuleDocumentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("documents")
      .select(
        "id, name, module, content_inline, current_version, primary_process_id, primary_process_version, organization_id, updated_at, created_at, owner_id",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getPortalDocumentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("documents")
      .select(
        "id, name, module, content_inline, current_version, primary_process_id, primary_process_version, organization_id, updated_at, created_at, owner_id",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (!isPortalCurrentStatus(portalStatusFromContent(row.module, row.content_inline))) {
      throw new Error("Este documento não está vigente e não pode ser exibido no Portal.");
    }
    return row;
  });

const bpmnSaveSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid(),
  mutationId: z.string().uuid(),
  saveMode: z.enum(["draft", "final"]).default("draft"),
  expectedVersion: z.number().int().nonnegative().nullable(),
  expectedUpdatedAt: z.string().nullable(),
  document: z.object({
    schemaVersion: z.literal(2),
    xml: z.string().max(12_000_000),
    processId: z.string().uuid(),
    processName: z.string().max(500),
    status: z.enum(["Rascunho", "Em revisão", "Publicado"]),
    origin: z.enum(["created", "imported", "legacy"]),
    originalXml: z.string().max(12_000_000).optional(),
    originalFilename: z.string().max(500).optional(),
    importedAt: z.string().optional(),
    codigo: z.string().max(120).optional(),
    legacySource: z.string().max(12_000_000).optional(),
    laneBindings: z.record(
      z.object({
        kind: z.enum(["area", "position"]),
        id: z.string().min(1).max(200),
        name: z.string().max(500),
      }),
    ),
    draftAreas: z
      .array(
        z.object({
          id: z.string().regex(/^temporary-area:[0-9a-f-]{36}$/i),
          name: z.string().trim().min(2).max(120),
          sigla: z.string().regex(/^[A-Z]{3}$/),
          status: z.literal("temporary"),
        }),
      )
      .max(100)
      .optional(),
    elementStyles: z
      .record(
        z.object({
          fontFamily: z.string().max(120).optional(),
          fontSize: z.number().min(8).max(72).optional(),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          underline: z.boolean().optional(),
          strike: z.boolean().optional(),
          color: z
            .string()
            .regex(/^#[0-9a-f]{6}$/i)
            .optional(),
          align: z.enum(["left", "center", "right"]).optional(),
        }),
      )
      .optional(),
  }),
});

/** Single-row compare-and-swap keeps XML, metadata and version consistent. */
export const saveBpmnDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof bpmnSaveSchema>) => bpmnSaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId);
    const { inspectBpmn } = await import("./bpmn-document");
    const inspection = await inspectBpmn(data.document.xml);
    const { data: process, error: processError } = await context.supabase
      .from("organization_processes")
      .select("id,name,current_version,department")
      .eq("organization_id", access.organizationId)
      .eq("id", data.document.processId)
      .single();
    if (processError || !process)
      throw new Error("Selecione um processo válido da organização ativa.");
    const bindings: typeof data.document.laneBindings = {};
    const temporaryAreas = new Map((data.document.draftAreas ?? []).map((area) => [area.id, area]));
    let registeredAreas: Array<{ id: string; name: string; sigla: string | null }> | undefined;
    const resolveTemporaryArea = async (temporaryId: string) => {
      const temporary = temporaryAreas.get(temporaryId);
      if (!temporary) throw new Error("A área temporária do fluxograma não foi encontrada.");
      if (!registeredAreas) {
        const { data: areas, error } = await context.supabase
          .from("organization_departments")
          .select("id,name,sigla")
          .eq("organization_id", access.organizationId);
        if (error) throw new Error(error.message);
        registeredAreas = areas ?? [];
      }
      const normalized = normalizePortalText(temporary.name);
      const existing = registeredAreas.find(
        (area) => normalizePortalText(area.name) === normalized,
      );
      if (existing) return existing;
      const used = registeredAreas.map((area) => area.sigla).filter(Boolean) as string[];
      const preferred = normalizeSigla(temporary.sigla);
      const sigla =
        preferred.length === 3 && !used.includes(preferred)
          ? preferred
          : suggestAreaSigla(temporary.name, used);
      const { data: created, error } = await context.supabase
        .from("organization_departments")
        .insert({
          organization_id: access.organizationId,
          name: temporary.name,
          sigla,
          created_by: context.userId,
        })
        .select("id,name,sigla")
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: concurrent, error: concurrentError } = await context.supabase
            .from("organization_departments")
            .select("id,name,sigla")
            .eq("organization_id", access.organizationId);
          if (concurrentError) throw new Error(concurrentError.message);
          const match = (concurrent ?? []).find(
            (area) => normalizePortalText(area.name) === normalized,
          );
          if (match) {
            registeredAreas = concurrent ?? [];
            return match;
          }
        }
        throw new Error(error.message);
      }
      registeredAreas.push(created);
      return created;
    };
    for (const [laneId, binding] of Object.entries(data.document.laneBindings)) {
      if (!inspection.lanes.some((l) => l.id === laneId)) continue;
      const temporaryArea = binding.kind === "area" && temporaryAreas.has(binding.id);
      if (temporaryArea && data.saveMode === "draft") {
        bindings[laneId] = binding;
        continue;
      }
      if (temporaryArea) {
        const area = await resolveTemporaryArea(binding.id);
        bindings[laneId] = { kind: "area", id: area.id, name: area.name };
        continue;
      }
      if (!z.string().uuid().safeParse(binding.id).success)
        throw new Error(`O responsável da raia ${laneId} é inválido. Selecione novamente.`);
      const table = binding.kind === "area" ? "organization_departments" : "organization_positions";
      const column = binding.kind === "area" ? "name" : "title";
      const result = await (context.supabase as any)
        .from(table)
        .select(`id,${column}`)
        .eq("organization_id", access.organizationId)
        .eq("id", binding.id)
        .single();
      if (result.error || !result.data)
        throw new Error(
          `O responsável da raia ${laneId} não pertence ao cadastro ativo. Selecione novamente.`,
        );
      bindings[laneId] = { ...binding, name: result.data[column] };
    }
    const { draftAreas, ...documentWithoutTemporaryAreas } = data.document;
    const document = {
      ...documentWithoutTemporaryAreas,
      ...(data.saveMode === "draft" && draftAreas?.length ? { draftAreas } : {}),
      processName: process.name,
      laneBindings: bindings,
    };
    const { persistBpmnDocument } = await import("./bpmn-persistence.server");
    const { supabaseAdmin: versionStore } = await import("@/integrations/supabase/client.server");
    return persistBpmnDocument({
      versionStore,
      supabase: context.supabase,
      userId: context.userId,
      organizationId: access.organizationId,
      id: data.id,
      mutationId: data.mutationId,
      saveMode: data.saveMode,
      expectedVersion: data.expectedVersion,
      expectedUpdatedAt: data.expectedUpdatedAt,
      document,
      processVersion: process.current_version,
      reserveCode: async () => {
        const { data: organization, error } = await context.supabase
          .from("organizations")
          .select("code_settings")
          .eq("id", access.organizationId)
          .single();
        if (error) throw new Error(error.message);
        if (
          normalizeCodeSettings(organization.code_settings).fluxograma.mode !== "auto" &&
          data.document.codigo
        )
          return data.document.codigo;
        const { data: areas, error: areaError } = await context.supabase
          .from("organization_departments")
          .select("name,sigla")
          .eq("organization_id", access.organizationId);
        if (areaError) throw new Error(areaError.message);
        const area = areas?.find(
          (a) =>
            a.name.toLocaleUpperCase("pt-BR") === process.department?.toLocaleUpperCase("pt-BR"),
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return reserveOrganizationCode(
          supabaseAdmin,
          access.organizationId,
          "fluxograma",
          area?.sigla || "GER",
        );
      },
    });
  });

type BpmnListSourceRow = {
  id: string;
  name: string;
  current_version: number;
  updated_at: string;
  created_at: string;
  primary_process_id: string | null;
  content_inline: string | null;
};

export const listBpmnDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      organizationId: string;
      page?: number;
      search?: string;
      sortField?: BpmnLibrarySortField;
      sortDirection?: BpmnLibrarySortDirection;
    }) =>
      z
        .object({
          organizationId: z.string().uuid(),
          page: z.number().int().nonnegative().default(0),
          search: z.string().max(120).default(""),
          sortField: z
            .enum(["code", "title", "current_version", "updated_at", "area", "created_at"])
            .default("updated_at"),
          sortDirection: z.enum(["asc", "desc"]).default("desc"),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const query = context.supabase
      .from("documents")
      .select("id,name,current_version,updated_at,created_at,primary_process_id,content_inline")
      .eq("organization_id", access.organizationId)
      .eq("module", "bpmn")
      .order("updated_at", { ascending: false })
      .order("id");
    const result = await dashboardRows<BpmnListSourceRow>(query);
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).map(({ content_inline, ...row }) => ({
      ...row,
      ...bpmnListMetadata(row.name, content_inline),
    }));
    const processIds = [
      ...new Set(rows.map((row) => row.primary_process_id || row.processId)),
    ].filter((id) => z.string().uuid().safeParse(id).success);
    const areas = new Map<string, string | null>();
    if (processIds.length) {
      const processes = await context.supabase
        .from("organization_processes")
        .select("id,department")
        .eq("organization_id", access.organizationId)
        .in("id", processIds);
      if (processes.error) throw new Error(processes.error.message);
      for (const process of processes.data || []) areas.set(process.id, process.department);
    }
    const visibleRows = rows.map(({ processId, primary_process_id, ...row }) => ({
      ...row,
      area: areas.get(primary_process_id || processId) || null,
    }));
    const orderedRows = filterAndSortBpmnRows(
      visibleRows,
      data.search,
      data.sortField,
      data.sortDirection,
    );
    return {
      rows: orderedRows.slice(data.page * 20, data.page * 20 + 20),
      count: orderedRows.length,
    };
  });

export const listModuleDocumentVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { documentId: string }) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_versions")
      .select("id, version_number, comment, created_at, sharepoint_version_label")
      .eq("document_id", data.documentId)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getModuleDocumentVersionContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { versionId: string }) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("document_versions")
      .select("content_snapshot")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(error.message);
    return { content: row.content_snapshot ?? null };
  });

export const saveModuleDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof moduleDocumentSchema>) => moduleDocumentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    if (data.moduleId === "bpmn")
      throw new Error(
        "Atualize a página e use o novo editor BPMN para salvar este desenho com controle de versão.",
      );
    let content = uppercaseModuleDocumentContent(data.content, data.moduleId);
    let code = data.code || "";
    const isDraftSave = data.saveMode === "draft";
    let primaryProcessVersion = data.primaryProcessVersion ?? null;
    let primaryProcessArea = "";

    if (data.primaryProcessId) {
      const { data: process, error: processError } = await context.supabase
        .from("organization_processes")
        .select("organization_id, current_version, department")
        .eq("id", data.primaryProcessId)
        .single();
      if (processError) throw new Error("O processo vinculado não foi encontrado.");
      if (process.organization_id !== access.organizationId) {
        throw new Error("O processo precisa pertencer à organização ativa.");
      }
      primaryProcessVersion = data.moduleId === "ddp" ? null : process.current_version;
      primaryProcessArea = process.department || "";
    }

    let doc: Database["public"]["Tables"]["documents"]["Row"] | null = null;
    if (data.id) {
      const { data: existing, error } = await context.supabase
        .from("documents")
        .select("*")
        .eq("id", data.id)
        .single();
      if (error) throw new Error(error.message);
      doc = existing;
      if (!access.isAdmin && doc.organization_id !== access.organizationId) {
        throw new Error("Você só pode salvar documentos da sua organização.");
      }
    }

    if (doc && (doc.organization_id !== access.organizationId || doc.module !== data.moduleId)) {
      throw new Error("O documento precisa pertencer ao módulo e à organização ativos.");
    }
    if (data.moduleId === "ddp") {
      const { data: org, error: orgError } = await context.supabase
        .from("organizations")
        .select("code_settings")
        .eq("id", access.organizationId)
        .single();
      if (orgError) throw new Error(orgError.message);
      const identity = await prepareMappingIdentity({
        content,
        savedContent: doc?.content_inline,
        requestedCode: code,
        automatic: normalizeCodeSettings(org.code_settings).mapeamento.mode === "auto",
        mode: isDraftSave ? "draft" : "final",
        reserve: async (area) => {
          area = area || primaryProcessArea;
          const { data: departments, error: departmentError } = await context.supabase
            .from("organization_departments")
            .select("name,sigla")
            .eq("organization_id", access.organizationId);
          if (departmentError) throw new Error(departmentError.message);
          const department = departments?.find(
            (item) =>
              item.name.trim().toLocaleUpperCase("pt-BR") === area.toLocaleUpperCase("pt-BR"),
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return reserveOrganizationCode(
            supabaseAdmin,
            access.organizationId,
            "mapeamento",
            department?.sigla || normalizeSigla(area),
          );
        },
      });
      code = identity.code;
      content = identity.content;
    }
    const title =
      documentTitle(data.title, code).trim().toLocaleUpperCase("pt-BR") ||
      data.title.trim().toLocaleUpperCase("pt-BR");
    const name = code ? `${code} - ${title}` : title;

    if (!doc) {
      const { data: created, error } = await context.supabase
        .from("documents")
        .insert({
          name,
          owner_id: context.userId,
          organization_id: access.organizationId,
          module: data.moduleId,
          description: data.description ?? null,
          content_inline: content,
          primary_process_id: data.primaryProcessId ?? null,
          primary_process_version: primaryProcessVersion,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      doc = created;
    }

    const nextVersion =
      isDraftSave || data.moduleId === "ddp"
        ? (doc.current_version ?? 0)
        : (doc.current_version ?? 0) + 1;
    if (!isDraftSave && data.moduleId !== "ddp") {
      const hash = await sha256Hex(content);
      const { error: versionError } = await context.supabase.from("document_versions").insert({
        document_id: doc.id,
        version_number: nextVersion,
        author_id: context.userId,
        comment: data.comment ?? null,
        content_hash: hash,
        content_snapshot: content,
      });
      if (versionError) throw new Error(versionError.message);
    }

    const { data: updated, error: updateError } = await context.supabase
      .from("documents")
      .update({
        name,
        description: data.description ?? null,
        content_inline: content,
        current_version: nextVersion,
        primary_process_id: data.primaryProcessId ?? null,
        primary_process_version: primaryProcessVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated;
  });

type DashboardMappingRow = {
  id: string;
  code: string;
  name: string;
  process: string;
  modalidade: string;
  area: string;
  owner: string;
  responsible: string;
  status: string;
  updatedAt: string;
};
type DashboardCauseRow = {
  area?: string;
  id: string;
  cause: string;
  source: "Mapeamento" | "Avulsa";
  mapping: string;
  process: string;
  responsible: string;
  priority: string;
  status: string;
  dueDate: string;
  updatedAt: string;
};
type DashboardDocumentCatalogRow = {
  id: string;
  code: string;
  title: string;
  documentType: "Norma" | "POP" | "Instrução" | "Fluxograma" | "Mapeamento";
  area: string;
  process: string;
  responsible: string;
  status: string;
  updatedAt: string;
};

function readString(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanOwnerLabel(value: unknown, fallback = "-") {
  const text = readString(value, fallback);
  if (text === fallback) return text;
  return text.replace(/\s*(?:·|•|Â·|Ã‚Â·|-)\s*.*$/u, "").trim() || text;
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : {};
}

async function assertUsernameAvailable(username: string | null | undefined, exceptUserId?: string) {
  if (!username) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("profiles").select("id").ilike("username", username).limit(1);
  if (exceptUserId) query = query.neq("id", exceptUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (data) throw new Error("Usuário de login já está em uso.");
}

function normalizeDashboardName(value: unknown) {
  return readString(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectDdpProcessReferences(contentInline: string | null) {
  const ids = new Set<string>();
  const names = new Set<string>();
  const addId = (value: unknown) => {
    const id = readString(value, "");
    if (id) ids.add(id);
  };
  const addName = (value: unknown) => {
    const name = normalizeDashboardName(value);
    if (name) names.add(name);
  };

  try {
    const parsed = JSON.parse(contentInline ?? "{}") as Record<string, unknown>;
    const source =
      parsed.modules && typeof parsed.modules === "object"
        ? (parsed.modules as Record<string, unknown>)
        : parsed;
    const ddp = objectAt(source, "ddp");
    const macroprocess = objectAt(ddp, "macroprocess");

    addId(macroprocess.processId);
    addId(macroprocess.process_id);
    addName(macroprocess.titulo);
    addName(macroprocess.title);

    const steps = Array.isArray(ddp.steps) ? ddp.steps : [];
    for (const stepValue of steps) {
      const step =
        stepValue && typeof stepValue === "object" ? (stepValue as Record<string, unknown>) : {};
      addId(step.processId);
      addId(step.process_id);
      addName(step.etapa);
      addName(step.title);
      addName(step.name);

      const substeps = Array.isArray(step.substeps) ? step.substeps : [];
      for (const substepValue of substeps) {
        const substep =
          substepValue && typeof substepValue === "object"
            ? (substepValue as Record<string, unknown>)
            : {};
        addId(substep.processId);
        addId(substep.process_id);
        addName(substep.titulo);
        addName(substep.title);
        addName(substep.name);
      }
    }
  } catch {
    // Conteúdo inválido não deve quebrar o dashboard.
  }

  return { ids, names };
}

function dashboardMappingRowFromDocument(document: {
  id: string;
  name: string;
  updated_at: string;
  content_inline: string | null;
}): DashboardMappingRow {
  try {
    const parsed = JSON.parse(document.content_inline ?? "{}") as Record<string, unknown>;
    const source =
      parsed.modules && typeof parsed.modules === "object"
        ? (parsed.modules as Record<string, unknown>)
        : parsed;
    const ddp = objectAt(source, "ddp");
    const meta = objectAt(ddp, "meta");
    const macroprocess = objectAt(ddp, "macroprocess");
    const legacy = objectAt(ddp, "legacy");
    const overview = objectAt(ddp, "overview");

    return {
      id: document.id,
      code: readString(meta.codigo),
      name: readString(meta.titulo, document.name || "Mapeamento sem título"),
      process: readString(macroprocess.titulo, readString(legacy.processName)),
      modalidade: readString(meta.modalidade, "AS IS"),
      area: readString(legacy.processArea, readString(meta.area)),
      owner: cleanOwnerLabel(legacy.processOwner, cleanOwnerLabel(overview.donoProcesso)),
      responsible: readString(meta.elaborador),
      status: readString(meta.status, "Em andamento"),
      updatedAt: document.updated_at,
    };
  } catch {
    return {
      id: document.id,
      code: "-",
      name: document.name || "Mapeamento sem título",
      process: "-",
      modalidade: "AS IS",
      area: "-",
      owner: "-",
      responsible: "-",
      status: "Em andamento",
      updatedAt: document.updated_at,
    };
  }
}

function dashboardCauseRowsFromDocument(document: {
  id: string;
  name: string;
  updated_at: string;
  content_inline: string | null;
}): Array<DashboardCauseRow & { sharedCauseId: string }> {
  try {
    const parsed = JSON.parse(document.content_inline ?? "{}") as Record<string, unknown>;
    const source =
      parsed.modules && typeof parsed.modules === "object"
        ? (parsed.modules as Record<string, unknown>)
        : parsed;
    const ddp = objectAt(source, "ddp");
    const meta = objectAt(ddp, "meta");
    const macroprocess = objectAt(ddp, "macroprocess");
    const legacy = objectAt(ddp, "legacy");
    const gaps = Array.isArray(ddp.gaps) ? ddp.gaps : [];

    return gaps.flatMap((value, index) => {
      if (!value || typeof value !== "object") return [];
      const gap = value as Record<string, unknown>;
      const id = readString(gap.id, `${index + 1}`);
      return [
        {
          id: `mapping:${document.id}:${id}`,
          cause: readString(gap.causa, "Oportunidade sem título"),
          area: readString(legacy.processArea, readString(meta.area)),
          source: "Mapeamento" as const,
          mapping: readString(meta.codigo, readString(meta.titulo, document.name)),
          process: readString(macroprocess.titulo, readString(legacy.processName)),
          responsible: readString(gap.responsavel),
          priority: readString(gap.prioridade, "Média"),
          status: readString(gap.status, "Não iniciada"),
          dueDate: readString(gap.prazo, ""),
          updatedAt: document.updated_at,
          sharedCauseId: readString(gap.sharedCauseId, ""),
        },
      ];
    });
  } catch {
    return [];
  }
}

function dashboardDocumentCatalogRowFromDocument(document: {
  id: string;
  name: string;
  module: string;
  updated_at: string;
  content_inline: string | null;
}): DashboardDocumentCatalogRow {
  try {
    const parsed = JSON.parse(document.content_inline ?? "{}") as Record<string, unknown>;
    const source =
      parsed.modules && typeof parsed.modules === "object"
        ? (parsed.modules as Record<string, unknown>)
        : parsed;
    const ddp = objectAt(source, "ddp");
    const pop = objectAt(source, "pop");
    const bpmn = objectAt(source, "bpmn");
    const ddpMeta = objectAt(ddp, "meta");
    const popMeta = objectAt(pop, "meta");
    const ddpMacro = objectAt(ddp, "macroprocess");
    const ddpLegacy = objectAt(ddp, "legacy");

    if (document.module === "ddp") {
      return {
        id: document.id,
        code: readString(ddpMeta.codigo),
        title: readString(ddpMeta.titulo, document.name || "Mapeamento sem título"),
        documentType: "Mapeamento",
        area: readString(ddpLegacy.processArea, readString(ddpMeta.area)),
        process: readString(ddpMacro.titulo, readString(ddpLegacy.processName)),
        responsible: readString(ddpMeta.elaborador),
        status: readString(ddpMeta.status, "Em andamento"),
        updatedAt: document.updated_at,
      };
    }

    if (document.module === "bpmn") {
      return {
        id: document.id,
        code: readString(bpmn.codigo, ""),
        title: readString(bpmn.poolName, document.name || "Fluxograma sem título"),
        documentType: "Fluxograma",
        area: "-",
        process: readString(bpmn.poolName),
        responsible: "-",
        status: readString(bpmn.status, "Em andamento"),
        updatedAt: document.updated_at,
      };
    }

    const popType = `${readString(popMeta.tipo, "")} ${document.name ?? ""}`.toLowerCase();
    const documentType = popType.includes("norma")
      ? "Norma"
      : popType.includes("instru") || popType.includes("trabalho") || /\bit\b/.test(popType)
        ? "Instrução"
        : "POP";
    return {
      id: document.id,
      code: readString(popMeta.codigo),
      title: readString(popMeta.titulo, document.name || "Documento sem título"),
      documentType,
      area: readString(popMeta.area),
      process: readString(popMeta.processo),
      responsible: readString(popMeta.elaboracao, readString(popMeta.aprovacao)),
      status: readString(popMeta.status, "Em andamento"),
      updatedAt: document.updated_at,
    };
  } catch {
    return {
      id: document.id,
      code: "-",
      title: document.name || "Documento sem título",
      documentType:
        document.module === "ddp"
          ? "Mapeamento"
          : document.module === "bpmn"
            ? "Fluxograma"
            : "POP",
      area: "-",
      process: "-",
      responsible: "-",
      status: "Em andamento",
      updatedAt: document.updated_at,
    };
  }
}

export const listSystemReleaseNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("system_release_notes")
      .select("id, title, description, category, published_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOrganizationDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const organizationId = access.organizationId;
    const [
      { data: organization, error: organizationError },
      { data: processes, error: processesError },
      { data: documents, error: documentsError },
      { data: departments, error: departmentsError },
      { data: owners, error: ownersError },
      { data: valueChains, error: valueChainsError },
      { data: standaloneCauses, error: standaloneCausesError },
    ] = await Promise.all([
      context.supabase.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
      dashboardRows(
        context.supabase
          .from("organization_processes")
          .select(
            "id, name, type, department, owner, status, current_version, created_at, updated_at",
          )
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .order("id"),
      ),
      dashboardRows(
        context.supabase
          .from("documents")
          .select(
            "id, name, module, current_version, primary_process_id, updated_at, content_inline",
          )
          .eq("organization_id", organizationId)
          .in("module", ["ddp", "pop", "bpmn"])
          .order("updated_at", { ascending: false })
          .order("id"),
      ),
      dashboardRows(
        context.supabase
          .from("organization_departments")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("id"),
      ),
      dashboardRows(
        context.supabase
          .from("organization_process_owners")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("id"),
      ),
      dashboardRows(
        context.supabase
          .from("organization_value_chains")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("id"),
      ),
      dashboardRows(
        context.supabase
          .from("organization_causes")
          .select("id, title, priority, status, responsible, process_id, due_date, updated_at")
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .order("id"),
      ),
    ]);

    if (organizationError) throw new Error(organizationError.message);
    if (processesError) throw new Error(processesError.message);
    if (documentsError) throw new Error(documentsError.message);
    if (departmentsError) throw new Error(departmentsError.message);
    if (ownersError) throw new Error(ownersError.message);
    if (valueChainsError) throw new Error(valueChainsError.message);
    if (standaloneCausesError && !isMissingExtendedCauseColumn(standaloneCausesError.message)) {
      throw new Error(standaloneCausesError.message);
    }

    const rank = (values: Array<string | null>) => {
      const counts = new Map<string, number>();
      values.forEach((value) => {
        const key = value?.trim() || "Sem cadastro";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return Array.from(counts.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, 5);
    };

    const ddps = (documents ?? []).filter((document) => document.module === "ddp");
    const pops = (documents ?? []).filter((document) => document.module === "pop");
    const documentCatalogRows = (documents ?? []).map((doc) => {
      const row = dashboardDocumentCatalogRowFromDocument(doc);
      if (!row.area || row.area === "-")
        row.area = (processes ?? []).find((p) => p.id === doc.primary_process_id)?.department || "";
      return row;
    });
    const activeProcesses = (processes ?? []).filter((process) => process.status === "Ativo");
    const staleProcesses = (processes ?? []).filter((process) => process.status !== "Ativo");
    const dashboardMappingRows = ddps.map((doc) => {
      const row = dashboardMappingRowFromDocument(doc);
      if (!row.area || row.area === "-")
        row.area = (processes ?? []).find((p) => p.id === doc.primary_process_id)?.department || "";
      return row;
    });
    const mappingStatusCounts = {
      emAndamento: dashboardMappingRows.filter((row) => row.status === "Em andamento").length,
      emRevisao: dashboardMappingRows.filter((row) => row.status === "Em revisão").length,
      aprovado: dashboardMappingRows.filter((row) => row.status === "Aprovado").length,
      concluido: dashboardMappingRows.filter((row) => row.status === "Concluído").length,
    };

    const processNamesById = new Map(
      (processes ?? []).map((process) => [process.id, process.name]),
    );
    const mappingCauseRows = ddps.flatMap((doc) =>
      dashboardCauseRowsFromDocument(doc).map((row) => ({
        ...row,
        area:
          row.area && row.area !== "-"
            ? row.area
            : dashboardMappingRows.find((m) => m.id === doc.id)?.area || "",
      })),
    );
    const sharedCauseIds = new Set(
      mappingCauseRows.map((row) => row.sharedCauseId).filter((value) => value && value !== "-"),
    );
    const standaloneCauseRows: DashboardCauseRow[] = (standaloneCauses ?? [])
      .filter((cause) => !sharedCauseIds.has(cause.id))
      .map((cause) => ({
        area: (processes ?? []).find((p) => p.id === cause.process_id)?.department || "",
        id: `standalone:${cause.id}`,
        cause: cause.title,
        source: "Avulsa",
        mapping: "-",
        process: cause.process_id ? (processNamesById.get(cause.process_id) ?? "-") : "-",
        responsible: cause.responsible || "-",
        priority: cause.priority || "Média",
        status: cause.status || "Não iniciada",
        dueDate: cause.due_date || "",
        updatedAt: cause.updated_at,
      }));
    const causeRows: DashboardCauseRow[] = [
      ...mappingCauseRows.map(({ sharedCauseId: _sharedCauseId, ...row }) => row),
      ...standaloneCauseRows,
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const normalizeCauseStatus = (status: string) =>
      status
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
    const causeStatusCounts = {
      naoIniciada: causeRows.filter((row) => normalizeCauseStatus(row.status).includes("nao inici"))
        .length,
      emAndamento: causeRows.filter((row) => normalizeCauseStatus(row.status).includes("andamento"))
        .length,
      encerrada: causeRows.filter((row) => normalizeCauseStatus(row.status).includes("encerr"))
        .length,
      cancelada: causeRows.filter((row) => normalizeCauseStatus(row.status).includes("cancel"))
        .length,
    };

    const processIdsByName = new Map<string, string>();
    for (const process of processes ?? []) {
      const key = normalizeDashboardName(process.name);
      if (key && !processIdsByName.has(key)) processIdsByName.set(key, process.id);
    }

    // Cobertura de mapeamento: um processo é "coberto" se aparecer como processo
    // principal do mapeamento ou como processo relacionado em macroprocesso,
    // etapa, subprocesso ou atividade do fluxo. A quantidade de mapeamentos não importa:
    // a cobertura é sim/não por processo cadastrado.
    const mappingsByProcess = new Map<
      string,
      Array<{ name: string; version: number; updatedAt: string }>
    >();
    for (const doc of ddps) {
      if (dashboardMappingRowFromDocument(doc).status.toLowerCase().includes("rascunho")) continue;
      const processIds = new Set<string>();
      if (doc.primary_process_id) processIds.add(doc.primary_process_id);

      const references = collectDdpProcessReferences(doc.content_inline);
      references.ids.forEach((id) => processIds.add(id));
      references.names.forEach((name) => {
        const id = processIdsByName.get(name);
        if (id) processIds.add(id);
      });

      for (const pid of processIds) {
        const list = mappingsByProcess.get(pid) ?? [];
        if (!list.some((mapping) => mapping.name === doc.name)) {
          list.push({ name: doc.name, version: doc.current_version, updatedAt: doc.updated_at });
        }
        mappingsByProcess.set(pid, list);
      }
    }
    const coverageRows = (processes ?? []).map((process) => ({
      id: process.id,
      name: process.name,
      type: process.type,
      department: process.department,
      owner: cleanOwnerLabel(process.owner, ""),
      status: process.status,
      updatedAt: process.updated_at,
      mappings: mappingsByProcess.get(process.id) ?? [],
    }));

    return {
      organization,
      totals: {
        processes: processes?.length ?? 0,
        activeProcesses: activeProcesses.length,
        reviewProcesses: staleProcesses.length,
        ddps: ddps.length,
        pops: pops.length,
        departments: departments?.length ?? 0,
        owners: owners?.length ?? 0,
        valueChains: valueChains?.length ?? 0,
      },
      topDepartments: rank((processes ?? []).map((process) => process.department)),
      topOwners: rank(
        (processes ?? []).map((process) =>
          process.owner ? cleanOwnerLabel(process.owner, "") : null,
        ),
      ),
      departments: departments ?? [],
      mappingRows: dashboardMappingRows,
      mappingStatusCounts,
      causeRows,
      causeStatusCounts,
      documentCatalogRows,
      recentDocuments: (documents ?? [])
        .map(({ content_inline: _content, ...document }) => document)
        .slice(0, 5),
      recentProcesses: (processes ?? []).slice(0, 5),
      mappingCoverage: {
        covered: coverageRows.filter((row) => row.mappings.length > 0).length,
        total: processes?.length ?? 0,
        rows: coverageRows,
      },
    };
  });

export const listUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationAdmin(context, data.organizationId ?? undefined);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (!access.isAdmin) {
      const { data: scopedMemberships, error: scopedError } = await supabaseAdmin
        .from("user_organization_access")
        .select("user_id")
        .eq("organization_id", access.organizationId);
      if (scopedError) throw new Error(scopedError.message);
      profilesQuery = profilesQuery.in(
        "id",
        Array.from(
          new Set([context.userId, ...(scopedMemberships ?? []).map((row) => row.user_id)]),
        ),
      );
    }

    const [
      { data: profiles, error: profilesError },
      { data: roles, error: rolesError },
      { data: organizations, error: organizationsError },
      { data: memberships, error: membershipsError },
    ] = await Promise.all([
      profilesQuery,
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("organizations").select("id, name, slug"),
      supabaseAdmin.from("user_organization_access").select("user_id, organization_id, is_default"),
    ]);

    if (profilesError) throw new Error(profilesError.message);
    if (rolesError) throw new Error(rolesError.message);
    if (organizationsError) throw new Error(organizationsError.message);
    if (membershipsError) throw new Error(membershipsError.message);

    const organizationById = new Map(
      (organizations ?? []).map((organization) => [organization.id, organization]),
    );
    const rolesByUserId = new Map<string, string[]>();
    for (const role of roles ?? []) {
      const userRoles = rolesByUserId.get(role.user_id) ?? [];
      userRoles.push(role.role);
      rolesByUserId.set(role.user_id, userRoles);
    }
    const membershipsByUserId = new Map<string, typeof memberships>();
    for (const membership of memberships ?? []) {
      const userMemberships = membershipsByUserId.get(membership.user_id) ?? [];
      userMemberships.push(membership);
      membershipsByUserId.set(membership.user_id, userMemberships);
    }

    return (profiles ?? []).map((profile) => ({
      ...profile,
      organization: organizationById.get(profile.organization_id) ?? null,
      roles: rolesByUserId.get(profile.id) ?? [],
      organization_access: (membershipsByUserId.get(profile.id) ?? []).map((membership) => ({
        ...membership,
        organization: organizationById.get(membership.organization_id) ?? null,
      })),
    }));
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      userId: string;
      username?: string | null;
      password?: string | null;
      displayName?: string | null;
      organizationId?: string | null;
      organizationIds?: string[];
      roles: AppRole[];
      visibleModules?: string[];
    }) =>
      z
        .object({
          userId: z.string().uuid(),
          username: usernameSchema,
          password: z.string().trim().max(128).optional().nullable(),
          displayName: z.string().trim().min(2).max(120).optional().nullable(),
          organizationId: z.string().uuid().optional().nullable(),
          organizationIds: z.array(z.string().uuid()).optional(),
          roles: z.array(appRoleSchema).min(1),
          visibleModules: z
            .array(z.string().refine((value) => (MODULE_IDS as readonly string[]).includes(value)))
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetProfile = await profileFor(context, data.userId);
    const targetOrgId = data.organizationId ?? targetProfile.organization_id;
    await assertOrganizationAdmin(context, targetOrgId);
    await assertUsernameAvailable(data.username, data.userId);
    const nextRoles = data.roles;
    const nextPassword = data.password?.trim() ?? "";

    if (data.userId === context.userId && !nextRoles.some((role) => role === "admin")) {
      throw new Error("Você não pode remover seu próprio acesso administrativo.");
    }
    if (nextPassword && nextPassword.length < 6) {
      throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        ...(data.visibleModules ? { visible_modules: data.visibleModules } : {}),
        username: data.username ?? null,
        display_name: data.displayName ?? targetProfile.display_name,
        organization_id: targetOrgId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    if (nextPassword) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: nextPassword,
      });
      if (passwordError) throw new Error(passwordError.message);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert(nextRoles.map((role) => ({ user_id: data.userId, role })));
    if (insertError) throw new Error(insertError.message);

    const organizationIds = Array.from(
      new Set([targetOrgId, ...(data.organizationIds ?? [])].filter(Boolean)),
    );
    for (const organizationId of organizationIds) {
      await assertOrganizationAdmin(context, organizationId);
    }
    const { error: membershipDeleteError } = await supabaseAdmin
      .from("user_organization_access")
      .delete()
      .eq("user_id", data.userId);
    if (membershipDeleteError) throw new Error(membershipDeleteError.message);
    const { error: membershipInsertError } = await supabaseAdmin
      .from("user_organization_access")
      .insert(
        organizationIds.map((organizationId) => ({
          user_id: data.userId,
          organization_id: organizationId,
          is_default: organizationId === targetOrgId,
        })),
      );
    if (membershipInsertError) throw new Error(membershipInsertError.message);

    return { ok: true };
  });

export const createUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      email: string;
      username?: string | null;
      password: string;
      displayName?: string | null;
      organizationId?: string | null;
      organizationIds?: string[];
      roles: AppRole[];
      visibleModules?: string[];
    }) =>
      z
        .object({
          email: z.string().trim().email().max(254),
          username: usernameSchema,
          password: z.string().min(6).max(128),
          displayName: z.string().trim().min(2).max(120).optional().nullable(),
          organizationId: z.string().uuid().optional().nullable(),
          organizationIds: z.array(z.string().uuid()).optional(),
          roles: z.array(appRoleSchema).min(1),
          visibleModules: z
            .array(z.string().refine((value) => (MODULE_IDS as readonly string[]).includes(value)))
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationAdmin(context, data.organizationId ?? undefined);
    const organizationId = access.isAdmin
      ? data.organizationId || access.organizationId
      : access.organizationId;
    const roles = data.roles;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUsernameAvailable(data.username);

    if (data.visibleModules) {
      const { error } = await supabaseAdmin.from("profiles").select("visible_modules").limit(0);
      if (error)
        throw new Error(
          "Aplique a atualização de visibilidade de módulos no Supabase antes de salvar usuários.",
        );
    }
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.displayName || data.email.split("@")[0],
        username: data.username,
        organization_id: organizationId,
      },
    });
    if (createError) throw new Error(createError.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Não foi possível criar o usuário.");

    const now = new Date().toISOString();
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      ...(data.visibleModules ? { visible_modules: data.visibleModules } : {}),
      username: data.username ?? null,
      display_name: data.displayName || data.email.split("@")[0],
      organization_id: organizationId,
      updated_at: now,
    });
    if (profileError) throw new Error(profileError.message);

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert(roles.map((role) => ({ user_id: userId, role })));
    if (roleError) throw new Error(roleError.message);

    const organizationIds = Array.from(
      new Set([organizationId, ...(data.organizationIds ?? [])].filter(Boolean)),
    );
    for (const allowedOrganizationId of organizationIds) {
      await assertOrganizationAdmin(context, allowedOrganizationId);
    }
    const { error: membershipError } = await supabaseAdmin.from("user_organization_access").insert(
      organizationIds.map((allowedOrganizationId) => ({
        user_id: userId,
        organization_id: allowedOrganizationId,
        is_default: allowedOrganizationId === organizationId,
      })),
    );
    if (membershipError) throw new Error(membershipError.message);

    return { ok: true, userId };
  });

export const deleteUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const targetProfile = await profileFor(context, data.userId);
    await assertOrganizationAdmin(context, targetProfile.organization_id);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir seu próprio usuário.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveLoginIdentifier = createServerFn({ method: "POST" })
  .validator((d: { identifier: string }) =>
    z.object({ identifier: z.string().trim().min(3).max(254) }).parse(d),
  )
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (identifier.includes("@")) return { email: identifier };
    const username = usernameSchema.parse(identifier);
    if (!username) return { email: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { email: profile?.email ?? null };
  });

export const updateAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      sharepoint_site_id?: string;
      sharepoint_drive_id?: string;
      sharepoint_folder_path?: string;
    }) =>
      z
        .object({
          sharepoint_site_id: z.string().max(500).optional().nullable(),
          sharepoint_drive_id: z.string().max(500).optional().nullable(),
          sharepoint_folder_path: z.string().max(500).optional().nullable(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizationAdmin(context);
    const { error } = await context.supabase
      .from("app_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSharePointSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { query?: string }) =>
    z.object({ query: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sp = await import("./sharepoint.server");
    return await sp.listSites(data.query);
  });

export const listSharePointDrives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { siteId: string }) => z.object({ siteId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sp = await import("./sharepoint.server");
    return await sp.listDrives(data.siteId);
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profile, roles] = await Promise.all([profileFor(context), rolesFor(context)]);
    const { data: organization } = await context.supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .maybeSingle();
    return {
      userId: context.userId,
      profile,
      organization,
      roles,
      isOrganizationAdmin: roles.includes("admin"),
    };
  });
