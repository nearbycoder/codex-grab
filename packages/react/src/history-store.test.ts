import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodexGrabStore } from "./history-store.js";
import { installMockIndexedDb } from "./test-indexeddb.js";
import type { GrabTurnHistoryRecord } from "./history-types.js";
import type { GrabPersistedWidgetRecord } from "./widget-types.js";

const createRecord = (id: string, overrides: Partial<GrabTurnHistoryRecord> = {}): GrabTurnHistoryRecord => ({
  id,
  turnId: id,
  widgetId: "widget-1",
  sessionId: "session-1",
  threadId: "thread-1",
  createdAt: 100,
  updatedAt: 100,
  completedAt: null,
  bridgeUrl: "ws://127.0.0.1:4318",
  cwd: "/repo",
  bridgeVersion: "0.1.0",
  codexVersion: "0.108.0",
  selection: {
    componentName: "FeatureCard",
    selector: "#featurecard",
    htmlPreview: "<button />",
    stackString: "FeatureCard",
    stack: [],
    styles: "",
    source: {
      fileName: "/repo/src/App.tsx",
      lineNumber: 10,
      columnNumber: 3
    },
    fiberId: 1,
    isReactComponent: true
  },
  prompt: "Change it",
  model: "model-alpha",
  effort: "medium",
  status: "running",
  reasoningSummary: "",
  commandOutput: "",
  diff: "",
  plan: [],
  planExplanation: null,
  approvals: [],
  errorMessage: null,
  ...overrides
});

const createWidgetRecord = (
  id: string,
  overrides: Partial<GrabPersistedWidgetRecord> = {},
): GrabPersistedWidgetRecord => ({
  id,
  viewId: "route-a",
  createdAt: 100,
  updatedAt: 100,
  anchor: { top: 20, left: 40 },
  anchorMode: "element",
  serializedSelection: createRecord("turn-selection").selection,
  prompt: "Change widget",
  collapsed: true,
  includeScreenshot: false,
  isCapturingScreenshot: false,
  screenshotError: null,
  selectedModel: "model-alpha",
  selectedEffort: "medium",
  availableModels: [],
  connectionStatus: "connected",
  connectionError: null,
  turnStatus: "idle",
  activeThreadId: null,
  activeTurnId: null,
  bridgeSessionId: null,
  bridgeCwd: "/repo",
  bridgeVersion: "0.1.0",
  codexVersion: "0.108.0",
  historyEntryId: null,
  submittedAt: null,
  completedAt: null,
  reasoningSummary: "",
  commandOutput: "",
  diff: "",
  plan: [],
  planExplanation: null,
  pendingApproval: null,
  events: [],
  isSubmitting: false,
  ...overrides
});

describe("createCodexGrabStore", () => {
  beforeEach(() => {
    installMockIndexedDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates, updates, lists, and clears turn records", async () => {
    const store = createCodexGrabStore();

    await store.putTurn(createRecord("turn-1", { updatedAt: 100 }));
    await store.putTurn(createRecord("turn-2", { updatedAt: 200, status: "completed" }));

    await expect(store.listTurns()).resolves.toEqual([
      createRecord("turn-2", { updatedAt: 200, status: "completed" }),
      createRecord("turn-1", { updatedAt: 100 })
    ]);

    await store.deleteTurn("turn-1");
    await expect(store.listTurns()).resolves.toEqual([
      createRecord("turn-2", { updatedAt: 200, status: "completed" })
    ]);

    await store.clearTurns();
    await expect(store.listTurns()).resolves.toEqual([]);
  });

  it("fails cleanly when indexedDB is unavailable", async () => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined
    });

    const store = createCodexGrabStore();
    await expect(store.listTurns()).rejects.toThrow(/IndexedDB is unavailable/i);
  });

  it("creates, filters, deletes, and clears widget records", async () => {
    const store = createCodexGrabStore();

    await store.putWidget(createWidgetRecord("widget-1", { updatedAt: 100, viewId: "route-a" }));
    await store.putWidget(createWidgetRecord("widget-2", { updatedAt: 200, viewId: "route-b" }));

    await expect(store.listWidgets()).resolves.toEqual([
      createWidgetRecord("widget-2", { updatedAt: 200, viewId: "route-b" }),
      createWidgetRecord("widget-1", { updatedAt: 100, viewId: "route-a" })
    ]);

    await store.deleteWidget("widget-1");
    await expect(store.listWidgets()).resolves.toEqual([
      createWidgetRecord("widget-2", { updatedAt: 200, viewId: "route-b" })
    ]);

    await store.clearWidgets();
    await expect(store.listWidgets()).resolves.toEqual([]);
  });

  it("upgrades a history-only database to include widget storage", async () => {
    installMockIndexedDb({
      version: 1,
      stores: [
        {
          name: "turns",
          indexes: ["updatedAt", "status"],
          records: [createRecord("turn-legacy")]
        }
      ]
    });

    const store = createCodexGrabStore();
    await expect(store.listTurns()).resolves.toEqual([createRecord("turn-legacy")]);
    await store.putWidget(createWidgetRecord("widget-upgrade"));
    await expect(store.listWidgets()).resolves.toEqual([createWidgetRecord("widget-upgrade")]);
  });
});
