import { useRef, useState } from "react";
import { TaskDialog } from "@/components/task-dialog";
import { BpmnCanvas } from "./bpmn-canvas";
import { CatalogPicker, type BpmnCatalogs, type CreateCatalogItem } from "./catalog-picker";
import {
  inspectBpmn,
  normalizedBpmnName,
  type BpmnDocument,
  type BpmnInspection,
  type LaneBinding,
} from "@/lib/bpmn-document";

export function BpmnImportWizard({
  catalogs,
  create,
  onClose,
  onImport,
}: {
  catalogs: BpmnCatalogs;
  create: CreateCatalogItem;
  onClose: () => void;
  onImport: (document: BpmnDocument) => void;
}) {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<{
    xml: string;
    name: string;
    inspection: BpmnInspection;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renderWarnings, setRenderWarnings] = useState<string[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [processId, setProcessId] = useState("");
  const [bindings, setBindings] = useState<Record<string, LaneBinding>>({});
  const [kinds, setKinds] = useState<Record<string, "area" | "position">>({});
  const [confirmed, setConfirmed] = useState(false);
  const token = useRef(0);
  async function openFile(file?: File) {
    if (!file) return;
    const attempt = ++token.current;
    setBusy(true);
    setError("");
    setPreviewReady(false);
    setRenderWarnings([]);
    setSource(null);
    try {
      if (!/\.bpmn$/i.test(file.name)) throw new Error("Selecione um arquivo com extensão .bpmn.");
      if (file.size > 1_500_000)
        throw new Error("O arquivo excede o limite de 1,5 MB para importação.");
      const xml = await file.text();
      const inspection = await inspectBpmn(xml);
      if (attempt !== token.current) return;
      setSource({ xml, name: file.name, inspection });
      setStep(1);
      setBindings({});
      setProcessId("");
      setConfirmed(false);
    } catch (error) {
      if (attempt === token.current)
        setError(error instanceof Error ? error.message : "Falha ao ler arquivo.");
    } finally {
      if (attempt === token.current) setBusy(false);
    }
  }
  const process = catalogs.process.find((p) => p.id === processId);
  const suggestion =
    source &&
    catalogs.process.filter(
      (p) => normalizedBpmnName(p.name) === normalizedBpmnName(source.inspection.name),
    );
  const warnings = [...new Set([...(source?.inspection.warnings || []), ...renderWarnings])];
  const pending = source?.inspection.lanes.filter((l) => !bindings[l.id]).length || 0;
  return (
    <TaskDialog
      title="Importar desenho BPMN"
      onClose={() => {
        token.current++;
        onClose();
      }}
      wide
      busy={busy}
      dirty={!!source}
      className="bf-bpmn-import"
    >
      <div className="bf-bpmn-form">
        <ol className="bf-bpmn-steps" aria-label="Etapas da importação">
          {["Arquivo", "Conferir desenho", "Associar cadastros", "Confirmar"].map((s, i) => (
            <li key={s} aria-current={step === i ? "step" : undefined}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <label
            className="bf-bpmn-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void openFile(e.dataTransfer.files[0]);
            }}
          >
            <strong>Selecione ou arraste um arquivo .bpmn</strong>
            <span>BPMN 2.0 com coordenadas BPMN DI · até 1,5 MB</span>
            <input
              type="file"
              accept=".bpmn"
              disabled={busy}
              onChange={(e) => void openFile(e.target.files?.[0])}
            />
          </label>
        )}
        {busy && <p role="status">Validando arquivo…</p>}
        {error && (
          <p className="bf-bpmn-error" role="alert">
            {error}
          </p>
        )}
        {step === 1 && source && (
          <>
            <div>
              <strong>{source.name}</strong>
              <p>
                As posições e os trajetos são lidos do arquivo. Confira o desenho antes de associar
                os cadastros.
              </p>
            </div>
            <div className="bf-bpmn-counts">
              {Object.entries(source.inspection.counts).map(([key, value]) => (
                <span key={key}>
                  <b>{value}</b>{" "}
                  {
                    (
                      {
                        pools: "pools",
                        lanes: "raias",
                        activities: "atividades",
                        events: "eventos",
                        gateways: "gateways",
                        connections: "conexões",
                        annotations: "anotações",
                      } as Record<string, string>
                    )[key]
                  }
                </span>
              ))}
            </div>
            <div className="bf-bpmn-import-preview">
              <BpmnCanvas
                xml={source.xml}
                readOnly
                frozen={false}
                onReady={() => setPreviewReady(true)}
                onWarnings={setRenderWarnings}
              />
            </div>
            {!!warnings.length && (
              <details open>
                <summary>{warnings.length} avisos para conferência</summary>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p>
                  O arquivo original será preservado, inclusive recursos que não possam ser
                  editados.
                </p>
              </details>
            )}
          </>
        )}
        {step === 2 && source && (
          <>
            <h3>Processo do cadastro central</h3>
            <CatalogPicker
              kind="process"
              catalogs={catalogs}
              value={processId}
              onChange={(p) => setProcessId(p?.id || "")}
              create={create}
              label="Processo obrigatório"
            />
            {suggestion?.length === 1 && !processId && (
              <button onClick={() => setProcessId(suggestion[0].id)}>
                Usar correspondência: {suggestion[0].name}
              </button>
            )}
            <h3>Responsáveis pelas raias</h3>
            <p>
              Selecione uma Área ou um Cargo. Raias sem vínculo ficarão sinalizadas como A DEFINIR.
            </p>
            {source.inspection.lanes.map((lane, index) => {
              const kind = kinds[lane.id] || "area";
              const matches = catalogs[kind].filter(
                (item) => normalizedBpmnName(item.name) === normalizedBpmnName(lane.name),
              );
              return (
                <div className="bf-bpmn-lane-association" key={lane.id}>
                  <strong>{lane.name}</strong>
                  <small>Raia {index + 1}</small>
                  <label>
                    Tipo de responsável
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKinds({ ...kinds, [lane.id]: e.target.value as "area" | "position" });
                        setBindings((current) => {
                          const next = { ...current };
                          delete next[lane.id];
                          return next;
                        });
                      }}
                    >
                      <option value="area">Área</option>
                      <option value="position">Cargo</option>
                    </select>
                  </label>
                  <CatalogPicker
                    kind={kind}
                    catalogs={catalogs}
                    value={bindings[lane.id]?.id || ""}
                    onChange={(item) =>
                      setBindings((current) => {
                        const next = { ...current };
                        if (item) next[lane.id] = { kind, id: item.id, name: item.name };
                        else delete next[lane.id];
                        return next;
                      })
                    }
                    create={create}
                  />
                  {matches.length === 1 && !bindings[lane.id] && (
                    <button
                      onClick={() =>
                        setBindings({
                          ...bindings,
                          [lane.id]: { kind, id: matches[0].id, name: matches[0].name },
                        })
                      }
                    >
                      Usar correspondência: {matches[0].name}
                    </button>
                  )}
                </div>
              );
            })}
            {!source.inspection.lanes.length && (
              <p>Este arquivo não tem raias. Você poderá adicioná-las no editor.</p>
            )}
          </>
        )}
        {step === 3 && source && (
          <>
            <h3>Confirmar importação</h3>
            <dl>
              <dt>Arquivo</dt>
              <dd>{source.name}</dd>
              <dt>Processo</dt>
              <dd>{process?.name}</dd>
              <dt>Raias associadas</dt>
              <dd>
                {source.inspection.lanes.length - pending} de {source.inspection.lanes.length}
              </dd>
              <dt>Avisos do arquivo</dt>
              <dd>{warnings.length}</dd>
            </dl>
            {pending > 0 && (
              <p className="bf-bpmn-warning">{pending} raia(s) sem responsável: A DEFINIR.</p>
            )}
            <p>
              O XML original será mantido. Associar cadastros não modifica as coordenadas, os
              trajetos nem os rótulos importados.
            </p>
            <label className="bf-bpmn-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Conferi o desenho e confirmo os vínculos selecionados.
            </label>
          </>
        )}
      </div>
      <footer>
        <button disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        {step > 0 && (
          <button disabled={busy} onClick={() => setStep(step - 1)}>
            Voltar
          </button>
        )}
        {step > 0 && step < 3 && (
          <button
            className="bf-bpmn-primary"
            disabled={busy || (step === 1 && !previewReady) || (step === 2 && !process)}
            onClick={() => setStep(step + 1)}
          >
            Continuar
          </button>
        )}
        {step === 3 && (
          <button
            className="bf-bpmn-primary"
            disabled={!confirmed || !process || !source}
            onClick={() =>
              source &&
              process &&
              onImport({
                schemaVersion: 2,
                xml: source.xml,
                originalXml: source.xml,
                originalFilename: source.name,
                importedAt: new Date().toISOString(),
                origin: "imported",
                processId: process.id,
                processName: process.name,
                laneBindings: bindings,
                status: "Rascunho",
              })
            }
          >
            Importar e editar
          </button>
        )}
      </footer>
    </TaskDialog>
  );
}
