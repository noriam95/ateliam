import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCircle2, Mail, Save, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTaskFlowSettings, saveTaskFlowSettings } from "@/lib/task-flow-settings.functions";

const FLOWS = [
  { kind: "mapping", label: "Mapeamento" },
  { kind: "improvement", label: "Melhoria" },
  { kind: "document", label: "Documento" },
] as const;
const EVENTS = [
  { key: "task_created", label: "Criação da tarefa" },
  { key: "stage_changed", label: "Mudança de etapa" },
  { key: "assignment", label: "Alteração de responsável" },
  { key: "checklist", label: "Checklist e entregas" },
  { key: "comment", label: "Comentários" },
] as const;
type EventKey = (typeof EVENTS)[number]["key"];
type Preferences = Record<EventKey, boolean>;
type FlowRow = {
  task_kind: string;
  default_assignee_id: string | null;
  system_notifications: Preferences;
  email_notifications: Preferences;
};
type FlowData = {
  settings: FlowRow[];
  people: { id: string; name: string; can_edit: boolean }[];
  emailConfigured: boolean;
};
const defaultSystem: Preferences = {
  task_created: true,
  stage_changed: true,
  assignment: true,
  checklist: true,
  comment: true,
};
const defaultEmail: Preferences = {
  task_created: false,
  stage_changed: false,
  assignment: false,
  checklist: false,
  comment: false,
};

export function TaskFlowSettings({ organizationId }: { organizationId: string | null }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getTaskFlowSettings);
  const save = useServerFn(saveTaskFlowSettings);
  const [kind, setKind] = useState<(typeof FLOWS)[number]["kind"]>("mapping");
  const [assignee, setAssignee] = useState("");
  const [system, setSystem] = useState<Preferences>(defaultSystem);
  const [email, setEmail] = useState<Preferences>(defaultEmail);
  const query = useQuery({
    queryKey: ["task-flow-settings", organizationId],
    queryFn: () => load({ data: { organizationId: organizationId! } }) as Promise<FlowData>,
    enabled: !!organizationId,
  });
  const current = useMemo(
    () => query.data?.settings.find((row) => row.task_kind === kind),
    [kind, query.data?.settings],
  );

  useEffect(() => {
    setAssignee(current?.default_assignee_id || "");
    setSystem({ ...defaultSystem, ...(current?.system_notifications || {}) });
    setEmail({ ...defaultEmail, ...(current?.email_notifications || {}) });
  }, [current]);

  const dirty =
    assignee !== (current?.default_assignee_id || "") ||
    EVENTS.some(({ key }) => system[key] !== (current?.system_notifications?.[key] ?? true)) ||
    EVENTS.some(({ key }) => email[key] !== (current?.email_notifications?.[key] ?? false));
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          organizationId: organizationId!,
          kind,
          defaultAssigneeId: assignee || null,
          systemNotifications: system,
          emailNotifications: email,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-flow-settings", organizationId] });
      toast.success("Configuração do fluxo salva.");
    },
  });

  if (!organizationId)
    return (
      <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        Selecione uma organização para configurar o fluxo de tarefas.
      </p>
    );
  if (query.isLoading)
    return (
      <div
        className="h-64 animate-pulse rounded-lg border border-border bg-card"
        aria-label="Carregando configuração dos fluxos"
      />
    );
  if (query.error || !query.data) {
    const errorCode =
      query.error && typeof query.error === "object" && "code" in query.error
        ? String(query.error.code)
        : "";
    return (
      <section className="rounded-lg border border-destructive/30 bg-card p-6" role="alert">
        <h1 className="text-lg font-semibold">Não foi possível carregar os fluxos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {["PGRST205", "42P01"].includes(errorCode)
            ? "A configuração ainda não existe neste banco. Aplique a migração SQL desta entrega e tente novamente."
            : query.error instanceof Error
              ? query.error.message
              : "Tente novamente."}
        </p>
        <button
          className="mt-4 rounded-md border border-border px-3 py-2 text-sm"
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5">
      <header>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Users className="h-4 w-4 text-[var(--gold)]" aria-hidden="true" /> Configurações do
          sistema
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Responsáveis e notificações por fluxo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Defina quem recebe novas tarefas em cada modalidade e quais movimentações aparecem nas
          notificações desta organização.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div
          className="flex flex-wrap gap-2 border-b border-border p-3"
          role="tablist"
          aria-label="Fluxo de tarefa"
        >
          {FLOWS.map((flow) => (
            <button
              key={flow.kind}
              role="tab"
              aria-selected={kind === flow.kind}
              onClick={() => setKind(flow.kind)}
              className="rounded-md border border-border px-3 py-2 text-sm aria-selected:border-primary aria-selected:bg-accent aria-selected:font-medium"
            >
              {flow.label}
            </button>
          ))}
        </div>
        <div className="grid gap-6 p-5">
          <div className="max-w-xl">
            <label htmlFor="task-flow-assignee" className="text-sm font-medium">
              Atendente padrão de {FLOWS.find((flow) => flow.kind === kind)?.label.toLowerCase()}
            </label>
            <select
              id="task-flow-assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sem atendente padrão</option>
              {query.data.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Novas tarefas deste fluxo serão atribuídas a este usuário. A configuração vale para{" "}
              {query.data.people.length} usuário(s) com acesso de edição.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <fieldset className="min-w-0 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                <Bell className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Notificações no sistema
              </legend>
              <div className="grid gap-1">
                {EVENTS.map((event) => (
                  <label
                    key={event.key}
                    className="flex min-h-10 items-center justify-between gap-3 rounded px-2 text-sm hover:bg-muted/40"
                  >
                    <span>{event.label}</span>
                    <input
                      type="checkbox"
                      checked={system[event.key]}
                      onChange={(e) =>
                        setSystem((value) => ({ ...value, [event.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-[var(--gold)]"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                <Mail className="mr-1 inline h-4 w-4" aria-hidden="true" />
                E-mail
              </legend>
              {!query.data.emailConfigured && (
                <p className="mb-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  O serviço de e-mail ainda não foi configurado. As opções serão liberadas quando a
                  empresa conectar um provedor.
                </p>
              )}
              <div className="grid gap-1">
                {EVENTS.map((event) => (
                  <label
                    key={event.key}
                    className="flex min-h-10 items-center justify-between gap-3 rounded px-2 text-sm text-muted-foreground"
                  >
                    <span>{event.label}</span>
                    <input
                      type="checkbox"
                      disabled={!query.data.emailConfigured}
                      checked={email[event.key]}
                      onChange={(e) =>
                        setEmail((value) => ({ ...value, [event.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-[var(--gold)]"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
        {mutation.error && (
          <p role="alert" className="px-5 pb-3 text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Não foi possível salvar."}
          </p>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Acesso restrito ao administrador do sistema
          </p>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!dirty || mutation.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isSuccess && !dirty ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {mutation.isPending
              ? "Salvando…"
              : mutation.isSuccess && !dirty
                ? "Salvo"
                : "Salvar configuração"}
          </button>
        </footer>
      </section>
    </div>
  );
}
