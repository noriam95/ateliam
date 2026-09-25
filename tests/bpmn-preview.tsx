import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BpmnEditor, type SavedBpmn } from "../src/components/bpmn/bpmn-editor";
import { BpmnImportWizard } from "../src/components/bpmn/import-wizard";
import type { BpmnCatalogs } from "../src/components/bpmn/catalog-picker";
import type { BpmnDocument } from "../src/lib/bpmn-document";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { BpmnModdle } from "bpmn-moddle";
import { bpmnEngineModules } from "../src/lib/bpmn-engine-modules";
import reference from "./fixtures/MERCADO_INTERNO_ASIS_Bizagi_REV02_premissas_visuais.bpmn";
import source from "./fixtures/bpmn-di-rich.bpmn";

const initial: BpmnDocument = {
  schemaVersion: 2,
  xml: source,
  originalXml: source,
  originalFilename: "bpmn-di-rich.bpmn",
  processId: "b7f45733-02ae-4d5a-b803-77e128a168ec",
  processName: "MERCADO INTERNO",
  laneBindings: {},
  status: "Rascunho",
  origin: "imported",
};
export function Preview() {
  const [document, setDocument] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState(false);
  const [saved, setSaved] = useState<{ document: BpmnDocument; record: SavedBpmn } | null>(null);
  const [results, setResults] = useState("");
  const [catalogs, setCatalogs] = useState<BpmnCatalogs>({
    process: [{ id: initial.processId, name: "MERCADO INTERNO", code: "PRO.COM.001" }],
    area: [
      { id: "340be419-c81c-4259-83e2-466a88d2f825", name: "COMERCIAL", sigla: "COM" },
      { id: "b72ca7b6-7f46-43ca-be59-f3d7e7c4725a", name: "EXPEDIÇÃO", sigla: "EXP" },
    ],
    position: [{ id: "8af89f15-ec1a-4a1b-92ae-4f983dc33b28", name: "ANALISTA" }],
  });
  const create = async (kind: "process" | "area" | "position", values: any) => {
    const item = { id: crypto.randomUUID(), name: values.name, sigla: values.sigla };
    setCatalogs((c) => ({ ...c, [kind]: [...c[kind], item] }));
    return item;
  };
  return (
    <div className="bf-bpmn-root">
      <div style={{ fontSize: 11, padding: 6, display: "flex", gap: 12, alignItems: "center" }}>
        VERIFICAÇÃO LOCAL · persistência simulada{" "}
        <button onClick={() => setImporting(true)}>Testar importação</button>
        <label>
          <input type="checkbox" checked={failure} onChange={(e) => setFailure(e.target.checked)} />
          Simular falha de salvamento
        </label>
        <button
          disabled={!saved}
          onClick={() => {
            if (saved) {
              setDocument(saved.document);
              setGeneration(generation + 1);
            }
          }}
        >
          Reabrir salvo
        </button>
        <button onClick={() => void regression().then(setResults)}>Testar motor BPMN</button>
        <output
          style={{
            maxWidth: 320,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
          data-testid="engine-results"
        >
          {results}
        </output>
      </div>
      <BpmnEditor
        key={generation}
        initial={document}
        saved={saved?.record || null}
        storageKey="bf-bpmn-preview-draft"
        catalogs={catalogs}
        create={create}
        onBack={() => {
          setDocument(initial);
          setGeneration(generation + 1);
        }}
        onSave={async (input) => {
          await new Promise((r) => setTimeout(r, 200));
          if (failure) throw new Error("Falha de rede simulada. Tente salvar novamente.");
          const record = {
            id: input.id,
            current_version: (input.expectedVersion || 0) + 1,
            updated_at: new Date().toISOString(),
          };
          setSaved({ document: input.document, record });
          return record;
        }}
      />
      {importing && (
        <BpmnImportWizard
          catalogs={catalogs}
          create={create}
          onClose={() => setImporting(false)}
          onImport={(doc) => {
            setDocument(doc);
            setSaved(null);
            setGeneration(generation + 1);
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}
function geometry(definitions: any) {
  return definitions.diagrams.map((d: any) =>
    d.plane.planeElement
      .map((e: any) => ({
        id: e.bpmnElement.id,
        bounds: e.bounds && [e.bounds.x, e.bounds.y, e.bounds.width, e.bounds.height],
        points: e.waypoint?.map((p: any) => [p.x, p.y]),
        label: e.label?.bounds && [
          e.label.bounds.x,
          e.label.bounds.y,
          e.label.bounds.width,
          e.label.bounds.height,
        ],
        fill: e.get("bioc:fill"),
        stroke: e.get("bioc:stroke"),
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id)),
  );
}
async function regression() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;width:1000px;height:700px";
  document.body.append(host);
  const checks: string[] = [];
  let engine: any;
  const check = (condition: boolean, name: string) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  try {
    const moddle = new BpmnModdle();
    const before = await moddle.fromXML(source);
    engine = new Modeler({ container: host, additionalModules: bpmnEngineModules });
    await engine.importXML(source);
    const output = await engine.saveXML({ format: true });
    const after = await moddle.fromXML(output.xml);
    check(
      JSON.stringify(geometry(before.rootElement)) === JSON.stringify(geometry(after.rootElement)),
      "DI intacto ao abrir/salvar: " +
        JSON.stringify(
          geometry(before.rootElement)[0]
            .map((e: any, i: number) =>
              JSON.stringify(e) === JSON.stringify(geometry(after.rootElement)[0][i])
                ? null
                : { before: e, after: geometry(after.rootElement)[0][i] },
            )
            .filter(Boolean),
        ),
    );
    const registry = engine.get("elementRegistry"),
      modeling = engine.get("modeling"),
      stack = engine.get("commandStack");
    const task = registry.get("Manual_1");
    const x = task.x;
    modeling.moveShape(task, { x: 80, y: 0 });
    check(task.x === x + 80, "movimentação livre");
    stack.undo();
    check(task.x === x, "desfazer");
    stack.redo();
    check(task.x === x + 80, "refazer");
    stack.undo();
    modeling.updateProperties(task, { name: "Conferir dados" });
    check(task.businessObject.name === "Conferir dados", "editar texto");
    stack.undo();
    check(
      engine.get("rules").allowed("shape.resize", {
        shape: task,
        newBounds: { x: task.x, y: task.y, width: 220, height: 100 },
      }) === true,
      "redimensionamento de tarefas permitido",
    );
    modeling.resizeShape(task, { x: task.x, y: task.y, width: 220, height: 100 });
    check(task.width === 220 && task.height === 100, "redimensionar tarefa");
    stack.undo();
    const count = registry.filter((e: any) => e.type === "bpmn:Lane").length;
    modeling.addLane(registry.get("Lane_3"), "bottom");
    check(
      registry.filter((e: any) => e.type === "bpmn:Lane").length === count + 1,
      "adicionar raia",
    );
    stack.undo();
    const copy = engine.get("copyPaste");
    const duplicated = copy.duplicate([task], { element: task.parent, point: { x: 900, y: 200 } });
    check(duplicated?.length > 0, "duplicar");
    stack.undo();
    const a = registry.get("Flow_3");
    const originalPoints = a.waypoints.map((p: any) => ({ ...p }));
    modeling.updateWaypoints(a, [
      originalPoints[0],
      { x: 660, y: 188.25 },
      { x: 660, y: 410.25 },
      originalPoints[3],
    ]);
    check(a.waypoints[1].x === 660, "editar pontos de conexão");
    stack.undo();
    const finalXml = (await engine.saveXML({ format: true })).xml;
    engine.destroy();
    engine = new NavigatedViewer({ container: host, additionalModules: bpmnEngineModules });
    await engine.importXML(finalXml);
    check(!engine.get("modeling", false), "apresentação sem modelagem");
    check(!engine.get("commandStack", false), "apresentação sem comandos de edição");
    engine.get("canvas").zoom(0.7);
    engine.get("canvas").scroll({ dx: 120, dy: 90 });
    const readOnlyXml = (await engine.saveXML({ format: true })).xml;
    const presented = await moddle.fromXML(readOnlyXml);
    check(
      JSON.stringify(geometry(before.rootElement)) ===
        JSON.stringify(geometry(presented.rootElement)),
      "pan e zoom não alteram DI",
    );
    const refBefore = await moddle.fromXML(reference);
    await engine.importXML(reference);
    const refXml = (await engine.saveXML({ format: true })).xml;
    const refAfter = await moddle.fromXML(refXml);
    check(
      JSON.stringify(geometry(refBefore.rootElement)) ===
        JSON.stringify(geometry(refAfter.rootElement)),
      "referência Bizagi preservada no visualizador",
    );
    engine.destroy();
    engine = new Modeler({ container: host, additionalModules: bpmnEngineModules });
    await engine.importXML(reference);
    const refEdited = await moddle.fromXML((await engine.saveXML({ format: true })).xml);
    check(
      JSON.stringify(geometry(refBefore.rootElement)) ===
        JSON.stringify(geometry(refEdited.rootElement)),
      "referência Bizagi preservada no editor",
    );
    return `PASS ${checks.length}: ${checks.join("; ")}`;
  } catch (error) {
    return `FAIL após ${checks.length}: ${String(error)}`;
  } finally {
    engine?.destroy();
    host.remove();
  }
}
createRoot(document.getElementById("root")!).render(<Preview />);
