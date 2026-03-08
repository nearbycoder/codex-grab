import type {
  ApprovalDecision,
  ApprovalRequest,
  CodexReasoningEffort,
  PlanStep,
  SerializedGrabElementContext
} from "@codex-grab/core";

export type GrabTurnHistoryStatus = "running" | "completed" | "failed" | "cancelled";
export type GrabTurnHistoryStorageStatus = "idle" | "loading" | "ready" | "error";

export interface GrabTurnHistoryApprovalRecord {
  requestId: string;
  kind: ApprovalRequest["kind"];
  reason: string | null;
  threadId?: string;
  turnId?: string;
  requestedAt: number;
  resolvedAt: number | null;
  decision: ApprovalDecision | null;
}

export interface GrabTurnHistoryRecord {
  id: string;
  turnId: string | null;
  widgetId: string;
  sessionId: string | null;
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  bridgeUrl: string;
  cwd: string | null;
  bridgeVersion: string | null;
  codexVersion: string | null;
  selection: SerializedGrabElementContext;
  prompt: string;
  model: string | null;
  effort: CodexReasoningEffort | null;
  status: GrabTurnHistoryStatus;
  reasoningSummary: string;
  commandOutput: string;
  diff: string;
  plan: PlanStep[];
  planExplanation: string | null;
  approvals: GrabTurnHistoryApprovalRecord[];
  errorMessage: string | null;
}
