import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import type {
  ApprovalDecision,
  ApprovalRequest,
  BridgeEvent,
  CodexModelOption,
  CodexPromptPreferences,
  PlanStep,
  SerializedGrabElementContext
} from "@codex-grab/core";
import { buildPrompt } from "./prompt.js";
import { CodexAppServerClient } from "./codex-client.js";

export interface AgentProvider {
  getCodexVersion(): string;
  listModels(): Promise<CodexModelOption[]>;
  submitPrompt(
    sessionId: string,
    prompt: string,
    selection: SerializedGrabElementContext,
    preferences?: CodexPromptPreferences,
  ): Promise<void>;
  respondToApproval(
    sessionId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<void>;
  interrupt(sessionId: string, threadId: string, turnId: string): Promise<void>;
  revertDiff(sessionId: string, diff: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
}

interface ProviderSessionState {
  threadId: string | null;
  turnId: string | null;
  selection: SerializedGrabElementContext | null;
  prompt: string | null;
  preferences: CodexPromptPreferences | null;
  interruptedTurnIds: Set<string>;
  approvalDecisions: Map<string, ApprovalDecision>;
}

interface ServerRequestRecord {
  sessionId: string;
  method: string;
  threadId?: string;
  turnId?: string;
}

type EventSink = (sessionId: string, event: BridgeEvent) => void;
type TurnSummaryMode = "auto" | "concise" | "detailed" | "none";
type PatchReverter = (cwd: string, diff: string) => Promise<void>;
const BLOCKED_MODEL_IDS = new Set([
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini"
]);

const buildRevertPrompt = (diff: string): string =>
  [
    "Revert the most recent change represented by the diff below.",
    "Restore the prior code behavior and content as closely as possible.",
    "Do not introduce unrelated edits.",
    "",
    "Diff to revert:",
    diff.trim()
  ].join("\n");

const normalizeDiffPath = (
  rawPath: string,
  cwd: string,
  sidePrefix: "a/" | "b/" | "",
): string => {
  const trimmed = rawPath.trim();
  const quote = trimmed.startsWith("\"") && trimmed.endsWith("\"") ? "\"" : "";
  const unquoted = quote ? trimmed.slice(1, -1) : trimmed;

  if (unquoted === "/dev/null") {
    return `${quote}${unquoted}${quote}`;
  }

  const withoutPrefix =
    sidePrefix && unquoted.startsWith(sidePrefix) ? unquoted.slice(sidePrefix.length) : unquoted;

  const normalizedPath = path.normalize(withoutPrefix);
  const relativePath = path.isAbsolute(normalizedPath)
    ? path.relative(cwd, normalizedPath)
    : normalizedPath;
  const posixPath = relativePath.split(path.sep).join("/");

  return `${quote}${sidePrefix}${posixPath}${quote}`;
};

const normalizeDiffForGitApply = (cwd: string, diff: string): string =>
  diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) {
        const match = line.match(/^diff --git ("[^"]+"|\S+) ("[^"]+"|\S+)$/);
        if (!match) {
          return line;
        }

        return `diff --git ${normalizeDiffPath(match[1], cwd, "a/")} ${normalizeDiffPath(match[2], cwd, "b/")}`;
      }

      if (line.startsWith("--- ")) {
        return `--- ${normalizeDiffPath(line.slice(4), cwd, "a/")}`;
      }

      if (line.startsWith("+++ ")) {
        return `+++ ${normalizeDiffPath(line.slice(4), cwd, "b/")}`;
      }

      if (line.startsWith("rename from ")) {
        return `rename from ${normalizeDiffPath(line.slice("rename from ".length), cwd, "")}`;
      }

      if (line.startsWith("rename to ")) {
        return `rename to ${normalizeDiffPath(line.slice("rename to ".length), cwd, "")}`;
      }

      if (line.startsWith("copy from ")) {
        return `copy from ${normalizeDiffPath(line.slice("copy from ".length), cwd, "")}`;
      }

      if (line.startsWith("copy to ")) {
        return `copy to ${normalizeDiffPath(line.slice("copy to ".length), cwd, "")}`;
      }

      return line;
    })
    .join("\n");

