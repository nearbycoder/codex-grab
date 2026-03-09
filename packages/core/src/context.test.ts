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

  it("prefers the nearest non-internal app frame over CodexGrabProvider", async () => {
    const shellFiber = { return: null, type: { name: "CodexGrabDemoShell" } };
    const featureFiber = { return: shellFiber, type: { name: "FeatureCard" } };
    const element = document.createElement("div");

    mockGetFiberFromHostInstance.mockReturnValue(featureFiber);
    mockGetType.mockImplementation((type) => type);
    mockGetFiberId.mockReturnValue(42);
    mockGetDisplayName.mockImplementation((type) => type?.name ?? null);
    mockGetOwnerStack.mockResolvedValue([
      {
        functionName: "CodexGrabDemoShell",
        fileName: "http://127.0.0.1:5173/src/App.tsx",
        lineNumber: 4,
        columnNumber: 1
      },
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

  it("prefers an app frame over a react-router wrapper frame", async () => {
    const shellFiber = { return: null, type: { name: "CodexGrabDemoShell" } };
    const routeFiber = { return: shellFiber, type: { name: "RenderedRoute" } };
    const featureFiber = { return: routeFiber, type: { name: "FeatureCard" } };
    const element = document.createElement("article");

    mockGetFiberFromHostInstance.mockReturnValue(featureFiber);
    mockGetType.mockImplementation((type) => type);
    mockGetFiberId.mockReturnValue(7);
    mockGetDisplayName.mockImplementation((type) => type?.name ?? null);
    mockGetOwnerStack.mockResolvedValue([
      {
        functionName: "CodexGrabDemoShell",
        fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
        lineNumber: 12,
        columnNumber: 1
      },
      {
        functionName: "RenderedRoute",
        fileName: "../../../../node_modules/react-router/dist/development/chunk-LFPYN7LY.mjs",
        lineNumber: 412,
        columnNumber: 9
      },
      {
        functionName: "FeatureCard",
        fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
        lineNumber: 88,
        columnNumber: 5
      }
    ] satisfies GrabStackFrame[]);
    mockGetSource.mockResolvedValue({
      functionName: "RenderedRoute",
      fileName: "../../../../node_modules/react-router/dist/development/chunk-LFPYN7LY.mjs",
      lineNumber: 412,
      columnNumber: 9
    });
    mockGetDisplayNameFromSource.mockResolvedValue("RenderedRoute");

    const { getElementContext } = await import("./context.js");
    const context = await getElementContext(element);

    expect(context.componentName).toBe("FeatureCard");
    expect(context.source).toEqual({
      functionName: "FeatureCard",
      fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
      lineNumber: 88,
      columnNumber: 5
    });
  });

  it("uses the nearest composite fiber name when the owner stack points at the shell", async () => {
    const shellFiber = { return: null, type: { name: "CodexGrabDemoShell" } };
    const heroFiber = { return: shellFiber, type: { name: "LandingHeroCard" } };
    const element = document.createElement("section");

    mockGetFiberFromHostInstance.mockReturnValue(heroFiber);
    mockGetType.mockImplementation((type) => type);
    mockGetFiberId.mockReturnValue(99);
    mockGetDisplayName.mockImplementation((type) => type?.name ?? null);
    mockGetOwnerStack.mockResolvedValue([
      {
        functionName: "CodexGrabDemoShell",
        fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
        lineNumber: 200,
        columnNumber: 1
      }
    ] satisfies GrabStackFrame[]);
    mockGetSource.mockResolvedValue({
      functionName: "CodexGrabDemoShell",
      fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
      lineNumber: 200,
      columnNumber: 1
    });
    mockGetDisplayNameFromSource.mockResolvedValue("LandingHeroCard");

    const { getElementContext } = await import("./context.js");
    const context = await getElementContext(element);

    expect(context.componentName).toBe("LandingHeroCard");
    expect(context.source).toEqual({
      functionName: "CodexGrabDemoShell",
      fileName: "http://127.0.0.1:5173/src/demo-shell.tsx",
      lineNumber: 200,
      columnNumber: 1
    });
  });
});
