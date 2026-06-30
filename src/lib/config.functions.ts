import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  DOC_TYPES,
  type DocType,
  applyNextDocumentCode,
  normalizeCodeSettings,
  normalizeSigla,
} from "@/lib/code-generation";

type AppRole = "maestro" | "admin" | "editor" | "viewer";
type AuthContext = { supabase: SupabaseClient<Database>; userId: string };

const appRoleSchema = z.enum(["maestro", "admin", "editor", "viewer"]);
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
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  impact: z.string().trim().max(2000).optional().nullable(),
  action: z.string().trim().max(2000).optional().nullable(),
  priority: z.string().trim().max(40).optional().default("Média"),
});
const processSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  type: z.enum(["macroprocess", "process", "subprocess"]).default("process"),
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
  primaryProcessId: z.string().uuid().optional().nullable(),
  primaryProcessVersion: z.number().int().positive().optional().nullable(),
});
const organizationScopeSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
});
const valueChainSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(180),
  category: z.enum(["primary", "support", "management"]),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Ativa", "Inativa"]).default("Ativa"),
});
const ownerRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  roleTitle: z.string().trim().min(2).max(160),
});
const processTypeRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  code: z.enum(["macroprocess", "process", "subprocess"]),
  label: z.string().trim().min(2).max(80),
  active: z.boolean().default(true),
});
const processRegistrationSchema = organizationScopeSchema.extend({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  type: z.enum(["macroprocess", "process", "subprocess"]),
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

function processSnapshot(process: z.infer<typeof processSchema>) {
  return {
    code: process.code ?? null,
    name: process.name,
    type: process.type,
    parent_process_id: process.parent_process_id ?? null,
    department: process.department ?? null,
    owner: process.owner ?? null,
    description: process.description ?? null,
    status: process.status,
  };
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
  const isMaestro = roles.includes("maestro");
  const organizationId = requestedOrganizationId || profile.organization_id;
  if (organizationId !== profile.organization_id && !isMaestro) {
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
    isMaestro,
    isAdmin: roles.includes("admin"),
  };
}

async function assertMaestro(context: AuthContext) {
  const access = await permissionContext(context);
  if (!access.isMaestro) throw new Error("Acesso restrito ao Maestro BF Flow.");
  return access;
}

async function assertOrganizationAdmin(context: AuthContext, organizationId?: string) {
  const access = await permissionContext(context, organizationId);
  if (access.isMaestro) return access;
  if (!access.isAdmin) throw new Error("Acesso restrito a administradores da organização.");
  return access;
}

async function assertOrganizationEditor(context: AuthContext, organizationId?: string) {
  const access = await permissionContext(context, organizationId);
  if (access.isMaestro) return access;
  if (!access.roles.some((role) => role === "admin" || role === "editor")) {
    throw new Error("Acesso restrito a administradores e editores da organização.");
  }
  return access;
}

function rolesAllowedBy(access: Awaited<ReturnType<typeof permissionContext>>, roles: AppRole[]) {
  if (access.isMaestro) return roles;
  if (roles.includes("maestro"))
    throw new Error("Somente o Maestro BF Flow pode conceder Maestro.");
  return roles.filter((role) => role !== "maestro");
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
  .validator((d: { display_name: string }) =>
    z.object({ display_name: z.string().trim().min(2).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        display_name: data.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await permissionContext(context);
    let query = context.supabase.from("organizations").select("*").order("name", { ascending: true });
    if (!access.isMaestro) query = query.eq("id", access.organizationId);
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
    if (!access.isMaestro) {
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
  .validator((d: z.infer<typeof orgSchema>) => orgSchema.omit({ id: true }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMaestro(context);
    const { data: row, error } = await context.supabase
      .from("organizations")
      .insert({ ...data, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { error: typeError } = await context.supabase.from("organization_process_types").insert([
      {
        organization_id: row.id,
        code: "macroprocess",
        label: "Macroprocesso",
      },
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
    const sigla = normalizeSigla(data.areaSigla);
    if (sigla.length !== 3) throw new Error("Sigla da área inválida (esperado 3 letras).");
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("code_settings")
      .eq("id", access.organizationId)
      .single();
    if (error) throw new Error(error.message);
    const settings = normalizeCodeSettings(org.code_settings);
    const { code, settings: updated } = applyNextDocumentCode(settings, data.type, sigla);
    const { error: updateError } = await context.supabase
      .from("organizations")
      .update({ code_settings: updated, updated_at: new Date().toISOString() })
      .eq("id", access.organizationId);
    if (updateError) throw new Error(updateError.message);
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
      { data: causes, error: causesError },
      { data: processes, error: processesError },
      { data: valueChains, error: valueChainsError },
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
          "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
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
    ]);
    if (departmentsError) throw new Error(departmentsError.message);
    if (ownersError) throw new Error(ownersError.message);
    if (causesError) throw new Error(causesError.message);
    if (processesError) throw new Error(processesError.message);
    if (valueChainsError) throw new Error(valueChainsError.message);
    return {
      departments: departments ?? [],
      processOwners: processOwners ?? [],
      causes: causes ?? [],
      processes: processes ?? [],
      valueChains: valueChains ?? [],
    };
  });

export const listProcessRegistrationData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof organizationScopeSchema>) => organizationScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await permissionContext(context, data.organizationId);
    const organizationId = access.organizationId;
    const [areas, owners, types, valueChains, processes] = await Promise.all([
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
    ]);
    for (const result of [areas, owners, types, valueChains, processes]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      organizationId,
      areas: areas.data ?? [],
      owners: owners.data ?? [],
      types: types.data ?? [],
      valueChains: valueChains.data ?? [],
      processes: processes.data ?? [],
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

export const saveProcessOwnerRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof ownerRegistrationSchema>) => ownerRegistrationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const { data: area, error: areaError } = await context.supabase
      .from("organization_departments")
      .select("name")
      .eq("id", data.departmentId)
      .eq("organization_id", access.organizationId)
      .single();
    if (areaError) throw new Error(areaError.message);
    const payload = {
      organization_id: access.organizationId,
      department_id: data.departmentId,
      role_title: data.roleTitle,
      name: `${data.roleTitle} · ${area.name}`,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? context.supabase.from("organization_process_owners").update(payload).eq("id", data.id)
      : context.supabase
          .from("organization_process_owners")
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
      name: data.name,
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
      name: data.name,
      type: data.type,
      value_chain_id: data.valueChainId ?? null,
      parent_process_id: data.parentProcessId ?? null,
      department: data.department ?? null,
      owner: data.owner ?? null,
      description: data.description ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (!data.id) {
      const { data: row, error } = await context.supabase
        .from("organization_processes")
        .insert({ ...payload, current_version: 1, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      const { error: versionError } = await context.supabase
        .from("organization_process_versions")
        .insert({
          organization_id: access.organizationId,
          process_id: row.id,
          version_number: 1,
          snapshot: row,
          created_by: context.userId,
        });
      if (versionError) throw new Error(versionError.message);
      return row;
    }
    const { data: current, error: currentError } = await context.supabase
      .from("organization_processes")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", access.organizationId)
      .single();
    if (currentError) throw new Error(currentError.message);
    const nextVersion = current.current_version + 1;
    const { data: row, error } = await context.supabase
      .from("organization_processes")
      .update({ ...payload, current_version: nextVersion })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { error: versionError } = await context.supabase
      .from("organization_process_versions")
      .insert({
        organization_id: access.organizationId,
        process_id: row.id,
        version_number: nextVersion,
        snapshot: row,
        created_by: context.userId,
      });
    if (versionError) throw new Error(versionError.message);
    return row;
  });

export const deleteProcessRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { organizationId?: string | null; kind: string; id: string }) =>
    organizationScopeSchema
      .extend({
        kind: z.enum(["value-chain", "process", "area", "owner"]),
        id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context, data.organizationId ?? undefined);
    const table =
      data.kind === "value-chain"
        ? "organization_value_chains"
        : data.kind === "process"
          ? "organization_processes"
          : data.kind === "area"
            ? "organization_departments"
            : "organization_process_owners";
    const { error } = await context.supabase
      .from(table)
      .delete()
      .eq("id", data.id)
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
    const access = await assertOrganizationEditor(context);
    const { data: row, error } = await context.supabase
      .from("organization_causes")
      .insert({
        organization_id: access.organizationId,
        title: data.title,
        description: data.description ?? null,
        impact: data.impact ?? null,
        action: data.action ?? null,
        priority: data.priority || "Média",
        created_by: context.userId,
      })
      .select(
        "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOrganizationCause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof catalogCauseSchema> & { id: string }) =>
    catalogCauseSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
    const { data: row, error } = await context.supabase
      .from("organization_causes")
      .update({
        title: data.title,
        description: data.description ?? null,
        impact: data.impact ?? null,
        action: data.action ?? null,
        priority: data.priority || "Média",
      })
      .eq("id", data.id)
      .eq("organization_id", access.organizationId)
      .select(
        "id, title, description, impact, action, priority, organization_id, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteOrganizationCause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationEditor(context);
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
        owner: data.owner || null,
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

    const { error: versionError } = await context.supabase
      .from("organization_process_versions")
      .insert({
        process_id: row.id,
        organization_id: access.organizationId,
        version_number: 1,
        snapshot: processSnapshot(data),
        created_by: context.userId,
      });
    if (versionError) throw new Error(versionError.message);
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
    if (!access.isMaestro && current.organization_id !== access.organizationId) {
      throw new Error("Você só pode alterar processos da sua organização.");
    }
    const nextVersion = (current.current_version ?? 0) + 1;
    const { data: row, error } = await context.supabase
      .from("organization_processes")
      .update({
        code: data.code || null,
        name: data.name,
        type: data.type,
        parent_process_id: data.parent_process_id || null,
        department: data.department || null,
        owner: data.owner || null,
        description: data.description || null,
        status: data.status,
        current_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select(
        "id, code, name, type, parent_process_id, department, owner, description, status, current_version, organization_id, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);

    const { error: versionError } = await context.supabase
      .from("organization_process_versions")
      .insert({
        process_id: row.id,
        organization_id: row.organization_id,
        version_number: nextVersion,
        snapshot: processSnapshot(data),
        created_by: context.userId,
      });
    if (versionError) throw new Error(versionError.message);
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
        "id, name, module, content_inline, current_version, primary_process_id, primary_process_version",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
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
    const name = data.code ? `${data.code} - ${data.title}` : data.title;
    let primaryProcessVersion = data.primaryProcessVersion ?? null;

    if (data.primaryProcessId) {
      const { data: process, error: processError } = await context.supabase
        .from("organization_processes")
        .select("organization_id, current_version")
        .eq("id", data.primaryProcessId)
        .single();
      if (processError) throw new Error("O processo vinculado não foi encontrado.");
      if (process.organization_id !== access.organizationId) {
        throw new Error("O processo precisa pertencer à organização ativa.");
      }
      primaryProcessVersion = process.current_version;
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
      if (!access.isMaestro && doc.organization_id !== access.organizationId) {
        throw new Error("Você só pode salvar documentos da sua organização.");
      }
    }

    if (!doc) {
      const { data: created, error } = await context.supabase
        .from("documents")
        .insert({
          name,
          owner_id: context.userId,
          organization_id: access.organizationId,
          module: data.moduleId,
          description: data.description ?? null,
          content_inline: data.content,
          primary_process_id: data.primaryProcessId ?? null,
          primary_process_version: primaryProcessVersion,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      doc = created;
    }

    const nextVersion = (doc.current_version ?? 0) + 1;
    const hash = await sha256Hex(data.content);
    const { error: versionError } = await context.supabase.from("document_versions").insert({
      document_id: doc.id,
      version_number: nextVersion,
      author_id: context.userId,
      comment: data.comment ?? null,
      content_hash: hash,
      content_snapshot: data.content,
    });
    if (versionError) throw new Error(versionError.message);

    const { data: updated, error: updateError } = await context.supabase
      .from("documents")
      .update({
        name,
        description: data.description ?? null,
        content_inline: data.content,
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
    ] = await Promise.all([
      context.supabase.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
      context.supabase
        .from("organization_processes")
        .select(
          "id, name, type, department, owner, status, current_version, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("documents")
        .select("id, name, module, current_version, primary_process_id, updated_at")
        .eq("organization_id", organizationId)
        .in("module", ["ddp", "pop"])
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", organizationId),
      context.supabase
        .from("organization_process_owners")
        .select("id, name")
        .eq("organization_id", organizationId),
      context.supabase
        .from("organization_value_chains")
        .select("id, name")
        .eq("organization_id", organizationId),
    ]);

    if (organizationError) throw new Error(organizationError.message);
    if (processesError) throw new Error(processesError.message);
    if (documentsError) throw new Error(documentsError.message);
    if (departmentsError) throw new Error(departmentsError.message);
    if (ownersError) throw new Error(ownersError.message);
    if (valueChainsError) throw new Error(valueChainsError.message);

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
    const activeProcesses = (processes ?? []).filter((process) => process.status === "Ativo");
    const staleProcesses = (processes ?? []).filter((process) => process.status !== "Ativo");

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
      topOwners: rank((processes ?? []).map((process) => process.owner)),
      recentDocuments: (documents ?? []).slice(0, 5),
      recentProcesses: (processes ?? []).slice(0, 5),
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
      .select("id, email, display_name, organization_id, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (!access.isMaestro) {
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

    return (profiles ?? []).map((profile) => ({
      ...profile,
      organization: (organizations ?? []).find((org) => org.id === profile.organization_id) ?? null,
      roles: (roles ?? []).filter((row) => row.user_id === profile.id).map((row) => row.role),
      organization_access: (memberships ?? [])
        .filter((row) => row.user_id === profile.id)
        .map((membership) => ({
          ...membership,
          organization:
            (organizations ?? []).find((org) => org.id === membership.organization_id) ?? null,
        })),
    }));
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      userId: string;
      displayName?: string | null;
      organizationId?: string | null;
      organizationIds?: string[];
      roles: AppRole[];
    }) =>
      z
        .object({
          userId: z.string().uuid(),
          displayName: z.string().trim().min(2).max(120).optional().nullable(),
          organizationId: z.string().uuid().optional().nullable(),
          organizationIds: z.array(z.string().uuid()).optional(),
          roles: z.array(appRoleSchema).min(1),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetProfile = await profileFor(context, data.userId);
    const targetOrgId = data.organizationId ?? targetProfile.organization_id;
    const access = await assertOrganizationAdmin(context, targetOrgId);
    const nextRoles = rolesAllowedBy(access, data.roles);

    if (
      data.userId === context.userId &&
      !nextRoles.some((role) => role === "admin" || role === "maestro")
    ) {
      throw new Error("Você não pode remover seu próprio acesso administrativo.");
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.displayName ?? targetProfile.display_name,
        organization_id: targetOrgId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

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
      password: string;
      displayName?: string | null;
      organizationId?: string | null;
      organizationIds?: string[];
      roles: AppRole[];
    }) =>
      z
        .object({
          email: z.string().trim().email().max(254),
          password: z.string().min(6).max(128),
          displayName: z.string().trim().min(2).max(120).optional().nullable(),
          organizationId: z.string().uuid().optional().nullable(),
          organizationIds: z.array(z.string().uuid()).optional(),
          roles: z.array(appRoleSchema).min(1),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await assertOrganizationAdmin(context, data.organizationId ?? undefined);
    const organizationId = access.isMaestro
      ? data.organizationId || access.organizationId
      : access.organizationId;
    const roles = rolesAllowedBy(access, data.roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.displayName || data.email.split("@")[0],
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
    await assertMaestro(context);
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
      isMaestro: roles.includes("maestro"),
      isOrganizationAdmin: roles.includes("admin"),
    };
  });
