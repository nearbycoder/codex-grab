import {
  getDisplayName,
  getFiberFromHostInstance,
  getFiberId,
  getType,
  type Fiber
} from "bippy";
import {
  getDisplayNameFromSource,
  getOwnerStack,
  getSource,
  normalizeFileName
} from "bippy/source";
import type { GrabElementContext } from "./types.js";
import {
  createElementSelectorPath,
  extractElementCss,
  formatStackFrames,
  getHtmlPreview
} from "./utils.js";

const findCompositeFiber = (fiber: Fiber | null): Fiber | null => {
  let current = fiber;

  while (current) {
    const type = getType(current.type);
    if (type) {
      return current;
    }

    current = current.return;
  }

  return null;
};

const getComponentName = async (fiber: Fiber | null): Promise<string | null> => {
  if (!fiber) {
    return null;
  }

  const fromType = getDisplayName(getType(fiber.type));
  if (fromType) {
    return fromType;
  }

  return getDisplayNameFromSource(fiber).catch(() => null);
};

const INTERNAL_COMPONENT_NAMES = new Set(["CodexGrabProvider", "CodexGrabOverlay"]);

const isHostLikeName = (name: string | null | undefined): boolean =>
  Boolean(name && /^[a-z]/.test(name));

const isInternalFile = (fileName: string | null | undefined): boolean => {
  if (!fileName) {
    return false;
  }

  const normalized = normalizeFileName(fileName).toLowerCase();
  return (
    normalized.includes("/packages/react/src/") ||
    normalized.includes("/packages/react/dist/") ||
    normalized.includes("/packages/core/src/") ||
    normalized.includes("/packages/core/dist/") ||
    normalized.includes("@codex-grab/")
  );
};

const isInternalFrame = (functionName: string | null | undefined, fileName: string | null | undefined): boolean =>
  Boolean(
    (functionName && INTERNAL_COMPONENT_NAMES.has(functionName)) || isInternalFile(fileName),
  );

const pickPreferredFrame = (
  frames: GrabElementContext["stack"],
): GrabElementContext["source"] => {
  const preferred =
    frames.find(
      (frame) =>
        frame.functionName &&
        !isHostLikeName(frame.functionName) &&
        !isInternalFrame(frame.functionName, frame.fileName) &&
        frame.fileName,
    ) ??
    frames.find(
      (frame) =>
        frame.functionName &&
        !isHostLikeName(frame.functionName) &&
        !isInternalFrame(frame.functionName, frame.fileName),
    ) ??
    null;

  if (!preferred?.functionName) {
    return null;
  }

  return {
    functionName: preferred.functionName,
    fileName: preferred.fileName ?? "unknown",
    lineNumber: preferred.lineNumber,
    columnNumber: preferred.columnNumber
  };
};

export const getElementContext = async (
  element: Element,
): Promise<GrabElementContext> => {
  const hostFiber = getFiberFromHostInstance(element);
  const compositeFiber = findCompositeFiber(hostFiber);
  const stack = compositeFiber ? await getOwnerStack(compositeFiber).catch(() => []) : [];
  const fallbackSource = compositeFiber ? await getSource(compositeFiber).catch(() => null) : null;
  const fallbackComponentName = await getComponentName(compositeFiber);
  const preferredSource = pickPreferredFrame(stack);
  const source =
    preferredSource && !isInternalFrame(preferredSource.functionName, preferredSource.fileName)
      ? preferredSource
      : fallbackSource;
  const componentName =
    source?.functionName && !isInternalFrame(source.functionName, source.fileName)
      ? source.functionName
      : fallbackComponentName;

  return {
    element,
    componentName,
    selector: createElementSelectorPath(element),
    htmlPreview: getHtmlPreview(element),
    stackString: formatStackFrames(stack),
    stack,
    styles: extractElementCss(element),
    source,
    fiberId: compositeFiber ? getFiberId(compositeFiber) : null,
    isReactComponent: Boolean(compositeFiber)
  };
};
