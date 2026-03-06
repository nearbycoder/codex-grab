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

type ConnectionStatus = "connecting" | "connected" | "error";
type TurnStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface CodexGrabProviderProps extends PropsWithChildren {
  bridgeUrl: string;
  token: string;
  enabled?: boolean;
}

export interface GrabWidget {
  id: string;
  anchor: {
    top: number;
    left: number;
  };
  selection: GrabElementContext;
  serializedSelection: SerializedGrabElementContext;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  prompt: string;
  turnStatus: TurnStatus;
  activeThreadId: string | null;
  activeTurnId: string | null;
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
  availableModels: CodexModelOption[];
  selectedModel: string | null;
  selectedEffort: CodexReasoningEffort | null;
}

export interface CodexGrabState {
  widgets: GrabWidget[];
  unsupportedMessage: string | null;
}

export interface CodexGrabActions {
  startSelection(): void;
  cancelSelection(): void;
  removeWidget(widgetId: string): void;
  updateAnchor(widgetId: string, anchor: { top: number; left: number }): void;
  updatePrompt(widgetId: string, prompt: string): void;
  updateModel(widgetId: string, model: string): void;
  updateEffort(widgetId: string, effort: CodexReasoningEffort): void;
  submitPrompt(widgetId: string): void;
  approve(widgetId: string): void;
  decline(widgetId: string): void;
  interrupt(widgetId: string): void;
  toggleWidget(widgetId: string): void;
  setWidgetCollapsed(widgetId: string, collapsed: boolean): void;
  collapseAllWidgets(): void;
}

export interface CodexGrabContextValue extends CodexGrabState, CodexGrabActions {
  isSelecting: boolean;
}

const CodexGrabContext = createContext<CodexGrabContextValue | null>(null);
const MAX_EVENTS = 200;
const MODEL_STORAGE_KEY = "codex-grab-selected-model";

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
  preferredModel: string | null,
): GrabWidget => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  anchor: getWidgetAnchor(selection.element),
  selection,
  serializedSelection: serializeElementContext(selection),
  connectionStatus: "connecting",
  connectionError: null,
  prompt: "",
  turnStatus: "idle",
  activeThreadId: null,
  activeTurnId: null,
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
  availableModels: [],
  selectedModel: preferredModel,
  selectedEffort: null
});

const mapBridgeEvent = (widget: GrabWidget, event: BridgeEvent): GrabWidget => {
  const events = [...widget.events, event].slice(-MAX_EVENTS);

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
          connectionError: null,
          availableModels: event.models,
          selectedModel,
          selectedEffort,
          events
        };
      }
    case "selection.accepted":
      return {
        ...widget,
        serializedSelection: event.selection,
        events
      };
    case "turn.started":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        serializedSelection: event.selection,
        turnStatus: "running",
        isSubmitting: false,
        reasoningSummary: "",
        commandOutput: "",
        diff: "",
        plan: [],
        planExplanation: null,
        pendingApproval: null,
        events
      };
    case "reasoning.summary.delta":
      return {
        ...widget,
        reasoningSummary: `${widget.reasoningSummary}${event.delta}`,
        events
      };
    case "plan.updated":
      return {
        ...widget,
        plan: event.plan,
        planExplanation: event.explanation,
        events
      };
    case "command.output.delta":
      return {
        ...widget,
        commandOutput: `${widget.commandOutput}${event.delta}`,
        events
      };
    case "diff.updated":
      return {
        ...widget,
        diff: event.diff,
        events
      };
    case "diff.reverted":
      return {
        ...widget,
        diff: "",
        isRevertingDiff: false,
        commandOutput: `${widget.commandOutput}${widget.commandOutput ? "\n" : ""}${event.message}`,
        events
      };
    case "diff.revert.failed":
      return {
        ...widget,
        isRevertingDiff: false,
        commandOutput: `${widget.commandOutput}${widget.commandOutput ? "\n" : ""}${event.message}`,
        connectionError: event.message,
        events
      };
    case "approval.requested":
      return {
        ...widget,
        pendingApproval: event.approval,
        events
      };
    case "approval.resolved":
      return {
        ...widget,
        pendingApproval:
          widget.pendingApproval?.requestId === event.requestId ? null : widget.pendingApproval,
        events
      };
    case "turn.completed":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "completed",
        isSubmitting: false,
        pendingApproval: null,
        events
      };
    case "turn.failed":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "failed",
        isSubmitting: false,
        connectionError: event.message,
        pendingApproval: null,
        events
      };
    case "turn.cancelled":
      return {
        ...widget,
        activeThreadId: event.threadId,
        activeTurnId: event.turnId,
        turnStatus: "cancelled",
        isSubmitting: false,
        pendingApproval: null,
        events
      };
  }
};

