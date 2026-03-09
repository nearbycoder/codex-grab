import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import {
  createElementSelector,
  getElementContext,
  serializeElementContext,
  type ApprovalDecision,
  type ApprovalRequest,
  type BridgeClientMessage,
  type BridgeEvent,
  type CodexModelOption,
  type CodexReasoningEffort,
  type GrabElementContext,
  type PlanStep,
  type SelectionController,
  type SerializedGrabElementContext
} from "@codex-grab/core";
import { createCodexGrabStore, HistoryStorageUnavailableError } from "./history-store.js";
import type {
  GrabTurnHistoryApprovalRecord,
  GrabTurnHistoryRecord,
  GrabTurnHistoryStatus,
  GrabTurnHistoryStorageStatus
} from "./history-types.js";
import type {
  GrabPersistedWidgetRecord,
  GrabWidgetAnchorMode,
  GrabWidgetConnectionStatus,
  GrabWidgetTurnStatus
} from "./widget-types.js";
import { captureElementScreenshot } from "./screenshot.js";

type ConnectionStatus = GrabWidgetConnectionStatus;
type TurnStatus = GrabWidgetTurnStatus;

export interface CodexGrabProviderProps extends PropsWithChildren {
  bridgeUrl: string;
  token: string;
  enabled?: boolean;
  viewId?: string;
  persistWidgets?: boolean;
}

export interface GrabWidget {
  id: string;
  viewId: string;
  createdAt: number;
  updatedAt: number;
  anchor: {
    top: number;
    left: number;
  };
  anchorMode: GrabWidgetAnchorMode;
  selection: GrabElementContext | null;
  serializedSelection: SerializedGrabElementContext;
  isAttached: boolean;
  shouldResumeOnConnect: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  prompt: string;
  turnStatus: TurnStatus;
  activeThreadId: string | null;
  activeTurnId: string | null;
  bridgeSessionId: string | null;
  bridgeCwd: string | null;
  bridgeVersion: string | null;
  codexVersion: string | null;
  historyEntryId: string | null;
  submittedAt: number | null;
  completedAt: number | null;
  reasoningSummary: string;
  commandOutput: string;
  diff: string;
  isRevertingDiff: boolean;
  plan: PlanStep[];
  planExplanation: string | null;
  pendingApproval: ApprovalRequest | null;
  events: BridgeEvent[];
  collapsed: boolean;
  isSubmitting: boolean;
  includeScreenshot: boolean;
  isCapturingScreenshot: boolean;
  screenshotError: string | null;
  availableModels: CodexModelOption[];
  selectedModel: string | null;
  selectedEffort: CodexReasoningEffort | null;
}

export interface CodexGrabState {
  widgets: GrabWidget[];
  unsupportedMessage: string | null;
  history: GrabTurnHistoryRecord[];
  historyStatus: GrabTurnHistoryStorageStatus;
  historyError: string | null;
  isHistoryOpen: boolean;
  currentViewId: string;
}

export interface CodexGrabActions {
  startSelection(): void;
  cancelSelection(): void;
  removeWidget(widgetId: string): void;
  retryConnection(widgetId: string): void;
  updateAnchor(widgetId: string, anchor: { top: number; left: number }): void;
  updatePrompt(widgetId: string, prompt: string): void;
  updateModel(widgetId: string, model: string): void;
  updateEffort(widgetId: string, effort: CodexReasoningEffort): void;
  toggleScreenshot(widgetId: string): Promise<void>;
  refreshScreenshot(widgetId: string): Promise<void>;
  submitPrompt(widgetId: string): Promise<void>;
  approve(widgetId: string): void;
  decline(widgetId: string): void;
  interrupt(widgetId: string): void;
  toggleWidget(widgetId: string): void;
  setWidgetCollapsed(widgetId: string, collapsed: boolean): void;
  collapseAllWidgets(): void;
  clearHistory(): Promise<void>;
  removeHistoryEntry(historyId: string): Promise<void>;
  clearPersistedWidgets(): Promise<void>;
  openHistory(): void;
  closeHistory(): void;
}

export interface CodexGrabContextValue extends CodexGrabState, CodexGrabActions {
  isSelecting: boolean;
}

const CodexGrabContext = createContext<CodexGrabContextValue | null>(null);
const MAX_EVENTS = 200;
const MODEL_STORAGE_KEY = "codex-grab-selected-model";
const HISTORY_PENDING_PREFIX = "pending";
const RESUME_FAILURE_MESSAGE = "Previous running turn could not be resumed after refresh.";

const getModelForWidget = (
  widget: Pick<GrabWidget, "availableModels" | "selectedModel">,
): CodexModelOption | null =>
  widget.availableModels.find((model) => model.model === widget.selectedModel) ?? null;

const getDefaultModel = (models: CodexModelOption[], fallbackModel: string | null): string | null =>
  fallbackModel ?? models.find((model) => model.isDefault)?.model ?? models[0]?.model ?? null;

const getDefaultEffort = (
  models: CodexModelOption[],
  modelName: string | null,
  fallbackEffort: CodexReasoningEffort | null,
  fallbackModelName: string | null,
): CodexReasoningEffort | null => {
  if (fallbackEffort && modelName === fallbackModelName) {
    return fallbackEffort;
  }

  const model = models.find((candidate) => candidate.model === modelName);
  return model?.defaultReasoningEffort ?? null;
};

