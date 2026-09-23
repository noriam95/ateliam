import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadTaskAreas } from "@/lib/user-tasks.functions";
import { saveProcessArea } from "@/lib/config.functions";
export function TaskAreaField({ organizationId }: { organizationId: string }) {
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
      <label>
        Área
        <select
          name="areaId"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
          }}
        >
          <option value="">Selecione uma área</option>
          {(q.data || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {!adding && !q.isLoading && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setSigla("");
            setAdding(true);
          }}
        >
          Cadastrar nova área
        </button>
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