export const CodexGrabProvider = ({
  bridgeUrl,
  token,
  enabled = true,
  children
}: CodexGrabProviderProps) => {
  const [widgets, setWidgets] = useState<GrabWidget[]>([]);
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const socketsRef = useRef(new Map<string, WebSocket>());
  const selectorRef = useRef<SelectionController | null>(null);
  const preferredModelRef = useRef<string | null>(readStoredModelPreference());

  const updateWidgets = useEffectEvent((updater: (prev: GrabWidget[]) => GrabWidget[]) => {
    startTransition(() => {
      setWidgets(updater);
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

  const connectWidget = useEffectEvent((widgetId: string) => {
    const socket = new WebSocket(bridgeUrl);
    socketsRef.current.set(widgetId, socket);

    socket.addEventListener("open", () => {
      sendMessage(widgetId, {
        type: "session.ping",
        token
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
      updateWidget(widgetId, (widget) => ({
        ...widget,
        connectionStatus: "error",
        connectionError: widget.connectionError ?? "Bridge connection closed."
      }));
    });

    socket.addEventListener("error", () => {
      updateWidget(widgetId, (widget) => ({
        ...widget,
        connectionStatus: "error",
        connectionError: "Bridge connection failed."
      }));
    });
  });

  const ensureSelector = useEffectEvent(() => {
    if (selectorRef.current) {
      return selectorRef.current;
    }

    selectorRef.current = createElementSelector({
      onSelect: async (selection) => {
        setIsSelecting(false);
        setUnsupportedMessage(null);

        const widget = createWidgetState(selection, preferredModelRef.current);
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
      setWidgets([]);
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

  const value = useMemo<CodexGrabContextValue>(
    () => ({
      widgets,
      unsupportedMessage,
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
        updateWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
      },
      updateAnchor(widgetId: string, anchor: { top: number; left: number }) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          anchor
        }));
      },
      updatePrompt(widgetId: string, prompt: string) {
        updateWidget(widgetId, (widget) => ({
          ...widget,
          prompt
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
            selectedEffort
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
            selectedEffort: effort
          };
        });
      },
      submitPrompt(widgetId: string) {
        const widget = widgets.find((candidate) => candidate.id === widgetId);
        if (
          !widget ||
          widget.connectionStatus !== "connected" ||
          !widget.prompt.trim()
        ) {
          return;
        }

        updateWidget(widgetId, (current) => ({
          ...current,
          collapsed: true,
          isSubmitting: true
        }));

        sendMessage(widgetId, {
          type: "select.submitPrompt",
          prompt: widget.prompt,
          selection: widget.serializedSelection,
          preferences: {
            model: widget.selectedModel,
            effort: widget.selectedEffort
          }
        });
      },
      approve(widgetId: string) {
        const widget = widgets.find((candidate) => candidate.id === widgetId);
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
        const widget = widgets.find((candidate) => candidate.id === widgetId);
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
        const widget = widgets.find((candidate) => candidate.id === widgetId);
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
          collapsed: !widget.collapsed
        }));
      },
      setWidgetCollapsed(widgetId: string, collapsed: boolean) {
        updateWidget(widgetId, (widget) =>
          widget.collapsed === collapsed
            ? widget
            : {
                ...widget,
                collapsed
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
                  collapsed: true
                },
          ),
        );
      }
    }),
    [
      closeWidgetSocket,
      connectWidget,
      enabled,
      ensureSelector,
      isSelecting,
      sendMessage,
      unsupportedMessage,
      updateWidget,
      updateWidgets,
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