const readStoredModelPreference = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredModelPreference = (model: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (model) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
      return;
    }

    window.localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the in-memory state active.
  }
};

const getCurrentViewId = (): string => {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const getWidgetAnchor = (element: Element) => {
  const rect = element.getBoundingClientRect();
  const inset = 16;
  const panelWidth = Math.min(412, window.innerWidth - 32);
  const panelHeight = Math.min(560, window.innerHeight - 32);
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const preferredLeft = rect.right + scrollX + 12;
  const maxLeft = Math.max(scrollX + window.innerWidth - panelWidth - inset, scrollX + inset);
  const left =
    preferredLeft <= maxLeft
      ? preferredLeft
      : Math.max(rect.left + scrollX - panelWidth - 12, scrollX + inset);
  const top = Math.min(
    Math.max(rect.top + scrollY, scrollY + inset),
    Math.max(scrollY + window.innerHeight - panelHeight - inset, scrollY + inset),
  );

  return {
    top: Math.round(top),
    left: Math.round(left)
  };
};

const createWidgetState = (
  selection: GrabElementContext,
  viewId: string,
  preferredModel: string | null,
): GrabWidget => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  viewId,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  anchor: getWidgetAnchor(selection.element),
  anchorMode: "element",
  selection,
  serializedSelection: serializeElementContext(selection),
  isAttached: true,
  shouldResumeOnConnect: false,
  connectionStatus: "connecting",
  connectionError: null,
  prompt: "",
  turnStatus: "idle",
  activeThreadId: null,
  activeTurnId: null,
  bridgeSessionId: null,
  bridgeCwd: null,
  bridgeVersion: null,
  codexVersion: null,
  historyEntryId: null,
  submittedAt: null,
  completedAt: null,
  reasoningSummary: "",
  commandOutput: "",
  diff: "",
  isRevertingDiff: false,
  plan: [],
  planExplanation: null,
  pendingApproval: null,
  events: [],
  collapsed: true,
  isSubmitting: false,
  includeScreenshot: false,
  isCapturingScreenshot: false,
  screenshotError: null,
  availableModels: [],
  selectedModel: preferredModel,
  selectedEffort: null
});

const createRestoredWidgetState = (record: GrabPersistedWidgetRecord): GrabWidget => ({
  id: record.id,
  viewId: record.viewId,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  anchor: record.anchor,
  anchorMode: record.anchorMode,
  selection: null,
  serializedSelection: record.serializedSelection,
  isAttached: false,
  shouldResumeOnConnect: record.turnStatus === "running" && Boolean(record.bridgeSessionId),
  connectionStatus: record.connectionStatus,
  connectionError: record.connectionError,
  prompt: record.prompt,
  turnStatus: record.turnStatus,
  activeThreadId: record.activeThreadId,
  activeTurnId: record.activeTurnId,
  bridgeSessionId: record.bridgeSessionId,
  bridgeCwd: record.bridgeCwd,
  bridgeVersion: record.bridgeVersion,
  codexVersion: record.codexVersion,
  historyEntryId: record.historyEntryId,
  submittedAt: record.submittedAt,
  completedAt: record.completedAt,
  reasoningSummary: record.reasoningSummary,
  commandOutput: record.commandOutput,
  diff: record.diff,
  isRevertingDiff: false,
  plan: record.plan,
  planExplanation: record.planExplanation,
  pendingApproval: record.pendingApproval,
  events: record.events,
  collapsed: record.collapsed,
  isSubmitting: record.isSubmitting,
  includeScreenshot: record.includeScreenshot,
  isCapturingScreenshot: record.isCapturingScreenshot,
  screenshotError: record.screenshotError,
  availableModels: record.availableModels,
  selectedModel: record.selectedModel,
  selectedEffort: record.selectedEffort
});

const isTerminalTurnStatus = (
  status: TurnStatus,
): status is Exclude<TurnStatus, "idle" | "running"> =>
  status === "completed" || status === "failed" || status === "cancelled";

const summarizeHistoryApprovals = (events: BridgeEvent[]): GrabTurnHistoryApprovalRecord[] => {
  const approvals = new Map<string, GrabTurnHistoryApprovalRecord>();

  for (const event of events) {
    if (event.event === "approval.requested") {
      const existing = approvals.get(event.approval.requestId);
      approvals.set(event.approval.requestId, {
        requestId: event.approval.requestId,
        kind: event.approval.kind,
        reason: event.approval.reason ?? null,
        threadId: event.approval.threadId,
        turnId: event.approval.turnId,
        requestedAt: existing?.requestedAt ?? Date.now(),
        resolvedAt: existing?.resolvedAt ?? null,
        decision: existing?.decision ?? null
      });
      continue;
    }

    if (event.event === "approval.resolved") {
      const existing = approvals.get(event.requestId);
      if (!existing) {
        approvals.set(event.requestId, {
          requestId: event.requestId,
          kind: "fileChange",
          reason: null,
          threadId: event.threadId,
          requestedAt: Date.now(),
          resolvedAt: Date.now(),
          decision: event.decision ?? null
        });
        continue;
      }

      approvals.set(event.requestId, {
        ...existing,
        threadId: event.threadId ?? existing.threadId,
        resolvedAt: Date.now(),
        decision: event.decision ?? existing.decision
      });
    }
  }

  return Array.from(approvals.values()).sort((left, right) => left.requestedAt - right.requestedAt);
};

