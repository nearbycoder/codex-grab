import type { SerializedGrabElementContext } from "@codex-grab/core";

export const buildPrompt = (
  userPrompt: string,
  selection: SerializedGrabElementContext,
): string => {
  const location = selection.source
    ? `${selection.source.fileName}:${selection.source.lineNumber ?? "?"}:${selection.source.columnNumber ?? "?"}`
    : "unknown";

  return [
    "You are editing a React component selected from a running development app.",
    "Make the requested code changes in the local workspace.",
    "Use the selected component context below to find the right files quickly.",
    "Keep your reasoning summary concise for streaming in a browser panel.",
    "",
    "User request:",
    userPrompt.trim(),
    "",
    "Selected component context:",
    `- Component: ${selection.componentName ?? "Unknown"}`,
    `- Selector: ${selection.selector ?? "Unknown"}`,
    `- Source: ${location}`,
    `- React-owned: ${selection.isReactComponent ? "yes" : "no"}`,
    `- Screenshot attached: ${selection.screenshot ? "yes" : "no"}`,
    ...(selection.screenshot
      ? [
          `- Screenshot type: ${selection.screenshot.mimeType}`,
          `- Screenshot size: ${selection.screenshot.width}x${selection.screenshot.height}`
        ]
      : []),
    "",
    "Owner stack:",
    selection.stackString,
    "",
    "HTML preview:",
    selection.htmlPreview,
    "",
    "Computed styles snapshot:",
    selection.styles
  ].join("\n");
};
