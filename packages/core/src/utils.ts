import type {
  GrabElementContext,
  GrabStackFrame,
  SerializedGrabElementContext
} from "./types.js";

export const createElementSelectorPath = (element: Element): string | null => {
  if (!(element instanceof Element)) {
    return null;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const id = current.getAttribute("id");
    if (id) {
      parts.unshift(`#${CSS.escape(id)}`);
      break;
    }

    const tag = current.tagName.toLowerCase();
    const classes = Array.from(current.classList)
      .slice(0, 2)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");

    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current?.tagName,
        )
      : [];
    const nth =
      siblings.length > 1
        ? `:nth-of-type(${siblings.indexOf(current) + 1})`
        : "";

    parts.unshift(`${tag}${classes}${nth}`);
    current = current.parentElement;
  }

  return parts.join(" > ");
};

export const extractElementCss = (element: Element): string => {
  const style = window.getComputedStyle(element);
  const rules: string[] = [];

  for (const name of Array.from(style)) {
    rules.push(`${name}: ${style.getPropertyValue(name)};`);
  }

  return rules.join("\n");
};

export const getHtmlPreview = (element: Element): string => {
  const html = element.outerHTML.replace(/\s+/g, " ").trim();
  return html.length > 1_500 ? `${html.slice(0, 1_500)}…` : html;
};

export const formatStackFrames = (frames: GrabStackFrame[]): string => {
  if (!frames.length) {
    return "No owner stack available.";
  }

  return frames
    .map((frame) => {
      const name = frame.functionName ?? "Anonymous";
      const file = frame.fileName ?? frame.source ?? "unknown";
      const line = frame.lineNumber ? `:${frame.lineNumber}` : "";
      const column = frame.columnNumber ? `:${frame.columnNumber}` : "";
      return `${name} (${file}${line}${column})`;
    })
    .join("\n");
};

export const serializeElementContext = (
  context: GrabElementContext,
): SerializedGrabElementContext => ({
  componentName: context.componentName,
  selector: context.selector,
  htmlPreview: context.htmlPreview,
  stackString: context.stackString,
  stack: context.stack,
  styles: context.styles,
  source: context.source,
  screenshot: context.screenshot ?? null,
  fiberId: context.fiberId,
  isReactComponent: context.isReactComponent
});