const reverseApplyDiff: PatchReverter = async (cwd, diff) => {
  const child = spawn("git", ["apply", "--reverse", "--whitespace=nowarn", "-"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

  child.stdin.write(diff);
  child.stdin.end();

  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) {
    const message =
      Buffer.concat(stderr).toString("utf8").trim() ||
      Buffer.concat(stdout).toString("utf8").trim() ||
      "Failed to revert diff.";
    throw new Error(message);
  }
};

const getReasoningSummaryFallbacks = (error: unknown): TurnSummaryMode[] => {
  if (!(error instanceof Error)) {
    return [];
  }

  const message = error.message.toLowerCase();
  if (!message.includes("unsupported_value") || !message.includes("reasoning.summary")) {
    return [];
  }

  const supportedValuesMatch = message.match(/supported values are:? (.+?)(?:[}.]|$)/i);
  if (!supportedValuesMatch) {
    return [];
  }

  const supportedValues = Array.from(
    supportedValuesMatch[1].matchAll(/'(auto|concise|detailed|none)'/g),
  )
    .map((match) => match[1] as TurnSummaryMode);

  const uniqueValues = supportedValues.filter((value, index) => supportedValues.indexOf(value) === index);
  const preferredOrder: TurnSummaryMode[] = ["auto", "detailed", "concise", "none"];

  return preferredOrder.filter((value) => uniqueValues.includes(value));
};

const normalizePlan = (
  plan: Array<{ step: string; status: "pending" | "inProgress" | "completed" }>,
): PlanStep[] =>
  plan.map((item) => ({
    step: item.step,
    status: item.status === "inProgress" ? "in_progress" : item.status
  }));

const toApproval = (
  requestId: string,
  method: string,
  params: Record<string, unknown>,
): ApprovalRequest | null => {
  if (method === "item/fileChange/requestApproval") {
    return {
      kind: "fileChange",
      requestId,
      itemId: String(params.itemId),
      reason: (params.reason as string | null | undefined) ?? null,
      threadId: String(params.threadId),
      turnId: String(params.turnId)
    };
  }

  if (method === "applyPatchApproval") {
    return {
      kind: "applyPatch",
      requestId,
      callId: String(params.callId),
      reason: (params.reason as string | null | undefined) ?? null,
      threadId: String(params.conversationId),
      fileChanges: (params.fileChanges as Record<string, unknown>) ?? {}
    };
  }

  if (method === "item/commandExecution/requestApproval") {
    return {
      kind: "commandExecution",
      requestId,
      itemId: String(params.itemId),
      reason: (params.reason as string | null | undefined) ?? null,
      threadId: String(params.threadId),
      turnId: String(params.turnId),
      command: (params.command as string | null | undefined) ?? null
    };
  }

  return null;
};

const mapDecisionForMethod = (method: string, decision: ApprovalDecision): unknown => {
  if (method === "applyPatchApproval") {
    return {
      decision:
        decision === "approved" || decision === "approved_for_session"
          ? decision
          : decision === "abort"
            ? "abort"
            : "denied"
    };
  }

  if (method === "item/fileChange/requestApproval") {
    return {
      decision:
        decision === "accept" || decision === "acceptForSession" || decision === "cancel"
          ? decision
          : "decline"
    };
  }

  return {
    decision:
      decision === "accept" || decision === "acceptForSession" || decision === "cancel"
        ? decision
        : "decline"
  };
};

export class CodexAgentProvider implements AgentProvider {
  private readonly sessions = new Map<string, ProviderSessionState>();

  private readonly threadToSession = new Map<string, string>();

  private readonly pendingRequests = new Map<string, ServerRequestRecord>();

  private readonly summaryModeByModel = new Map<string, TurnSummaryMode>();

  private modelsPromise: Promise<CodexModelOption[]> | null = null;

  constructor(
    private readonly client: CodexAppServerClient,
    private readonly cwd: string,
    private readonly emit: EventSink,
    private readonly patchReverter: PatchReverter = reverseApplyDiff,
  ) {
    this.client.onNotification((notification) => this.handleNotification(notification));
    this.client.onServerRequest((request) => this.handleServerRequest(request));
  }

  getCodexVersion(): string {
    return this.client.getMetadata().version;
  }