const createPendingHistoryEntryId = (widgetId: string): string =>
  `${HISTORY_PENDING_PREFIX}:${widgetId}:${Date.now()}`;

const buildHistoryRecord = (
  widget: GrabWidget,
  bridgeUrl: string,
): GrabTurnHistoryRecord | null => {
  if (!widget.historyEntryId || !widget.submittedAt) {
    return null;
  }

  const status: GrabTurnHistoryStatus =
    widget.turnStatus === "idle" ? "running" : widget.turnStatus === "running" ? "running" : widget.turnStatus;

  return {
    id: widget.historyEntryId,
    turnId: widget.activeTurnId,
    widgetId: widget.id,
    sessionId: widget.bridgeSessionId,
    threadId: widget.activeThreadId,
    createdAt: widget.submittedAt,
    updatedAt: Date.now(),
    completedAt: widget.completedAt,
    bridgeUrl,
    cwd: widget.bridgeCwd,
    bridgeVersion: widget.bridgeVersion,
    codexVersion: widget.codexVersion,
    selection: widget.serializedSelection,
    prompt: widget.prompt,
    model: widget.selectedModel,
    effort: widget.selectedEffort,
    status,
    reasoningSummary: widget.reasoningSummary,
    commandOutput: widget.commandOutput,
    diff: widget.diff,
    plan: widget.plan,
    planExplanation: widget.planExplanation,
    approvals: summarizeHistoryApprovals(widget.events),
    errorMessage: widget.turnStatus === "failed" ? widget.connectionError : null
  };
};

const createHistoryFingerprint = (record: GrabTurnHistoryRecord): string =>
  JSON.stringify({
    id: record.id,
    turnId: record.turnId,
    threadId: record.threadId,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    selection: record.selection,
    prompt: record.prompt,
    model: record.model,
    effort: record.effort,
    status: record.status,
    reasoningSummary: record.reasoningSummary,
    commandOutput: record.commandOutput,
    diff: record.diff,
    plan: record.plan,
    planExplanation: record.planExplanation,
    approvals: record.approvals,
    errorMessage: record.errorMessage,
    bridgeUrl: record.bridgeUrl,
    cwd: record.cwd,
    bridgeVersion: record.bridgeVersion,
    codexVersion: record.codexVersion,
    sessionId: record.sessionId
  });

const upsertHistoryRecord = (
  records: GrabTurnHistoryRecord[],
  record: GrabTurnHistoryRecord,
  previousId?: string | null,
): GrabTurnHistoryRecord[] => {
  const filtered = records.filter(
    (candidate) => candidate.id !== record.id && candidate.id !== previousId,
  );
  return [...filtered, record].sort((left, right) => right.updatedAt - left.updatedAt);
};

const normalizeSourceFileName = (fileName: string | null | undefined): string | null =>
  fileName ? fileName.split("?")[0] ?? fileName : null;

const doesSelectionMatch = (
  stored: SerializedGrabElementContext,
  resolved: GrabElementContext,
): boolean => {
  if (
    stored.componentName &&
    resolved.componentName &&
    stored.componentName !== resolved.componentName
  ) {
    return false;
  }

  const storedSource = normalizeSourceFileName(stored.source?.fileName);
  const resolvedSource = normalizeSourceFileName(resolved.source?.fileName);

  if (storedSource && resolvedSource && storedSource !== resolvedSource) {
    return false;
  }

  return true;
};

const buildPersistedWidgetRecord = (widget: GrabWidget): GrabPersistedWidgetRecord => ({
  id: widget.id,
  viewId: widget.viewId,
  createdAt: widget.createdAt,
  updatedAt: Date.now(),
  anchor: widget.anchor,
  anchorMode: widget.anchorMode,
  serializedSelection: widget.serializedSelection,
  prompt: widget.prompt,
  collapsed: widget.collapsed,
  includeScreenshot: widget.includeScreenshot,
  isCapturingScreenshot: widget.isCapturingScreenshot,
  screenshotError: widget.screenshotError,
  selectedModel: widget.selectedModel,
  selectedEffort: widget.selectedEffort,
  availableModels: widget.availableModels,
  connectionStatus: widget.connectionStatus,
  connectionError: widget.connectionError,
  turnStatus: widget.turnStatus,
  activeThreadId: widget.activeThreadId,
  activeTurnId: widget.activeTurnId,
  bridgeSessionId: widget.bridgeSessionId,
  bridgeCwd: widget.bridgeCwd,
  bridgeVersion: widget.bridgeVersion,
  codexVersion: widget.codexVersion,
  historyEntryId: widget.historyEntryId,
  submittedAt: widget.submittedAt,
  completedAt: widget.completedAt,
  reasoningSummary: widget.reasoningSummary,
  commandOutput: widget.commandOutput,
  diff: widget.diff,
  plan: widget.plan,
  planExplanation: widget.planExplanation,
  pendingApproval: widget.pendingApproval,
  events: widget.events,
  isSubmitting: widget.isSubmitting
});

