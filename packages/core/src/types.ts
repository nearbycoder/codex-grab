import type { StackFrame } from "bippy/source";

export type GrabStackFrame = StackFrame;

export interface GrabElementScreenshot {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  scale: number;
  capturedAt: number;
}

export interface GrabElementContext {
  element: Element;
  componentName: string | null;
  selector: string | null;
  htmlPreview: string;
  stackString: string;
  stack: GrabStackFrame[];
  styles: string;
  source: {
    fileName: string;
    lineNumber?: number;
    columnNumber?: number;
    functionName?: string;
  } | null;
  screenshot?: GrabElementScreenshot | null;
  fiberId: number | null;
  isReactComponent: boolean;
}

export interface SerializedGrabElementContext
  extends Omit<GrabElementContext, "element"> {}

export interface SelectionController {
  start(): void;
  stop(): void;
  destroy(): void;
  isActive(): boolean;
}

export interface CreateElementSelectorOptions {
  overlayClassName?: string;
  zIndex?: number;
  freezeDuringCapture?: boolean;
  isIgnoredElement?: (element: Element) => boolean;
  onSelect: (context: GrabElementContext) => void | Promise<void>;
  onUnsupported?: (element: Element) => void;
  onCancel?: () => void;
}

export interface ApprovalRequestBase {
  requestId: string;
  threadId?: string;
  turnId?: string;
  reason?: string | null;
}

export type CodexReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface CodexReasoningEffortOption {
  effort: CodexReasoningEffort;
  description: string;
}

export interface CodexModelOption {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
}

export interface CodexPromptPreferences {
  model?: string | null;
  effort?: CodexReasoningEffort | null;
}

export interface FileChangeApprovalRequest extends ApprovalRequestBase {
  kind: "fileChange";
  itemId: string;
}

export interface ApplyPatchApprovalRequest extends ApprovalRequestBase {
  kind: "applyPatch";
  callId: string;
  fileChanges: Record<string, unknown>;
}

export interface CommandApprovalRequest extends ApprovalRequestBase {
  kind: "commandExecution";
  itemId: string;
  command?: string | null;
}

export type ApprovalRequest =
  | FileChangeApprovalRequest
  | ApplyPatchApprovalRequest
  | CommandApprovalRequest;

export type ApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | "approved"
  | "approved_for_session"
  | "denied"
  | "abort";

export interface PlanStep {
  step: string;
  status: "pending" | "in_progress" | "completed";
}

export type BridgeEvent =
  | {
      event: "session.started";
      sessionId: string;
      resumed: boolean;
      bridgeVersion: string;
      codexVersion: string;
      cwd: string;
      models: CodexModelOption[];
      defaultModel: string | null;
      defaultEffort: CodexReasoningEffort | null;
    }
  | {
      event: "selection.accepted";
      selection: SerializedGrabElementContext;
    }
  | {
      event: "turn.started";
      threadId: string;
      turnId: string;
      prompt: string;
      selection: SerializedGrabElementContext;
    }
  | {
      event: "reasoning.summary.delta";
      threadId: string;
      turnId: string;
      itemId: string;
      summaryIndex: number;
      delta: string;
    }
  | {
      event: "plan.updated";
      threadId: string;
      turnId: string;
      explanation: string | null;
      plan: PlanStep[];
    }
  | {
      event: "command.output.delta";
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }
  | {
      event: "diff.updated";
      threadId: string;
      turnId: string;
      diff: string;
    }
  | {
      event: "diff.reverted";
      message: string;
    }
  | {
      event: "diff.revert.failed";
      message: string;
    }
  | {
      event: "approval.requested";
      approval: ApprovalRequest;
    }
  | {
      event: "approval.resolved";
      requestId: string;
      threadId?: string;
      decision?: ApprovalDecision;
    }
  | {
      event: "turn.completed";
      threadId: string;
      turnId: string;
    }
  | {
      event: "turn.failed";
      threadId: string;
      turnId: string;
      message: string;
    }
  | {
      event: "turn.cancelled";
      threadId: string;
      turnId: string;
    };

export type BridgeClientMessage =
  | {
      type: "session.ping";
      token: string;
      resumeSessionId?: string | null;
    }
  | {
      type: "select.submitPrompt";
      prompt: string;
      selection: SerializedGrabElementContext;
      preferences?: CodexPromptPreferences;
    }
  | {
      type: "approval.respond";
      requestId: string;
      decision: ApprovalDecision;
    }
  | {
      type: "turn.interrupt";
      threadId: string;
      turnId: string;
    }
  | {
      type: "diff.revert";
      diff: string;
    };