  async listModels(): Promise<CodexModelOption[]> {
    if (!this.modelsPromise) {
      this.modelsPromise = this.client
        .request("model/list", {
          includeHidden: false
        })
        .then((response) => {
          const data = (response as {
            data?: Array<{
              id: string;
              model: string;
              displayName: string;
              description: string;
              hidden: boolean;
              isDefault: boolean;
              defaultReasoningEffort: CodexModelOption["defaultReasoningEffort"];
              supportedReasoningEfforts: Array<{
                reasoningEffort: CodexModelOption["defaultReasoningEffort"];
                description: string;
              }>;
            }>;
          }).data;

          return (data ?? [])
            .filter((model) => !BLOCKED_MODEL_IDS.has(model.model))
            .map((model) => ({
              id: model.id,
              model: model.model,
              displayName: model.displayName,
              description: model.description,
              hidden: model.hidden,
              isDefault: model.isDefault,
              defaultReasoningEffort: model.defaultReasoningEffort,
              supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({
                effort: effort.reasoningEffort,
                description: effort.description
              }))
            }));
        })
        .catch((error) => {
          this.modelsPromise = null;
          throw error;
        });
    }

    return this.modelsPromise;
  }

  async submitPrompt(
    sessionId: string,
    prompt: string,
    selection: SerializedGrabElementContext,
    preferences?: CodexPromptPreferences,
  ): Promise<void> {
    const session = this.getSession(sessionId);
    session.selection = selection;
    session.prompt = prompt;
    session.preferences = preferences ?? null;
    await this.startTurn(sessionId, prompt, selection, preferences);
  }

  async respondToApproval(
    sessionId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.sessionId !== sessionId) {
      throw new Error(`Unknown approval request: ${requestId}`);
    }

    const session = this.getSession(sessionId);
    session.approvalDecisions.set(requestId, decision);
    this.client.respond(Number.isNaN(Number(requestId)) ? requestId : Number(requestId), mapDecisionForMethod(request.method, decision));
  }

  async interrupt(sessionId: string, threadId: string, turnId: string): Promise<void> {
    const session = this.getSession(sessionId);
    session.interruptedTurnIds.add(turnId);
    await this.client.request("turn/interrupt", {
      threadId,
      turnId
    });
  }

  async revertDiff(sessionId: string, diff: string): Promise<void> {
    if (!diff.trim()) {
      throw new Error("No diff available to revert.");
    }

    const normalizedDiff = normalizeDiffForGitApply(this.cwd, diff);

    try {
      await this.patchReverter(this.cwd, normalizedDiff);
      this.emit(sessionId, {
        event: "diff.reverted",
        message: "Reverted latest diff."
      });
      return;
    } catch (error) {
      const session = this.getSession(sessionId);
      if (!session.selection) {
        throw error;
      }

      await this.startTurn(
        sessionId,
        buildRevertPrompt(diff),
        session.selection,
        session.preferences ?? undefined,
      );
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.threadId) {
      this.threadToSession.delete(session.threadId);
    }
    this.sessions.delete(sessionId);
  }

  async dispose(): Promise<void> {
    this.sessions.clear();
    this.threadToSession.clear();
    this.pendingRequests.clear();
    await this.client.dispose();
  }

  private getSession(sessionId: string): ProviderSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: ProviderSessionState = {
      threadId: null,
      turnId: null,
      selection: null,
      prompt: null,
      preferences: null,
      interruptedTurnIds: new Set(),
      approvalDecisions: new Map()
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private handleServerRequest(request: {
    method: string;
    id: string | number;
    params?: unknown;
  }): void {
    const params = (request.params ?? {}) as Record<string, unknown>;
    const threadId =
      (params.threadId as string | undefined) ??
      (params.conversationId as string | undefined);
    const sessionId = threadId ? this.threadToSession.get(threadId) : undefined;
    if (!sessionId) {
      return;
    }

    const approval = toApproval(String(request.id), request.method, params);
    if (!approval) {
      return;
    }

    this.pendingRequests.set(String(request.id), {
      sessionId,
      method: request.method,
      threadId,
      turnId: (params.turnId as string | undefined) ?? undefined
    });
    this.emit(sessionId, {
      event: "approval.requested",
      approval
    });
  }

  private handleNotification(notification: { method: string; params?: unknown }): void {
    const params = (notification.params ?? {}) as Record<string, unknown>;

    if (notification.method === "serverRequest/resolved") {
      const requestId = String(params.requestId);
      const request = this.pendingRequests.get(requestId);
      if (!request) {
        return;
      }
      const session = this.getSession(request.sessionId);
      const decision = session.approvalDecisions.get(requestId);
      this.emit(request.sessionId, {
        event: "approval.resolved",
        requestId,
        threadId: request.threadId,
        decision
      });
      this.pendingRequests.delete(requestId);
      session.approvalDecisions.delete(requestId);
      return;
    }

    const threadId = (params.threadId as string | undefined) ?? (params.conversationId as string | undefined);
    if (!threadId) {
      return;
    }

    const sessionId = this.threadToSession.get(threadId);
    if (!sessionId) {
      return;
    }

    const session = this.getSession(sessionId);

    switch (notification.method) {
      case "item/reasoning/summaryTextDelta":
        this.emit(sessionId, {
          event: "reasoning.summary.delta",
          threadId,
          turnId: String(params.turnId),
          itemId: String(params.itemId),
          summaryIndex: Number(params.summaryIndex),
          delta: String(params.delta ?? "")
        });
        break;
      case "turn/plan/updated":
        this.emit(sessionId, {
          event: "plan.updated",
          threadId,
          turnId: String(params.turnId),
          explanation: (params.explanation as string | null | undefined) ?? null,
          plan: normalizePlan((params.plan as Array<{ step: string; status: "pending" | "inProgress" | "completed" }>) ?? [])
        });
        break;
      case "item/commandExecution/outputDelta":
      case "item/fileChange/outputDelta":
        this.emit(sessionId, {
          event: "command.output.delta",
          threadId,
          turnId: String(params.turnId),
          itemId: String(params.itemId),
          delta: String(params.delta ?? "")
        });
        break;
      case "turn/diff/updated":
        this.emit(sessionId, {
          event: "diff.updated",
          threadId,
          turnId: String(params.turnId),
          diff: String(params.diff ?? "")
        });
        break;
      case "turn/completed": {
        const turn = params.turn as { id: string; error?: { message: string } | null };
        const turnId = turn.id;
        if (turn.error?.message) {
          if (session.interruptedTurnIds.has(turnId)) {
            session.interruptedTurnIds.delete(turnId);
            this.emit(sessionId, {
              event: "turn.cancelled",
              threadId,
              turnId
            });
          } else {
            this.emit(sessionId, {
              event: "turn.failed",
              threadId,
              turnId,
              message: turn.error.message
            });
          }
        } else {
          this.emit(sessionId, {
            event: "turn.completed",
            threadId,
            turnId
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private async startTurn(
    sessionId: string,
    prompt: string,
    selection: SerializedGrabElementContext,
    preferences?: CodexPromptPreferences,
  ): Promise<void> {
    const session = this.getSession(sessionId);
    const model = preferences?.model ?? null;
    const effort = preferences?.effort ?? null;

    if (!session.threadId) {
      const thread = (await this.client.request("thread/start", {
        experimentalRawEvents: false,
        persistExtendedHistory: false,
        cwd: this.cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        model
      })) as { thread: { id: string } };

      session.threadId = thread.thread.id;
      this.threadToSession.set(session.threadId, sessionId);
    }

    const builtPrompt = buildPrompt(prompt, selection);
    const initialSummary = (model ? this.summaryModeByModel.get(model) : null) ?? "auto";
    const turnParams = {
      threadId: session.threadId,
      input: [
        { type: "text", text: builtPrompt, text_elements: [] },
        ...(selection.screenshot ? [{ type: "image", url: selection.screenshot.dataUrl }] : [])
      ],
      cwd: this.cwd,
      approvalPolicy: "on-request",
      summary: initialSummary as TurnSummaryMode,
      model,
      effort
    };

    let turn: { turn: { id: string } };
    try {
      turn = (await this.client.request("turn/start", turnParams)) as { turn: { id: string } };
    } catch (error) {
      const fallbackSummaries = getReasoningSummaryFallbacks(error);
      const fallbackSummary = fallbackSummaries.find((candidate) => candidate !== turnParams.summary);
      if (!fallbackSummary) {
        throw error;
      }

      if (model) {
        this.summaryModeByModel.set(model, fallbackSummary);
      }

      turn = (await this.client.request("turn/start", {
        ...turnParams,
        summary: fallbackSummary
      })) as { turn: { id: string } };
    }

    session.turnId = turn.turn.id;

    this.emit(sessionId, {
      event: "turn.started",
      threadId: session.threadId,
      turnId: session.turnId,
      prompt,
      selection
    });
  }
}
