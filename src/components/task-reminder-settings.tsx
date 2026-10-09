import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCircle2, Clock3, Mail, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getTaskReminderSettings,
  saveTaskReminderSettings,
} from "@/lib/task-reminder-settings.functions";

const DAY_OPTIONS = [
  { value: 0, label: "No dia do vencimento" },
  { value: 1, label: "1 dia antes" },
  { value: 3, label: "3 dias antes" },
  { value: 7, label: "7 dias antes" },
  { value: 14, label: "14 dias antes" },
];

type ReminderSettings = {
  id: number;
  enabled: boolean;
  reminder_days: number[];
  send_time: string;
  timezone: string;
  updated_at: string;
};

export function TaskReminderSettings() {
  const queryClient = useQueryClient();
  const load = useServerFn(getTaskReminderSettings);
  const save = useServerFn(saveTaskReminderSettings);
  const query = useQuery({
    queryKey: ["task-reminder-settings"],
    queryFn: () => load(),
  });
  const [days, setDays] = useState<number[]>([]);
  const [sendTime, setSendTime] = useState("08:00");

  useEffect(() => {
    if (!query.data) return;
    setDays([...(query.data.reminder_days as number[])].sort((a, b) => a - b));
    setSendTime(query.data.send_time.slice(0, 5));
  }, [query.data]);

  const originalDays = useMemo(
    () => [...((query.data?.reminder_days as number[] | undefined) ?? [])].sort((a, b) => a - b),
    [query.data],
  );
  const dirty =
    days.length !== originalDays.length ||
    days.some((day, index) => day !== originalDays[index]) ||
    sendTime !== (query.data?.send_time.slice(0, 5) ?? "08:00");

  const mutation = useMutation({
    mutationFn: () => save({ data: { reminderDays: days, sendTime } }),
    onSuccess: async (data) => {
      queryClient.setQueryData(["task-reminder-settings"], data);
      await queryClient.invalidateQueries({ queryKey: ["task-reminder-settings"] });
      toast.success("Preferências de lembrete salvas.");
    },
  });

  function toggleDay(day: number, checked: boolean) {
    setDays((current) =>
      (checked ? [...current, day] : current.filter((value) => value !== day)).sort(
        (a, b) => a - b,
      ),
    );
  }

  if (query.isLoading) {
    return (
      <section className="grid gap-4" aria-busy="true" aria-label="Carregando lembretes">
        <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </section>
    );
  }

  if (query.error || !query.data) {
    const errorCode =
      query.error && typeof query.error === "object" && "code" in query.error
        ? String(query.error.code)
        : "";
    const migrationPending = ["PGRST205", "42P01"].includes(errorCode);
    return (
      <section className="rounded-lg border border-destructive/30 bg-card p-6" role="alert">
        <h1 className="text-lg font-semibold">Não foi possível carregar os lembretes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {migrationPending
            ? "A estrutura de lembretes ainda não foi aplicada neste banco. Aplique a migração SQL incluída nesta entrega e tente novamente."
            : query.error instanceof Error
              ? query.error.message
              : "Tente novamente."}
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-4 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Bell className="h-4 w-4 text-[var(--gold-ink)]" aria-hidden="true" />
            Configurações do sistema
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Lembretes de tarefas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Defina quando o BF Flow deverá avisar os responsáveis sobre tarefas próximas do
            vencimento.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Serviço de envio pendente
        </span>
      </header>

      <section className="rounded-lg border border-amber-300/60 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
        <div className="flex gap-3">
          <Mail
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold">Nenhum e-mail será enviado ainda</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              As preferências podem ser preparadas agora. O envio só será ativado depois que a
              empresa disponibilizar e configurar um serviço de e-mail e o agendamento no ambiente
              do BF Flow. Credenciais deverão ficar nos segredos do ambiente, nunca nesta tela.
            </p>
          </div>
        </div>
      </section>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Política de lembretes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estas preferências serão usadas quando o serviço de envio estiver conectado.
          </p>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Quando avisar</legend>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecione um ou mais momentos relativos ao vencimento.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DAY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={days.includes(option.value)}
                    onChange={(event) => toggleDay(option.value, event.target.checked)}
                    className="h-4 w-4 accent-[var(--gold)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="task-reminder-send-time" className="text-sm font-medium">
              Horário do envio
            </label>
            <div className="relative mt-2">
              <Clock3
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="task-reminder-send-time"
                type="time"
                value={sendTime}
                onChange={(event) => setSendTime(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/15"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Fuso horário: {query.data.timezone}
            </p>
          </div>
        </div>

        {(days.length === 0 || mutation.error) && (
          <p role="alert" className="mx-5 mb-3 text-sm text-destructive">
            {days.length === 0
              ? "Escolha ao menos um prazo para o lembrete."
              : mutation.error instanceof Error
                ? mutation.error.message
                : "Não foi possível salvar as preferências."}
          </p>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Acesso restrito ao administrador do sistema
          </p>
          <button
            type="submit"
            disabled={!dirty || days.length === 0 || mutation.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                : "Salvar preferências"}
          </button>
        </footer>
      </form>
    </div>
  );
}
