import { useEffect, useId, useState } from "react";
import { DropdownTextField } from "@/components/dropdown-text-field";
import { TaskDialog } from "@/components/task-dialog";

export type CatalogItem = { id: string; name: string; code?: string | null; sigla?: string | null };
export type CatalogKind = "process" | "area" | "position";
export type BpmnCatalogs = Record<CatalogKind, CatalogItem[]>;
export type CreateCatalogItem = (
  kind: CatalogKind,
  values: { name: string; sigla: string; areaId: string },
) => Promise<CatalogItem>;
const names: Record<CatalogKind, string> = { process: "Processo", area: "Área", position: "Cargo" };

/** Uses the same searchable field, native dialog and central catalog APIs as mappings. */
export function CatalogPicker({
  kind,
  catalogs,
  value,
  onChange,
  create,
  label,
}: {
  kind: CatalogKind;
  catalogs: BpmnCatalogs;
  value: string;
  onChange: (item: CatalogItem | null) => void;
  create?: CreateCatalogItem;
  label?: string;
}) {
  const items = catalogs[kind];
  const itemLabel = (item: CatalogItem) =>
    `${item.code || item.sigla ? `${item.code || item.sigla} · ` : ""}${item.name}${items.filter((i) => i.name === item.name && i.code === item.code).length > 1 ? ` · ${item.id.slice(0, 8)}` : ""}`;
  const [text, setText] = useState(
    itemLabel(items.find((i) => i.id === value) || { id: "", name: "" }),
  );
  const [creation, setCreation] = useState<{ name: string; sigla: string; areaId: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const [invalidField, setInvalidField] = useState<string | null>(null);
  useEffect(() => {
    const item = items.find((i) => i.id === value);
    if (item) setText(itemLabel(item));
  }, [value, items]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="bf-bpmn-catalog">
        <DropdownTextField
          inlineOptions
          label={label || names[kind]}
          value={text}
          options={items.map(itemLabel)}
          placeholder={`Pesquisar ${names[kind].toLocaleLowerCase("pt-BR")}…`}
          onChange={(next) => {
            setText(next);
            onChange(items.find((i) => itemLabel(i) === next) || null);
          }}
          createLabel={`Cadastrar ${names[kind].toLocaleLowerCase("pt-BR")}`}
          onCreate={
            create
              ? (name) => {
                  setError("");
                  setInvalidField(null);
                  setCreation({ name, sigla: "", areaId: "" });
                }
              : undefined
          }
        />
      </div>
      {creation && (
        <TaskDialog
          title={`Cadastrar ${names[kind].toLocaleLowerCase("pt-BR")}`}
          onClose={() => !busy && setCreation(null)}
          dirty
          busy={busy}
        >
          <form
            noValidate
            className="bf-bpmn-form"
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (busy || !create) return;
              const name = creation.name.trim();
              const limit = kind === "process" ? 180 : kind === "position" ? 160 : 120;
              const invalid =
                name.length < 2 || name.length > limit
                  ? "catalogName"
                  : kind === "area" && !/^[A-Za-z]{3}$/.test(creation.sigla)
                    ? "catalogSigla"
                    : kind === "process" && !creation.areaId
                      ? "areaId"
                      : null;
              setInvalidField(invalid);
              if (invalid) {
                setError(
                  invalid === "catalogName"
                    ? `Informe um nome entre 2 e ${limit} caracteres.`
                    : invalid === "catalogSigla"
                      ? "Informe uma sigla com 3 letras."
                      : "Selecione a área do processo.",
                );
                const field = e.currentTarget.elements.namedItem(invalid);
                if (field instanceof HTMLElement) field.focus();
                return;
              }
              setBusy(true);
              setError("");
              try {
                const item = await create(kind, { ...creation, name });
                setText(itemLabel(item));
                onChange(item);
                setCreation(null);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Não foi possível cadastrar. Tente novamente.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Este registro ficará disponível no cadastro central da organização.</p>
            <label>
              Nome
              <input
                name="catalogName"
                aria-invalid={invalidField === "catalogName"}
                aria-describedby={error ? errorId : undefined}
                autoFocus
                required
                minLength={2}
                maxLength={kind === "process" ? 180 : kind === "position" ? 160 : 120}
                value={creation.name}
                onChange={(e) => setCreation({ ...creation, name: e.target.value })}
                disabled={busy}
              />
            </label>
            {kind === "area" && (
              <label>
                Sigla (3 letras)
                <input
                  required
                  name="catalogSigla"
                  aria-invalid={invalidField === "catalogSigla"}
                  aria-describedby={error ? errorId : undefined}
                  pattern="[A-Za-z]{3}"
                  maxLength={3}
                  value={creation.sigla}
                  onChange={(e) =>
                    setCreation({ ...creation, sigla: e.target.value.toUpperCase() })
                  }
                  disabled={busy}
                />
              </label>
            )}
            {kind === "process" && (
              <CatalogPicker
                kind="area"
                catalogs={catalogs}
                value={creation.areaId}
                onChange={(item) => setCreation({ ...creation, areaId: item?.id || "" })}
                create={create}
                label="Área do processo"
              />
            )}
            {error && (
              <p id={errorId} role="alert" className="bf-bpmn-error">
                {error}
              </p>
            )}
            <div className="bf-bpmn-actions">
              <button type="button" disabled={busy} onClick={() => setCreation(null)}>
                Cancelar
              </button>
              <button
                className="bf-bpmn-primary"
                disabled={busy || (kind === "process" && !creation.areaId)}
              >
                {busy ? "Cadastrando…" : "Cadastrar e selecionar"}
              </button>
            </div>
          </form>
        </TaskDialog>
      )}
    </>
  );
}
