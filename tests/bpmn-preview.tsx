import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BpmnEditor, type SavedBpmn } from "../src/components/bpmn/bpmn-editor";
import { BpmnImportWizard } from "../src/components/bpmn/import-wizard";
import type { BpmnCatalogs } from "../src/components/bpmn/catalog-picker";
import type { BpmnDocument } from "../src/lib/bpmn-document";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { BpmnModdle } from "bpmn-moddle";
import { exportBpmnPng } from "../src/lib/bpmn-export";
import { bpmnLaneModule } from "../src/lib/bpmn-lanes";
import { bpmnSelectionModule } from "../src/lib/bpmn-selection";
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
            code: input.saveMode === "draft" ? "FLU.COM.001.TEMP" : "FLU.COM.001",
            current_version: (input.expectedVersion || 0) + (input.saveMode === "final" ? 1 : 0),
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
    engine = new Modeler({
      container: host,
      additionalModules: [...bpmnEngineModules, bpmnSelectionModule, bpmnLaneModule],
    });
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
    const second = registry.get("User_1");
    if (!second) throw new Error("Missing group fixture task");
    const start = [task.x, task.y, second.x, second.y];
    engine.get("selection").select([task, second]);
    modeling.moveElements([task, second], { x: 30, y: 20 }, task.parent);
    check(
      task.x === start[0] + 30 &&
        second.x === start[2] + 30 &&
        task.y === start[1] + 20 &&
        second.y === start[3] + 20,
      "mover seleção mantendo posições relativas",
    );
    stack.undo();
    modeling.removeElements([task, second]);
    check(!registry.get(task.id) && !registry.get(second.id), "excluir seleção em conjunto");
    stack.undo();
    await engine.saveXML({ format: true });
    const geometryBeforeReorder = JSON.stringify(geometry(engine.getDefinitions()));
    const lane1 = registry.get("Lane_1"),
      lane3 = registry.get("Lane_3");
    const refsBefore = lane1.businessObject.flowNodeRef.map((e: any) => e.id).join();
    const laneY = lane1.y,
      taskY = task.y;
    stack.execute("bf.lane.reorder", { lane: lane1, target: lane3, after: true });
    check(lane1.y === laneY + 440 && task.y === taskY + 440, "reordenar raia com seu conteúdo");
    check(
      lane1.businessObject.flowNodeRef.map((e: any) => e.id).join() === refsBefore,
      "reordenação preserva vínculos semânticos",
    );
    const crossLane = registry.get("Flow_3");
    const touches = (point: any, shape: any) =>
      point.x >= shape.x - 2 &&
      point.x <= shape.x + shape.width + 2 &&
      point.y >= shape.y - 2 &&
      point.y <= shape.y + shape.height + 2;
    check(
      touches(crossLane.waypoints[0], crossLane.source) &&
        touches(crossLane.waypoints.at(-1), crossLane.target),
      "conexões entre raias continuam anexadas após reordenação",
    );
    const reordered = await moddle.fromXML((await engine.saveXML({ format: true })).xml);
    check(
      reordered.elementsById.Lane_1.$parent.lanes.at(-1).id === "Lane_1",
      "ordem de raias persistida no XML",
    );
    stack.undo();
    const restoredGeometry = geometry(engine.getDefinitions());
    const expectedGeometry = JSON.parse(geometryBeforeReorder);
    // bpmn-js materializes bounds for implicit external labels on redraw.
    // Compare all original geometry; newly explicit label bounds are not a move.
    restoredGeometry.forEach((plane: any[], pi: number) =>
      plane.forEach((e: any, ei: number) => {
        if (!expectedGeometry[pi][ei].label) delete e.label;
      }),
    );
    check(
      JSON.stringify(restoredGeometry) === geometryBeforeReorder,
      "desfazer reordenação restaura toda a geometria original",
    );
    stack.redo();
    check(task.y === taskY + 440, "refazer reordenação");
    stack.undo();
    modeling.setColor([task], { fill: "#aabbcc" });
    check(task.di.get("bioc:fill") === "#aabbcc", "preenchimento personalizado persistido");
    const png = await exportBpmnPng(engine);
    const signature = new Uint8Array(await png.arrayBuffer());
    check(
      png.type === "image/png" && signature.slice(0, 8).join() === "137,80,78,71,13,10,26,10",
      "exportação produz PNG válido",
    );
    const bitmap = await createImageBitmap(png);
    check(
      bitmap.width > 1700 && bitmap.height > 800,
      "PNG inclui desenho inteiro em alta resolução",
    );
    const pixelsCanvas = document.createElement("canvas");
    pixelsCanvas.width = bitmap.width;
    pixelsCanvas.height = bitmap.height;
    const pixelsContext = pixelsCanvas.getContext("2d")!;
    pixelsContext.drawImage(bitmap, 0, 0);
    const pixels = pixelsContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
    check(
      pixels.some(
        (v, i) =>
          i % 4 === 0 &&
          Math.abs(v - 174) < 3 &&
          Math.abs(pixels[i + 1] - 190) < 3 &&
          Math.abs(pixels[i + 2] - 207) < 3,
      ),
      "PNG preserva preenchimento personalizado",
    );
    bitmap.close();
    engine.get("canvas").zoom(0.3);
    engine.get("canvas").scroll({ dx: -700, dy: -400 });
    const movedPng = await createImageBitmap(await exportBpmnPng(engine));
    check(
      movedPng.width === pixelsCanvas.width && movedPng.height === pixelsCanvas.height,
      "PNG não é recortado pelo zoom ou deslocamento",
    );
    movedPng.close();

    stack.undo();
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
    stack.execute("bf.lane.insert", { target: registry.get("Lane_3"), after: true });
    check(
      registry.filter((e: any) => e.type === "bpmn:Lane").length === count + 1,
      "adicionar raia",
    );
    stack.undo();
    check(
      registry.filter((e: any) => e.type === "bpmn:Lane").length === count,
      "desfazer inserção de raia em uma única ação",
    );
    const copy = engine.get("copyPaste");
    const pasteParent = task.parent;
    const originalName = task.businessObject.name,
      originalFill = task.di.get("bioc:fill");
    copy.cut([task]);
    check(!registry.get(task.id), "recortar retira elemento copiado");
    const pasted = copy.paste({ element: pasteParent, point: { x: 900, y: 200 } });
    check(
      pasted.some(
        (e: any) =>
          e.type === task.type &&
          e.businessObject.name === originalName &&
          e.di.get("bioc:fill") === originalFill,
      ),
      "colar preserva tipo, texto e cor após recorte",
    );
    stack.undo();
    stack.undo();
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
    const annotation = engine.get("elementFactory").createShape({ type: "bpmn:TextAnnotation" });
    modeling.createShape(annotation, { x: 320, y: 650 }, engine.get("canvas").getRootElement());
    const noteRect = registry.getGraphics(annotation).querySelector(".djs-visual > rect");
    check(
      getComputedStyle(noteRect).fill === "rgb(255, 242, 179)" &&
        !registry.getGraphics(annotation).querySelector(".djs-visual > path"),
      "anotação criada como retângulo amarelo",
    );
    modeling.updateProperties(annotation, { text: "Observação editável" });
    check(annotation.businessObject.text === "Observação editável", "editar texto da anotação");
    modeling.resizeShape(annotation, {
      x: annotation.x,
      y: annotation.y,
      width: 220,
      height: annotation.height,
    });
    check(annotation.width === 220, "redimensionar anotação");
    modeling.moveShape(annotation, { x: 20, y: 10 });
    check(annotation.x > 220, "mover anotação");
    modeling.removeShape(annotation);
    check(!registry.get(annotation.id), "excluir anotação");
    stack.undo();
    const finalXml = (await engine.saveXML({ format: true })).xml;
    engine.destroy();
    engine = new NavigatedViewer({ container: host, additionalModules: bpmnEngineModules });
    await engine.importXML(finalXml);
    check(
      engine
        .get("elementRegistry")
        .getGraphics(engine.get("elementRegistry").get(annotation.id))
        .querySelector(".djs-visual > rect")
        .style.fill === "#FFF2B3",
      "anotação amarela ao reabrir desenho",
    );
    check(!engine.get("modeling", false), "apresentação sem modelagem");
    check(!engine.get("commandStack", false), "apresentação sem comandos de edição");
    engine.get("canvas").zoom(0.7);
    engine.get("canvas").scroll({ dx: 120, dy: 90 });
    const readOnlyXml = (await engine.saveXML({ format: true })).xml;
    const presented = await moddle.fromXML(readOnlyXml);
    const editedSnapshot = await moddle.fromXML(finalXml);
    check(
      JSON.stringify(geometry(editedSnapshot.rootElement)) ===
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
    engine = new Modeler({
      container: host,
      additionalModules: [...bpmnEngineModules, bpmnSelectionModule, bpmnLaneModule],
    });
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
