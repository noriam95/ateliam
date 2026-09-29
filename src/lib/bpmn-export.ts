/** Rasterizes the full active diagram with its rendered appearance, independently of pan/zoom. */
export async function exportBpmnPng(modeler: any): Promise<Blob> {
  await document.fonts.ready;
  const { svg } = await modeler.saveSVG();
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (parsed.querySelector("parsererror"))
    throw new Error("Não foi possível preparar a imagem do desenho.");
  const registry = modeler.get("elementRegistry");
  const properties = [
    "fill",
    "stroke",
    "stroke-width",
    "fill-opacity",
    "stroke-opacity",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "visibility",
    "display",
  ];
  for (const group of Array.from(root.querySelectorAll("[data-element-id]"))) {
    const live = registry.getGraphics(group.getAttribute("data-element-id"));
    if (!live) continue;
    const original = live.querySelector(".djs-visual");
    const copy = group.querySelector(".djs-visual");
    if (!original || !copy) continue;
    const sources = [original, ...original.querySelectorAll("*")];
    const targets = [copy, ...copy.querySelectorAll("*")];
    targets.forEach((node: any, i) => {
      if (!sources[i]) return;
      const computed = getComputedStyle(sources[i]);
      for (const property of properties)
        node.style.setProperty(property, computed.getPropertyValue(property));
    });
  }
  root
    .querySelectorAll(".djs-hit,.djs-outline,.djs-resizer,.djs-bendpoint")
    .forEach((node) => node.remove());
  root
    .querySelectorAll(".selected,.hover")
    .forEach((node) => node.classList.remove("selected", "hover"));
  const container = modeler.get("canvas").getContainer();
  if (container.closest('[data-appearance="mono"]'))
    root.setAttribute("style", "filter:grayscale(1)");
  const width = Number(root.getAttribute("width")),
    height = Number(root.getAttribute("height"));
  if (!(width > 0 && height > 0))
    throw new Error("O desenho está vazio ou possui dimensões inválidas.");
  // Two pixels per diagram unit, bounded to avoid browser canvas allocation failures.
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(32_000_000 / (width * height)));
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.ceil(width * scale));
  surface.height = Math.max(1, Math.ceil(height * scale));
  const context = surface.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu gerar a imagem PNG.");
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(root)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, surface.width, surface.height);
    context.drawImage(image, 0, 0, surface.width, surface.height);
    return await new Promise<Blob>((resolve, reject) =>
      surface.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Não foi possível gerar o PNG. Tente novamente.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
    surface.width = surface.height = 0;
  }
}
