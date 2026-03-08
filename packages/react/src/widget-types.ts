import type {
  ApprovalRequest,
  BridgeEvent,
  CodexModelOption,
  CodexReasoningEffort,
  PlanStep,
  SerializedGrabElementContext
} from "@codex-grab/core";

export type GrabWidgetAnchorMode = "element" | "manual";
export type GrabWidgetConnectionStatus = "connecting" | "connected" | "error";
export type GrabWidgetTurnStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface GrabPersistedWidgetRecord {
  id: string;
  viewId: string;
  createdAt: number;
  updatedAt: number;
  anchor: {
    top: number;
    left: number;
  };
  anchorMode: GrabWidgetAnchorMode;
  serializedSelection: SerializedGrabElementContext;
  prompt: string;
  collapsed: boolean;
  includeScreenshot: boolean;
  isCapturingScreenshot: boolean;
  screenshotError: string | null;
  selectedModel: string | null;
  selectedEffort: CodexReasoningEffort | null;
  availableModels: CodexModelOption[];
  connectionStatus: GrabWidgetConnectionStatus;
  connectionError: string | null;
  turnStatus: GrabWidgetTurnStatus;
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
  plan: PlanStep[];
  planExplanation: string | null;
  pendingApproval: ApprovalRequest | null;
  events: BridgeEvent[];
  isSubmitting: boolean;
}
