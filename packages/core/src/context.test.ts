import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GrabStackFrame } from "./types.js";

const mockGetFiberFromHostInstance = vi.fn();
const mockGetType = vi.fn();
const mockGetFiberId = vi.fn();
const mockGetDisplayName = vi.fn();
const mockGetOwnerStack = vi.fn();
const mockGetSource = vi.fn();
const mockGetDisplayNameFromSource = vi.fn();
const mockNormalizeFileName = vi.fn((fileName: string) => fileName);

vi.mock("bippy", () => ({
  getFiberFromHostInstance: mockGetFiberFromHostInstance,
  getType: mockGetType,
  getFiberId: mockGetFiberId,
  getDisplayName: mockGetDisplayName
}));

vi.mock("bippy/source", () => ({
  getOwnerStack: mockGetOwnerStack,
  getSource: mockGetSource,
  getDisplayNameFromSource: mockGetDisplayNameFromSource,
  normalizeFileName: mockNormalizeFileName
}));

describe("getElementContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prefers the first non-internal app frame over CodexGrabProvider", async () => {
    const fiber = { return: null, type: { name: "CodexGrabProvider" } };
    const element = document.createElement("div");

    mockGetFiberFromHostInstance.mockReturnValue(fiber);
    mockGetType.mockReturnValue(fiber.type);
    mockGetFiberId.mockReturnValue(42);
    mockGetDisplayName.mockReturnValue("CodexGrabProvider");
    mockGetOwnerStack.mockResolvedValue([
      {
        functionName: "FeatureCard",
        fileName: "http://127.0.0.1:5173/src/App.tsx",
        lineNumber: 11,
        columnNumber: 3
      },
      {
        functionName: "CodexGrabProvider",
        fileName: "http://127.0.0.1:5173/@fs/Users/nearby/Sites/codex-grab/packages/react/dist/context.js",
        lineNumber: 189,
        columnNumber: 3
      }
    ] satisfies GrabStackFrame[]);
    mockGetSource.mockResolvedValue({
      functionName: "CodexGrabProvider",
      fileName: "http://127.0.0.1:5173/@fs/Users/nearby/Sites/codex-grab/packages/react/dist/context.js",
      lineNumber: 189,
      columnNumber: 3
    });
    mockGetDisplayNameFromSource.mockResolvedValue("CodexGrabProvider");

    const { getElementContext } = await import("./context.js");
    const context = await getElementContext(element);

    expect(context.componentName).toBe("FeatureCard");
    expect(context.source).toEqual({
      functionName: "FeatureCard",
      fileName: "http://127.0.0.1:5173/src/App.tsx",
      lineNumber: 11,
      columnNumber: 3
    });
  });
});
