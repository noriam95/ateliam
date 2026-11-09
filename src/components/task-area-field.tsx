import { DropdownTextField } from "./dropdown-text-field";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadTaskAreas } from "@/lib/user-tasks.functions";
import { saveProcessArea } from "@/lib/config.functions";
export function TaskAreaField({
  organizationId,
  validationError,
  onSelect,
}: {
  organizationId: string;
  validationError?: string;
  onSelect?: () => void;
}) {
  const load = useServerFn(loadTaskAreas);
  const save = useServerFn(saveProcessArea);
  const q = useQuery({
    queryKey: ["task-areas", organizationId],
    queryFn: () => load({ data: { organizationId } }),
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [sigla, setSigla] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <input type="hidden" name="areaId" value={selected} />
      <div className="ut-area-search">
        <DropdownTextField
          label="Área"
          value={search}
          options={(q.data || []).map((area) => area.name)}
          placeholder="Pesquisar área"
          compact
          createOnlyWhenEmpty
          invalid={Boolean(validationError)}
          errorMessageId={validationError ? "task-area-error" : undefined}
          onChange={(value) => {
            setSearch(value);
            const areaId = q.data?.find((area) => area.name === value)?.id || "";
            setSelected(areaId);
            if (areaId) onSelect?.();
          }}
          createLabel="Cadastrar área"
          onCreate={
            !adding && !q.isLoading && !q.error
              ? (name) => {
                  setSearch(name);
                  setSigla("");
                  setError("");
                  setAdding(true);
                }
              : undefined
          }
        />
      </div>
      {validationError && (
        <small id="task-area-error" className="ut-field-error">
          {validationError}
        </small>
      )}
      {adding && (
        <div>
          <label>
            Nome da nova área
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Sigla (3 letras)
            <input
              maxLength={3}
              value={sigla}
              onChange={(e) => setSigla(e.target.value.toUpperCase())}
            />
          </label>
          <button
            type="button"
            disabled={busy || !search.trim() || sigla.trim().length !== 3}
            onClick={async () => {
              setError("");
              setBusy(true);
              try {
                const row = await save({ data: { organizationId, name: search, sigla } });
                await q.refetch();
                setSelected(row.id);
                setSearch(row.name);
                setAdding(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar área
          </button>
          <button type="button" disabled={busy} onClick={() => setAdding(false)}>
            Cancelar cadastro
          </button>
        </div>
      )}
      {q.isLoading && <small>Carregando áreas…</small>}
      {(error || q.error) && <p role="alert">{error || q.error?.message}</p>}
    </div>
  );
}
