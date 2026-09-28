import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { BpmnModdle } from "bpmn-moddle";
const bundle = await build({
  entryPoints: ["src/lib/bpmn-document.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { inspectBpmn, blankBpmn, readBpmnDocument, applyBpmnLaneNames } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const fixture = await readFile("tests/fixtures/bpmn-di-rich.bpmn", "utf8");
const reference = await readFile(
  "tests/fixtures/MERCADO_INTERNO_ASIS_Bizagi_REV02_premissas_visuais.bpmn",
  "utf8",
);
test("User reference imports with 2 pools, 4 lanes, 10 activities, 26 connections and no false disconnected warnings", async () => {
  const result = await inspectBpmn(reference);
  assert.deepEqual(result.counts, {
    pools: 2,
    lanes: 4,
    activities: 10,
    events: 4,
    gateways: 1,
    connections: 26,
    annotations: 10,
  });
  assert.deepEqual(result.warnings, []);
  const moddle = new BpmnModdle();
  const before = await moddle.fromXML(reference);
  const after = await moddle.fromXML(
    (await moddle.toXML(before.rootElement, { format: true })).xml,
  );
  assert.deepEqual(geometry(after.rootElement), geometry(before.rootElement));
});
export function geometry(definitions) {
  return definitions.diagrams.map((d) =>
    d.plane.planeElement.map((e) => ({
      id: e.bpmnElement.id,
      type: e.$type,
      horizontal: e.isHorizontal,
      expanded: e.isExpanded,
      bounds: e.bounds && [e.bounds.x, e.bounds.y, e.bounds.width, e.bounds.height],
      points: e.waypoint?.map((p) => [p.x, p.y]),
      label: e.label?.bounds && [
        e.label.bounds.x,
        e.label.bounds.y,
        e.label.bounds.width,
        e.label.bounds.height,
      ],
      fill: e.get("bioc:fill"),
      stroke: e.get("bioc:stroke"),
    })),
  );
}
test("BPMN inspection counts pools, lanes, activities, connections and annotations without layout", async () => {
  const result = await inspectBpmn(fixture);
  assert.deepEqual(result.counts, {
    pools: 2,
    lanes: 3,
    activities: 3,
    events: 4,
    gateways: 2,
    connections: 9,
    annotations: 1,
  });
  assert.equal(result.name, "MERCADO INTERNO");
  assert.equal(result.lanes[1].name, "ANALISTA");
  assert.ok(result.warnings.some((w) => w.includes("atributos externos")));
});
test("BPMN moddle roundtrip preserves every DI coordinate, label, waypoint and color", async () => {
  const moddle = new BpmnModdle();
  const before = await moddle.fromXML(fixture);
  const { xml } = await moddle.toXML(before.rootElement, { format: true });
  const after = await moddle.fromXML(xml);
  assert.deepEqual(geometry(after.rootElement), geometry(before.rootElement));
  assert.equal(after.elementsById.Manual_1.$attrs["vendor:review"], "required");
});
test("Invalid XML, missing DI and DTD are rejected without inventing positions", async () => {
  for (const xml of [
    "",
    "not xml",
    "<bad>",
    '<!DOCTYPE a [<!ENTITY test SYSTEM "file:///etc/passwd">]><a/>',
    fixture.replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, ""),
  ])
    await assert.rejects(inspectBpmn(xml));
});
test("New drawings escape process names and start with one unbound lane", async () => {
  const result = await inspectBpmn(blankBpmn('Pesquisa & "Desenvolvimento" <2026>'));
  assert.equal(result.name, 'Pesquisa & "Desenvolvimento" <2026>');
  assert.equal(result.counts.lanes, 1);
  assert.equal(result.lanes[0].name, "A DEFINIR");
});
test("Document serialization retains original source separately from editable XML", () => {
  const doc = {
    schemaVersion: 2,
    xml: blankBpmn("Novo"),
    originalXml: fixture,
    originalFilename: "fonte.bpmn",
    processId: "x",
    processName: "Novo",
    laneBindings: {},
    status: "Rascunho",
    origin: "imported",
  };
  assert.deepEqual(readBpmnDocument(JSON.stringify({ bpmn: doc })), doc);
});
test("Legacy drawings remain accessible through the data adapter", async () => {
  const doc = readBpmnDocument(
    JSON.stringify({
      bpmn: {
        poolName: "Antigo",
        lanes: ["COMERCIAL"],
        nodes: [
          {
            id: "a",
            type: "task",
            label: "Conferir",
            x: 330,
            y: 180,
            lane: 0,
            width: 140,
            height: 64,
          },
        ],
        flows: [],
      },
    }),
  );
  const parsed = await new BpmnModdle().fromXML(doc.xml);
  assert.equal(doc.origin, "legacy");
  assert.equal(parsed.elementsById.Legacy_a.name, "Conferir");
  assert.equal(parsed.elementsById.Legacy_a_di.bounds.x, 330);
});

test("selected catalog names replace lane labels without altering diagram geometry", async () => {
  const parser = new BpmnModdle();
  const before = await parser.fromXML(fixture);
  const output = await applyBpmnLaneNames(fixture, {
    Lane_1: { id: "area", kind: "area", name: "FINANCEIRO" },
  });
  const after = await parser.fromXML(output);
  assert.equal(after.elementsById.Lane_1.name, "FINANCEIRO");
  const geometry = (root) =>
    root.diagrams
      .flatMap((d) =>
        d.plane.planeElement.map((e) => ({
          id: e.id,
          bounds: e.bounds && [e.bounds.x, e.bounds.y, e.bounds.width, e.bounds.height],
          waypoints: e.waypoint?.map((p) => [p.x, p.y]),
        })),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(geometry(before.rootElement), geometry(after.rootElement));
  const updated = await parser.fromXML(
    await applyBpmnLaneNames(output, {
      Lane_1: { id: "position", kind: "position", name: "ANALISTA" },
    }),
  );
  assert.equal(updated.elementsById.Lane_1.name, "ANALISTA");
});
