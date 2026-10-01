const IMAGE_PREFIX = "BF_IMAGE_V1:";
export const IMAGE_PENDING = `${IMAGE_PREFIX}pending`;

export type BpmnImagePayload = {
  src: string;
  name: string;
  aspectRatio: number;
};

export function encodeBpmnImage(payload: BpmnImagePayload) {
  return `${IMAGE_PREFIX}${JSON.stringify(payload)}`;
}

export function readBpmnImage(value: unknown): BpmnImagePayload | null {
  if (typeof value !== "string" || !value.startsWith(IMAGE_PREFIX) || value === IMAGE_PENDING)
    return null;
  try {
    const parsed = JSON.parse(value.slice(IMAGE_PREFIX.length));
    if (
      typeof parsed.src !== "string" ||
      !parsed.src.startsWith("data:image/") ||
      typeof parsed.name !== "string" ||
      !Number.isFinite(parsed.aspectRatio) ||
      parsed.aspectRatio <= 0
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function imageValue(element: any) {
  return (
    element?.businessObject?.documentation?.find((item: any) =>
      item?.text?.startsWith(IMAGE_PREFIX),
    )?.text || element?.businessObject?.text
  );
}

export function readBpmnImageElement(element: any) {
  return readBpmnImage(imageValue(element));
}

export function isBpmnImagePending(element: any) {
  return imageValue(element) === IMAGE_PENDING;
}

export function isBpmnImageElement(element: any) {
  return (
    ["bpmn:Group", "bpmn:TextAnnotation"].includes(element?.type) &&
    Boolean(readBpmnImageElement(element))
  );
}

/** Keeps image annotations proportional while using the native BPMN resize command. */
export function BpmnImageResize(eventBus: any) {
  eventBus.on("resize.move", 500, (event: any) => {
    const { shape, direction, newBounds } = event.context;
    const image = readBpmnImageElement(shape);
    if (!image || !newBounds) return;
    const ratio = image.aspectRatio;
    const right = shape.x + shape.width;
    const bottom = shape.y + shape.height;
    let width = Math.max(48, newBounds.width);
    let height = Math.max(32, newBounds.height);

    if (direction === "n" || direction === "s") width = height * ratio;
    else height = width / ratio;

    event.context.newBounds = {
      width,
      height,
      x: direction.includes("w")
        ? right - width
        : direction === "n" || direction === "s"
          ? shape.x + (shape.width - width) / 2
          : shape.x,
      y: direction.includes("n")
        ? bottom - height
        : direction === "e" || direction === "w"
          ? shape.y + (shape.height - height) / 2
          : shape.y,
    };
  });

  eventBus.on("commandStack.shape.resize.preExecute", 2000, (event: any) => {
    if (!isBpmnImageElement(event.context.shape)) return;
    event.context.hints = { ...(event.context.hints || {}), autoResize: true };
  });
}
BpmnImageResize.$inject = ["eventBus"];

export const bpmnImageModule = {
  __init__: ["bpmnImageResize"],
  bpmnImageResize: ["type", BpmnImageResize],
};
