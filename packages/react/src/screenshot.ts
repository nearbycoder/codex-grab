import type { GrabElementScreenshot } from "@codex-grab/core";

const MAX_RASTER_DIMENSION = 1200;

const isElementNode = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

const copyComputedStyles = (source: Element, clone: Element) => {
  const computed = window.getComputedStyle(source);
  const style = Array.from(computed)
    .map((name) => `${name}:${computed.getPropertyValue(name)};`)
    .join("");

  clone.setAttribute("style", style);

  if (clone instanceof SVGElement) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
};

const replaceWithPlaceholder = (clone: Element, label: string, width: number, height: number) => {
  const placeholder = document.createElement("div");
  placeholder.textContent = label;
  placeholder.setAttribute(
    "style",
    [
      "display:grid",
      "place-items:center",
      `width:${Math.max(24, Math.round(width))}px`,
      `height:${Math.max(24, Math.round(height))}px`,
      "box-sizing:border-box",
      "border:1px solid rgba(148,163,184,0.5)",
      "border-radius:10px",
      "background:rgba(15,23,42,0.06)",
      "color:rgb(71,85,105)",
      "font:500 12px/1.2 ui-sans-serif, system-ui, sans-serif",
      "text-align:center",
      "padding:8px"
    ].join(";"),
  );
  clone.replaceWith(placeholder);
};

const inlineTree = (source: Element, clone: Element) => {
  copyComputedStyles(source, clone);

  if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
    clone.textContent = source.value;
  } else if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.setAttribute("value", source.value);
    if (source.checked) {
      clone.setAttribute("checked", "true");
    } else {
      clone.removeAttribute("checked");
    }
  } else if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    Array.from(clone.options).forEach((option, index) => {
      option.selected = index === source.selectedIndex;
    });
  } else if (source instanceof HTMLCanvasElement) {
    replaceWithPlaceholder(clone, "Canvas", source.width || source.clientWidth, source.height || source.clientHeight);
    return;
  } else if (source instanceof HTMLVideoElement) {
    replaceWithPlaceholder(clone, "Video", source.clientWidth, source.clientHeight);
    return;
  }

  const sourceChildren = Array.from(source.childNodes);
  const cloneChildren = Array.from(clone.childNodes);

  for (let index = 0; index < sourceChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const cloneChild = cloneChildren[index];
    if (!sourceChild || !cloneChild || !isElementNode(sourceChild) || !isElementNode(cloneChild)) {
      continue;
    }

    inlineTree(sourceChild, cloneChild);
  }
};

const createSvgMarkup = (element: Element, width: number, height: number): string => {
  let clone = element.cloneNode(true) as Element;
  if (element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) {
    const placeholder = document.createElement("div");
    placeholder.textContent = element instanceof HTMLCanvasElement ? "Canvas" : "Video";
    placeholder.setAttribute(
      "style",
      [
        "display:grid",
        "place-items:center",
        `width:${Math.max(24, Math.round(width))}px`,
        `height:${Math.max(24, Math.round(height))}px`,
        "box-sizing:border-box",
        "border:1px solid rgba(148,163,184,0.5)",
        "border-radius:10px",
        "background:rgba(15,23,42,0.06)",
        "color:rgb(71,85,105)",
        "font:500 12px/1.2 ui-sans-serif, system-ui, sans-serif",
        "text-align:center",
        "padding:8px"
      ].join(";"),
    );
    clone = placeholder;
  } else {
    inlineTree(element, clone);
  }

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.setAttribute(
    "style",
    [
      "box-sizing:border-box",
      `width:${width}px`,
      `height:${height}px`,
      "overflow:hidden",
      "display:block"
    ].join(";"),
  );
  wrapper.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(wrapper);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<foreignObject width="100%" height="100%">${serialized}</foreignObject>`,
    "</svg>"
  ].join("");
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode captured DOM screenshot."));
    image.src = src;
  });

const rasterizeSvg = async (
  svgDataUrl: string,
  width: number,
  height: number,
): Promise<{ dataUrl: string; mimeType: string; scale: number }> => {
  if (typeof document === "undefined") {
    throw new Error("Document is unavailable for screenshot capture.");
  }

  const longestEdge = Math.max(width, height, 1);
  const deviceScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const scale = Math.min(2, deviceScale, MAX_RASTER_DIMENSION / longestEdge || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable for screenshot capture.");
  }

  const image = await loadImage(svgDataUrl);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    mimeType: "image/png",
    scale
  };
};

export const captureElementScreenshot = async (
  element: Element,
): Promise<GrabElementScreenshot> => {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));

  const svgMarkup = createSvgMarkup(element, width, height);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const capturedAt = Date.now();

  try {
    const rasterized = await rasterizeSvg(svgDataUrl, width, height);
    return {
      ...rasterized,
      width,
      height,
      capturedAt
    };
  } catch {
    return {
      dataUrl: svgDataUrl,
      mimeType: "image/svg+xml",
      width,
      height,
      scale: 1,
      capturedAt
    };
  }
};