const createWidgetPersistenceFingerprint = (record: GrabPersistedWidgetRecord): string =>
  JSON.stringify({
    viewId: record.viewId,
    anchor: record.anchor,
    anchorMode: record.anchorMode,
    serializedSelection: record.serializedSelection,
    prompt: record.prompt,
    collapsed: record.collapsed,
    includeScreenshot: record.includeScreenshot,
    isCapturingScreenshot: record.isCapturingScreenshot,
    screenshotError: record.screenshotError,
    selectedModel: record.selectedModel,
    selectedEffort: record.selectedEffort,
    availableModels: record.availableModels,
    connectionStatus: record.connectionStatus,
    connectionError: record.connectionError,
    turnStatus: record.turnStatus,
    activeThreadId: record.activeThreadId,
    activeTurnId: record.activeTurnId,
    bridgeSessionId: record.bridgeSessionId,
    bridgeCwd: record.bridgeCwd,
    bridgeVersion: record.bridgeVersion,
    codexVersion: record.codexVersion,
    historyEntryId: record.historyEntryId,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt,
    reasoningSummary: record.reasoningSummary,
    commandOutput: record.commandOutput,
    diff: record.diff,
    plan: record.plan,
    planExplanation: record.planExplanation,
    pendingApproval: record.pendingApproval,
    events: record.events,
    isSubmitting: record.isSubmitting
  });

const upsertWidgetRecord = (
  records: GrabPersistedWidgetRecord[],
  record: GrabPersistedWidgetRecord,
): GrabPersistedWidgetRecord[] =>
  [...records.filter((candidate) => candidate.id !== record.id), record].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );

const mapBridgeEvent = (widget: GrabWidget, event: BridgeEvent): GrabWidget => {
  const events = [...widget.events, event].slice(-MAX_EVENTS);
  const updatedAt = Date.now();

  switch (event.event) {
    case "session.started":
      {
        const selectedModel = getDefaultModel(event.models, widget.selectedModel ?? event.defaultModel);
        const model = event.models.find((candidate) => candidate.model === selectedModel) ?? null;
        const supportedEfforts = model?.supportedReasoningEfforts.map((effort) => effort.effort) ?? [];
        const selectedEffort =
          widget.selectedEffort && supportedEfforts.includes(widget.selectedEffort)
            ? widget.selectedEffort
            : getDefaultEffort(event.models, selectedModel, event.defaultEffort, event.defaultModel);

        return {
          ...widget,
          connectionStatus: "connected",
          connectionError:
            widget.shouldResumeOnConnect && !event.resumed && widget.turnStatus === "running"
              ? RESUME_FAILURE_MESSAGE
              : null,
          bridgeSessionId: event.sessionId,
          bridgeCwd: event.cwd,
          bridgeVersion: event.bridgeVersion,
          codexVersion: event.codexVersion,
          turnStatus:
            widget.shouldResumeOnConnect && !event.resumed && widget.turnStatus === "running"
              ? "failed"
              : widget.turnStatus,
          completedAt:
            widget.shouldResumeOnConnect && !event.resumed && widget.turnStatus === "running"
              ? widget.completedAt ?? updatedAt
              : widget.completedAt,
          availableModels: event.models,
          selectedModel,
          selectedEffort,
          shouldResumeOnConnect: false,
          updatedAt,
          events
        };
      }
    case "selection.accepted":
      return {
        ...widget,
        serializedSelection: event.selection,
        updatedAt,
        events
      };
    case "turn.started":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        historyEntryId: event.turnId,
        serializedSelection: event.selection,
        turnStatus: "running",
        isSubmitting: false,
        shouldResumeOnConnect: false,
        reasoningSummary: "",
        commandOutput: "",
        diff: "",
        plan: [],
        planExplanation: null,
        pendingApproval: null,
        updatedAt,
        events
      };
    case "reasoning.summary.delta":
      return {
        ...widget,
        reasoningSummary: `${widget.reasoningSummary}${event.delta}`,
        updatedAt,
        events
      };
    case "plan.updated":
      return {
        ...widget,
        plan: event.plan,
        planExplanation: event.explanation,
        updatedAt,
        events
      };
    case "command.output.delta":
      return {
        ...widget,
        commandOutput: `${widget.commandOutput}${event.delta}`,
        updatedAt,
        events
      };
    case "diff.updated":
      return {
        ...widget,
        diff: event.diff,
        updatedAt,
        events
      };
    case "diff.reverted":
      return {
        ...widget,
        diff: "",
        isRevertingDiff: false,
        commandOutput: `${widget.commandOutput}${widget.commandOutput ? "\n" : ""}${event.message}`,
        updatedAt,
        events
      };
    case "diff.revert.failed":
      return {
        ...widget,
        isRevertingDiff: false,
        commandOutput: `${widget.commandOutput}${widget.commandOutput ? "\n" : ""}${event.message}`,
        connectionError: event.message,
        updatedAt,
        events
      };
    case "approval.requested":
      return {
        ...widget,
        pendingApproval: event.approval,
        updatedAt,
        events
      };
    case "approval.resolved":
      return {
        ...widget,
        pendingApproval:
          widget.pendingApproval?.requestId === event.requestId ? null : widget.pendingApproval,
        updatedAt,
        events
      };
    case "turn.completed":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "completed",
        isSubmitting: false,
        completedAt: widget.completedAt ?? Date.now(),
        pendingApproval: null,
        updatedAt,
        events
      };
    case "turn.failed":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "failed",
        isSubmitting: false,
        completedAt: widget.completedAt ?? Date.now(),
        connectionError: event.message,
        pendingApproval: null,
        updatedAt,
        events
      };
    case "turn.cancelled":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "cancelled",
        isSubmitting: false,
        completedAt: widget.completedAt ?? Date.now(),
        pendingApproval: null,
        updatedAt,
        events
      };
  }
};

