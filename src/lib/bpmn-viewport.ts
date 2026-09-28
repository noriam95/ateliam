export type Rect = { x: number; y: number; width: number; height: number };
export function intersects(a: Rect, b: Rect) {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
export function contains(a: Rect, b: Rect) {
  return (
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
  );
}
/** Segment/rectangle intersection, including partially covered connections. */
export function segmentIntersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: Rect,
) {
  let low = 0,
    high = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy],
    q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) low = Math.max(low, t);
      else high = Math.min(high, t);
      if (low > high) return false;
    }
  }
  return true;
}
export function selectedByRectangle(element: any, box: Rect) {
  if (!element.parent || element.hidden || element.labelTarget) return false;
  if (element.waypoints)
    return element.waypoints.some(
      (p: any, i: number, all: any[]) => i > 0 && segmentIntersects(all[i - 1], p, box),
    );
  // Background pools/lanes are selected only when enclosed, so selecting tasks does not move the whole pool.
  if (["bpmn:Participant", "bpmn:Lane"].includes(element.type)) return contains(box, element);
  return intersects(box, element);
}
/** No overlay when its original label is visible, or when the owning region is offscreen. */
export function edgeIdentification(region: Rect, label: Rect, viewport: Rect) {
  if (!intersects(region, viewport) || contains(viewport, label)) return null;
  const width = Math.min(180, viewport.width - 16);
  const x = Math.max(
    8,
    Math.min(label.x + label.width / 2 - width / 2, viewport.width - width - 8),
  );
  const y = Math.max(8, Math.min(label.y + label.height / 2 - 14, viewport.height - 36));
  return { left: x, top: y, maxWidth: width };
}
