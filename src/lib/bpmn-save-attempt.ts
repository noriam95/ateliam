import type { BpmnDocument } from "./bpmn-document";

/** Capture the revision before asynchronous XML serialization, never after it. */
export async function captureBpmnSaveAttempt({
  revision,
  capture,
  ...identity
}: {
  id: string;
  mutationId: string;
  expectedVersion: number | null;
  expectedUpdatedAt: string | null;
  revision: number;
  capture: () => Promise<BpmnDocument>;
}) {
  const document = await capture();
  return { input: { ...identity, document }, revision };
}