export const CodexGrabProvider = ({
  bridgeUrl,
  token,
  enabled = true,
  viewId,
  persistWidgets = enabled,
  children
}: CodexGrabProviderProps) => {
  const currentViewId = viewId ?? getCurrentViewId();
  const [allWidgets, setAllWidgets] = useState<GrabWidget[]>([]);
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [history, setHistory] = useState<GrabTurnHistoryRecord[]>([]);
  const [historyStatus, setHistoryStatus] = useState<GrabTurnHistoryStorageStatus>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const socketsRef = useRef(new Map<string, WebSocket>());
  const selectorRef = useRef<SelectionController | null>(null);
  const preferredModelRef = useRef<string | null>(readStoredModelPreference());
  const storeRef = useRef<ReturnType<typeof createCodexGrabStore> | null>(null);
  const storeWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const previousHistorySnapshotRef = useRef(
    new Map<string, { historyEntryId: string; fingerprint: string }>(),
  );
  const previousWidgetSnapshotRef = useRef(new Map<string, string>());
  const previousViewIdRef = useRef(currentViewId);
  const currentViewIdRef = useRef(currentViewId);

  currentViewIdRef.current = currentViewId;

  const getStore = useEffectEvent(() => {
    if (!storeRef.current) {
      storeRef.current = createCodexGrabStore();
    }

    return storeRef.current;
  });

  const queueStoreWrite = useEffectEvent((writer: () => Promise<void>) => {
    storeWriteChainRef.current = storeWriteChainRef.current
      .catch(() => undefined)
      .then(writer)
      .catch((error) => {
        setHistoryError(error instanceof Error ? error.message : "Failed to persist codex-grab state.");
      });
  });

  const updateWidgets = useEffectEvent((updater: (prev: GrabWidget[]) => GrabWidget[]) => {
    startTransition(() => {
      setAllWidgets(updater);
    });
  });

  const updateWidget = useEffectEvent((widgetId: string, updater: (widget: GrabWidget) => GrabWidget) => {
    updateWidgets((prev) =>
      prev.map((widget) => (widget.id === widgetId ? updater(widget) : widget)),
    );
  });

  const closeWidgetSocket = useEffectEvent((widgetId: string) => {
    socketsRef.current.get(widgetId)?.close();
    socketsRef.current.delete(widgetId);
  });

  const sendMessage = useEffectEvent((widgetId: string, message: BridgeClientMessage) => {
    const socket = socketsRef.current.get(widgetId);
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  });

  const connectWidget = useEffectEvent((widgetId: string, resumeSessionId?: string | null) => {
    const existing = socketsRef.current.get(widgetId);
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const socket = new WebSocket(bridgeUrl);
    socketsRef.current.set(widgetId, socket);

    socket.addEventListener("open", () => {
      sendMessage(widgetId, {
        type: "session.ping",
        token,
        ...(resumeSessionId ? { resumeSessionId } : {})
      });
    });

    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data)) as BridgeEvent;
        updateWidget(widgetId, (widget) => mapBridgeEvent(widget, event));
      } catch (error) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          connectionStatus: "error",
          connectionError:
            error instanceof Error ? error.message : "Failed to decode bridge event."
        }));
      }
    });

    socket.addEventListener("close", () => {
      socketsRef.current.delete(widgetId);
      updateWidget(widgetId, (widget) => ({
        ...widget,
        connectionStatus: "error",
        connectionError: widget.connectionError ?? "Bridge connection closed.",
        updatedAt: Date.now()
      }));
    });

    socket.addEventListener("error", () => {
      updateWidget(widgetId, (widget) => ({
        ...widget,
        connectionStatus: "error",
        connectionError: "Bridge connection failed.",
        updatedAt: Date.now()
      }));
    });
  });

  const captureWidgetScreenshot = useEffectEvent(async (widgetId: string) => {
    const widget = allWidgets.find((candidate) => candidate.id === widgetId);
    if (!widget) {
      return null;
    }

    const fallbackScreenshot = widget.serializedSelection.screenshot ?? null;
    if (!widget.selection) {
      updateWidget(widgetId, (current) => ({
        ...current,
        isCapturingScreenshot: false,
        screenshotError: fallbackScreenshot
          ? current.screenshotError
          : "Widget target is unavailable for screenshot capture.",
        includeScreenshot: Boolean(fallbackScreenshot),
        updatedAt: Date.now()
      }));
      return fallbackScreenshot;
    }

    updateWidget(widgetId, (current) => ({
      ...current,
      isCapturingScreenshot: true,
      screenshotError: null,
      updatedAt: Date.now()
    }));

    try {
      const screenshot = await captureElementScreenshot(widget.selection.element);
      updateWidget(widgetId, (current) => ({
        ...current,
        includeScreenshot: true,
        isCapturingScreenshot: false,
        screenshotError: null,
        serializedSelection: {
          ...current.serializedSelection,
          screenshot
        },
        updatedAt: Date.now()
      }));
      return screenshot;
    } catch (error) {
      const screenshotError = getErrorMessage(error, "Failed to capture the selected UI screenshot.");
      updateWidget(widgetId, (current) => ({
        ...current,
        includeScreenshot: Boolean(current.serializedSelection.screenshot),
        isCapturingScreenshot: false,
        screenshotError,
        updatedAt: Date.now()
      }));
      return fallbackScreenshot;
    }
  });

  const ensureSelector = useEffectEvent(() => {
    if (selectorRef.current) {
      return selectorRef.current;
    }

    selectorRef.current = createElementSelector({
      onSelect: async (selection) => {
        setIsSelecting(false);
        setUnsupportedMessage(null);

        const widget = createWidgetState(selection, currentViewIdRef.current, preferredModelRef.current);
        updateWidgets((prev) => [...prev, widget]);
        connectWidget(widget.id);
      },
      onUnsupported: () => {
        setIsSelecting(false);
        setUnsupportedMessage("Selected DOM node is not owned by a React component.");
      },
      onCancel: () => {
        setIsSelecting(false);
      }
    });

    return selectorRef.current;
  });

  useEffect(() => {
    if (!enabled) {
      for (const socket of socketsRef.current.values()) {
        socket.close();
      }
      socketsRef.current.clear();
      setAllWidgets([]);
      setHistory([]);
      setHistoryStatus("idle");
      setHistoryError(null);
      return;
    }

    return () => {
      selectorRef.current?.destroy();
      selectorRef.current = null;
      for (const socket of socketsRef.current.values()) {
        socket.close();
      }
      socketsRef.current.clear();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const store = storeRef.current ?? (storeRef.current = createCodexGrabStore());
    setHistoryStatus("loading");
    setHistoryError(null);

    Promise.all([
      store.listTurns(),
      persistWidgets ? store.listWidgets() : Promise.resolve([])
    ])
      .then(([turns, widgetRecords]) => {
        if (cancelled) {
          return;
        }

        setHistory((current) => {
          if (!current.length) {
            return turns;
          }

          return [...current, ...turns]
            .filter(
              (record, index, records) =>
                records.findIndex((candidate) => candidate.id === record.id) === index,
            )
            .sort((left, right) => right.updatedAt - left.updatedAt);
        });
        setAllWidgets((current) => {
          const restoredWidgets = widgetRecords.map((record) => createRestoredWidgetState(record));
          if (!current.length) {
            return restoredWidgets;
          }

          return [
            ...current,
            ...restoredWidgets.filter(
              (candidate) => !current.some((widget) => widget.id === candidate.id),
            )
          ].sort((left, right) => left.createdAt - right.createdAt);
        });
        setHistoryStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setHistory([]);
        setHistoryStatus("error");
        setHistoryError(
          error instanceof HistoryStorageUnavailableError
            ? "History is unavailable in this browser."
            : error instanceof Error
              ? error.message
              : "Failed to load history.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, persistWidgets]);

  useEffect(() => {
    if (!enabled || historyStatus === "error") {
      return;
    }

    const nextSnapshots = new Map<string, { historyEntryId: string; fingerprint: string }>();

    for (const widget of allWidgets) {
      const record = buildHistoryRecord(widget, bridgeUrl);
      if (!record) {
        continue;
      }

      const fingerprint = createHistoryFingerprint(record);
      const previous = previousHistorySnapshotRef.current.get(widget.id);
      nextSnapshots.set(widget.id, { historyEntryId: record.id, fingerprint });

      if (previous?.historyEntryId === record.id && previous.fingerprint === fingerprint) {
        continue;
      }

      setHistory((current) => upsertHistoryRecord(current, record, previous?.historyEntryId));
      setHistoryStatus((current) => (current === "idle" ? "ready" : current));

      queueStoreWrite(async () => {
        const store = getStore();
        await store.putTurn(record);
        if (previous?.historyEntryId && previous.historyEntryId !== record.id) {
          await store.deleteTurn(previous.historyEntryId);
        }
      });
    }

    previousHistorySnapshotRef.current = nextSnapshots;
  }, [allWidgets, bridgeUrl, enabled, getStore, historyStatus, queueStoreWrite]);

  useEffect(() => {
    if (!enabled || !persistWidgets) {
      return;
    }

    for (const widget of allWidgets) {
      const record = buildPersistedWidgetRecord(widget);
      const fingerprint = createWidgetPersistenceFingerprint(record);
      if (previousWidgetSnapshotRef.current.get(widget.id) === fingerprint) {
        continue;
      }

      previousWidgetSnapshotRef.current.set(widget.id, fingerprint);
      queueStoreWrite(async () => {
        await getStore().putWidget(record);
      });
    }
  }, [allWidgets, enabled, getStore, persistWidgets, queueStoreWrite]);

  useEffect(() => {
    if (previousViewIdRef.current === currentViewId) {
      return;
    }

    previousViewIdRef.current = currentViewId;
    selectorRef.current?.destroy();
    selectorRef.current = null;
    setIsSelecting(false);
    updateWidgets((prev) =>
      prev.map((widget) =>
        widget.viewId === currentViewId
          ? widget
          : {
              ...widget,
              selection: null,
              isAttached: false,
              updatedAt: Date.now()
            },
      ),
    );
  }, [currentViewId, updateWidgets]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    for (const widget of allWidgets) {
      const socket = socketsRef.current.get(widget.id);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        continue;
      }

      if (widget.shouldResumeOnConnect && widget.bridgeSessionId) {
        connectWidget(widget.id, widget.bridgeSessionId);
        continue;
      }

      if (
        widget.viewId === currentViewId &&
        widget.isAttached &&
        widget.connectionStatus === "connecting"
      ) {
        connectWidget(widget.id);
      }
    }
  }, [allWidgets, connectWidget, currentViewId, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let observer: MutationObserver | null = null;

    const attachWidgets = async () => {
      const candidates = allWidgets.filter(
        (widget) => widget.viewId === currentViewId && !widget.isAttached,
      );
      if (!candidates.length) {
        return;
      }

      for (const widget of candidates) {
        if (!widget.serializedSelection.selector) {
          continue;
        }

        let target: Element | null = null;
        try {
          target = document.querySelector(widget.serializedSelection.selector);
        } catch {
          target = null;
        }

        if (!target) {
          continue;
        }

        const resolved = await getElementContext(target).catch(() => null);
        if (!resolved || !resolved.isReactComponent || !doesSelectionMatch(widget.serializedSelection, resolved)) {
          continue;
        }

        if (cancelled) {
          return;
        }

        updateWidget(widget.id, (current) => ({
          ...current,
          selection: resolved,
          serializedSelection: serializeElementContext(resolved),
          isAttached: true,
          anchor:
            current.anchorMode === "element" ? getWidgetAnchor(resolved.element) : current.anchor,
          updatedAt: Date.now()
        }));
      }
    };

    void attachWidgets();

    if (allWidgets.some((widget) => widget.viewId === currentViewId && !widget.isAttached)) {
      observer = new MutationObserver(() => {
        if (frame) {
          window.cancelAnimationFrame(frame);
        }
        frame = window.requestAnimationFrame(() => {
          void attachWidgets();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
    };
  }, [allWidgets, currentViewId, enabled, updateWidget]);

  const widgets = useMemo(
    () => allWidgets.filter((widget) => widget.viewId === currentViewId && widget.isAttached),
    [allWidgets, currentViewId],
  );

  const value = useMemo<CodexGrabContextValue>(
    () => ({
      widgets,
      unsupportedMessage,
      history,
      historyStatus,
      historyError,
      isHistoryOpen,
      currentViewId,
      isSelecting,
      startSelection() {
        if (!enabled) {
          return;
        }
        ensureSelector().start();
        setIsSelecting(true);
      },
      cancelSelection() {
        selectorRef.current?.stop();
        setIsSelecting(false);
      },
      removeWidget(widgetId: string) {
        closeWidgetSocket(widgetId);
        previousWidgetSnapshotRef.current.delete(widgetId);
        updateWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
        if (persistWidgets) {
          queueStoreWrite(async () => {
            await getStore().deleteWidget(widgetId);
          });
        }
      },
      retryConnection(widgetId: string) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          connectionStatus: "connecting",
          connectionError: null,
          shouldResumeOnConnect:
            widget.turnStatus === "running" && Boolean(widget.bridgeSessionId),
          updatedAt: Date.now()
        }));
      },
      updateAnchor(widgetId: string, anchor: { top: number; left: number }) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          anchor,
          anchorMode: "manual",
          updatedAt: Date.now()
        }));
      },
      updatePrompt(widgetId: string, prompt: string) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          prompt,
          updatedAt: Date.now()
        }));
      },
      updateModel(widgetId: string, model: string) {
        updateWidget(widgetId, (widget) => {
          const selectedModel =
            widget.availableModels.find((candidate) => candidate.model === model)?.model ?? null;
          const nextModel =
            selectedModel ?? getDefaultModel(widget.availableModels, widget.selectedModel);
          const nextDefinition =
            widget.availableModels.find((candidate) => candidate.model === nextModel) ?? null;
          const supportedEfforts =
            nextDefinition?.supportedReasoningEfforts.map((effort) => effort.effort) ?? [];
          const selectedEffort =
            widget.selectedEffort && supportedEfforts.includes(widget.selectedEffort)
              ? widget.selectedEffort
              : nextDefinition?.defaultReasoningEffort ?? null;

          preferredModelRef.current = nextModel;
          writeStoredModelPreference(nextModel);

          return {
            ...widget,
            selectedModel: nextModel,
            selectedEffort,
            updatedAt: Date.now()
          };
        });
      },
      updateEffort(widgetId: string, effort: CodexReasoningEffort) {
        updateWidget(widgetId, (widget) => {
          const model = getModelForWidget(widget);
          if (!model) {
            return widget;
          }

          const supportedEfforts = model.supportedReasoningEfforts.map((option) => option.effort);
          if (!supportedEfforts.includes(effort)) {
            return widget;
          }

          return {
            ...widget,
            selectedEffort: effort,
            updatedAt: Date.now()
          };
        });
      },
      async toggleScreenshot(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (!widget || widget.isCapturingScreenshot) {
          return;
        }

        if (widget.includeScreenshot) {
          updateWidget(widgetId, (current) => ({
            ...current,
            includeScreenshot: false,
            isCapturingScreenshot: false,
            screenshotError: null,
            serializedSelection: {
              ...current.serializedSelection,
              screenshot: null
            },
            updatedAt: Date.now()
          }));
          return;
        }

        await captureWidgetScreenshot(widgetId);
      },
      async refreshScreenshot(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (!widget || widget.isCapturingScreenshot) {
          return;
        }

        await captureWidgetScreenshot(widgetId);
      },
      async submitPrompt(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (
          !widget ||
          widget.connectionStatus !== "connected" ||
          !widget.prompt.trim() ||
          widget.isCapturingScreenshot
        ) {
          return;
        }

        const screenshot = widget.includeScreenshot
          ? await captureWidgetScreenshot(widgetId)
          : null;

        if (widget.includeScreenshot && !screenshot) {
          return;
        }

        const selection: SerializedGrabElementContext = {
          ...widget.serializedSelection,
          screenshot
        };

        updateWidget(widgetId, (current) => ({
          ...current,
          serializedSelection: selection,
          screenshotError: null,
          collapsed: true,
          isSubmitting: true,
          historyEntryId: current.historyEntryId ?? createPendingHistoryEntryId(current.id),
          submittedAt: current.submittedAt ?? Date.now(),
          completedAt: null,
          updatedAt: Date.now()
        }));

        sendMessage(widgetId, {
          type: "select.submitPrompt",
          prompt: widget.prompt,
          selection,
          preferences: {
            model: widget.selectedModel,
            effort: widget.selectedEffort
          }
        });
      },
      approve(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (!widget?.pendingApproval) {
          return;
        }

        const decision: ApprovalDecision =
          widget.pendingApproval.kind === "applyPatch" ? "approved" : "accept";

        sendMessage(widgetId, {
          type: "approval.respond",
          requestId: widget.pendingApproval.requestId,
          decision
        });
      },
      decline(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (!widget?.pendingApproval) {
          return;
        }

        const decision: ApprovalDecision =
          widget.pendingApproval.kind === "applyPatch" ? "denied" : "decline";

        sendMessage(widgetId, {
          type: "approval.respond",
          requestId: widget.pendingApproval.requestId,
          decision
        });
      },
      interrupt(widgetId: string) {
        const widget = allWidgets.find((candidate) => candidate.id === widgetId);
        if (!widget?.activeThreadId || !widget.activeTurnId) {
          return;
        }

        sendMessage(widgetId, {
          type: "turn.interrupt",
          threadId: widget.activeThreadId,
          turnId: widget.activeTurnId
        });
      },
      toggleWidget(widgetId: string) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          collapsed: !widget.collapsed,
          updatedAt: Date.now()
        }));
      },
      setWidgetCollapsed(widgetId: string, collapsed: boolean) {
        updateWidget(widgetId, (widget) =>
          widget.collapsed === collapsed
            ? widget
            : {
                ...widget,
                collapsed,
                updatedAt: Date.now()
              },
        );
      },
      collapseAllWidgets() {
        updateWidgets((prev) =>
          prev.map((widget) =>
            widget.collapsed
              ? widget
              : {
                  ...widget,
                  collapsed: true,
                  updatedAt: Date.now()
                },
          ),
        );
      },
      async clearHistory() {
        setAllWidgets((prev) =>
          prev.map((widget) => ({
            ...widget,
            historyEntryId: null
          })),
        );
        setHistory([]);
        setHistoryError(null);
        setHistoryStatus("ready");
        previousHistorySnapshotRef.current = new Map();

        try {
          await getStore().clearTurns();
        } catch (error) {
          setHistoryStatus("error");
          setHistoryError(error instanceof Error ? error.message : "Failed to clear history.");
        }
      },
      async removeHistoryEntry(historyId: string) {
        let removedWidgetIds: string[] = [];

        setAllWidgets((prev) =>
          prev.map((widget) => {
            if (widget.historyEntryId !== historyId) {
              return widget;
            }

            removedWidgetIds = [...removedWidgetIds, widget.id];
            return {
              ...widget,
              historyEntryId: null
            };
          }),
        );

        setHistory((prev) => prev.filter((record) => record.id !== historyId));
        setHistoryError(null);
        setHistoryStatus((current) => (current === "idle" ? "ready" : current));

        previousHistorySnapshotRef.current = new Map(
          Array.from(previousHistorySnapshotRef.current.entries()).filter(
            ([widgetId, snapshot]) =>
              snapshot.historyEntryId !== historyId && !removedWidgetIds.includes(widgetId),
          ),
        );

        try {
          await getStore().deleteTurn(historyId);
        } catch (error) {
          setHistoryStatus("error");
          setHistoryError(error instanceof Error ? error.message : "Failed to remove history entry.");
        }
      },
      async clearPersistedWidgets() {
        for (const socket of socketsRef.current.values()) {
          socket.close();
        }
        socketsRef.current.clear();
        previousWidgetSnapshotRef.current = new Map();
        setAllWidgets([]);

        if (!persistWidgets) {
          return;
        }

        try {
          await getStore().clearWidgets();
        } catch (error) {
          setHistoryError(
            error instanceof Error ? error.message : "Failed to clear saved widgets.",
          );
        }
      },
      openHistory() {
        setIsHistoryOpen(true);
      },
      closeHistory() {
        setIsHistoryOpen(false);
      }
    }),
    [
      closeWidgetSocket,
      connectWidget,
      currentViewId,
      enabled,
      ensureSelector,
      getStore,
      history,
      historyError,
      historyStatus,
      isHistoryOpen,
      isSelecting,
      persistWidgets,
      queueStoreWrite,
      sendMessage,
      unsupportedMessage,
      updateWidget,
      updateWidgets,
      allWidgets,
      widgets
    ],
  );

  return (
    <CodexGrabContext.Provider value={value}>{children}</CodexGrabContext.Provider>
  );
};

export const useCodexGrab = (): CodexGrabContextValue => {
  const value = useContext(CodexGrabContext);
  if (!value) {
    throw new Error("useCodexGrab must be used within <CodexGrabProvider />.");
  }

  return value;
};
