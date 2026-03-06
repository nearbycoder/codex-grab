import type { BridgeEvent } from "@codex-grab/core";
import { buildPrompt } from "./prompt.js";
import { CodexAgentProvider } from "./provider.js";

describe("bridge prompt builder", () => {
  it("includes component metadata in the generated Codex prompt", () => {
    const prompt = buildPrompt("Make the button green", {
      componentName: "Button",
      selector: "button.cta",
      htmlPreview: "<button class=\"cta\">Buy</button>",
      stackString: "Button (src/Button.tsx:12:3)",
      stack: [],
      styles: "color: red;",
      source: {
        fileName: "src/Button.tsx",
        lineNumber: 12,
        columnNumber: 3
      },
      fiberId: 42,
      isReactComponent: true
    });

    expect(prompt).toContain("Make the button green");
    expect(prompt).toContain("Button");
    expect(prompt).toContain("src/Button.tsx:12:3");
  });
});

describe("CodexAgentProvider notification mapping", () => {
  it("maps diff and completion notifications into bridge events", async () => {
    const events: BridgeEvent[] = [];
    const notifications: Array<(message: { method: string; params?: unknown }) => void> = [];
    const serverRequests: Array<
      (message: { method: string; id: string | number; params?: unknown }) => void
    > = [];
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification(handler: (message: { method: string; params?: unknown }) => void) {
        notifications.push(handler);
        return () => undefined;
      },
      onServerRequest(
        handler: (message: { method: string; id: string | number; params?: unknown }) => void,
      ) {
        serverRequests.push(handler);
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              id: "model-1",
              model: "gpt-5.3-codex",
              displayName: "gpt-5.3-codex",
              description: "Latest frontier agentic coding model.",
              hidden: false,
              isDefault: true,
              defaultReasoningEffort: "medium",
              supportedReasoningEfforts: [
                {
                  reasoningEffort: "medium",
                  description: "Balanced"
                }
              ]
            }
          ]
        })
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockResolvedValueOnce({ turn: { id: "turn-1" } }),
      respond: vi.fn(),
      dispose: vi.fn()
    };

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/repo",
      (_sessionId, event) => events.push(event),
    );

    await expect(provider.listModels()).resolves.toEqual([
      {
        id: "model-1",
        model: "gpt-5.3-codex",
        displayName: "gpt-5.3-codex",
        description: "Latest frontier agentic coding model.",
        hidden: false,
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [
          {
            effort: "medium",
            description: "Balanced"
          }
        ]
      }
    ]);

    await provider.submitPrompt("session-1", "Change it", {
      componentName: "Button",
      selector: "button",
      htmlPreview: "<button />",
      stackString: "Button",
      stack: [],
      styles: "",
      source: null,
      fiberId: 1,
      isReactComponent: true
    }, {
      model: "gpt-5.3-codex",
      effort: "high"
    });

    expect(mockClient.request).toHaveBeenNthCalledWith(2, "thread/start", {
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      cwd: "/repo",
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      model: "gpt-5.3-codex"
    });
    expect(mockClient.request).toHaveBeenNthCalledWith(3, "turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: expect.any(String), text_elements: [] }],
      cwd: "/repo",
      approvalPolicy: "on-request",
      summary: "auto",
      model: "gpt-5.3-codex",
      effort: "high"
    });

    notifications[0]?.({
      method: "turn/diff/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        diff: "diff --git"
      }
    });
    notifications[0]?.({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", error: null }
      }
    });

    expect(events).toContainEqual({
      event: "diff.updated",
      threadId: "thread-1",
      turnId: "turn-1",
      diff: "diff --git"
    });
    expect(events).toContainEqual({
      event: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-1"
    });
  });

  it("maps approval requests, approval resolutions, and interrupted turns", async () => {
    const events: BridgeEvent[] = [];
    const notifications: Array<(message: { method: string; params?: unknown }) => void> = [];
    const serverRequests: Array<
      (message: { method: string; id: string | number; params?: unknown }) => void
    > = [];
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification(handler: (message: { method: string; params?: unknown }) => void) {
        notifications.push(handler);
        return () => undefined;
      },
      onServerRequest(
        handler: (message: { method: string; id: string | number; params?: unknown }) => void,
      ) {
        serverRequests.push(handler);
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockResolvedValueOnce({ turn: { id: "turn-1" } })
        .mockResolvedValueOnce({}),
      respond: vi.fn(),
      dispose: vi.fn()
    };

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/repo",
      (_sessionId, event) => events.push(event),
    );

    await provider.submitPrompt("session-1", "Change it", {
      componentName: "Button",
      selector: "button",
      htmlPreview: "<button />",
      stackString: "Button",
      stack: [],
      styles: "",
      source: null,
      fiberId: 1,
      isReactComponent: true
    });

    serverRequests[0]?.({
      method: "item/fileChange/requestApproval",
      id: 17,
      params: {
        itemId: "item-1",
        threadId: "thread-1",
        turnId: "turn-1",
        reason: "Need to write files"
      }
    });

    expect(events).toContainEqual({
      event: "approval.requested",
      approval: {
        kind: "fileChange",
        requestId: "17",
        itemId: "item-1",
        reason: "Need to write files",
        threadId: "thread-1",
        turnId: "turn-1"
      }
    });

    await provider.respondToApproval("session-1", "17", "accept");
    expect(mockClient.respond).toHaveBeenCalledWith(17, { decision: "accept" });

    notifications[0]?.({
      method: "serverRequest/resolved",
      params: {
        threadId: "thread-1",
        requestId: 17
      }
    });

    expect(events).toContainEqual({
      event: "approval.resolved",
      requestId: "17",
      threadId: "thread-1",
      decision: "accept"
    });

    await provider.interrupt("session-1", "thread-1", "turn-1");
    notifications[0]?.({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          error: { message: "Interrupted by user" }
        }
      }
    });

    expect(events).toContainEqual({
      event: "turn.cancelled",
      threadId: "thread-1",
      turnId: "turn-1"
    });
  });

  it("starts mini models with detailed summaries immediately", async () => {
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockResolvedValueOnce({ turn: { id: "turn-1" } }),
      respond: vi.fn(),
      dispose: vi.fn()
    };

    const provider = new CodexAgentProvider(mockClient as never, "/repo", () => undefined);

    await provider.submitPrompt(
      "session-1",
      "Change it",
      {
        componentName: "Button",
        selector: "button",
        htmlPreview: "<button />",
        stackString: "Button",
        stack: [],
        styles: "",
        source: null,
        fiberId: 1,
        isReactComponent: true
      },
      {
        model: "gpt-5.1-codex-mini",
        effort: "medium"
      },
    );

    expect(mockClient.request).toHaveBeenNthCalledWith(2, "turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: expect.any(String), text_elements: [] }],
      cwd: "/repo",
      approvalPolicy: "on-request",
      summary: "auto",
      model: "gpt-5.1-codex-mini",
      effort: "medium"
    });
  });

  it("retries turn/start with detailed mode when auto is unsupported", async () => {
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockRejectedValueOnce(
          new Error(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "unsupported_value",
                message:
                  "'auto' is not supported with the 'gpt-5.1-codex-lite' model. Supported values are 'detailed', 'concise'.",
                param: ["reasoning.summary"]
              },
              status: 400
            }),
          ),
        )
        .mockResolvedValueOnce({ turn: { id: "turn-1" } }),
      respond: vi.fn(),
      dispose: vi.fn()
    };

    const provider = new CodexAgentProvider(mockClient as never, "/repo", () => undefined);

    await provider.submitPrompt(
      "session-1",
      "Change it",
      {
        componentName: "Button",
        selector: "button",
        htmlPreview: "<button />",
        stackString: "Button",
        stack: [],
        styles: "",
        source: null,
        fiberId: 1,
        isReactComponent: true
      },
      {
        model: "gpt-5.1-codex-lite",
        effort: "medium"
      },
    );

    expect(mockClient.request).toHaveBeenNthCalledWith(1, "thread/start", {
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      cwd: "/repo",
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      model: "gpt-5.1-codex-lite"
    });
    expect(mockClient.request).toHaveBeenNthCalledWith(2, "turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: expect.any(String), text_elements: [] }],
      cwd: "/repo",
      approvalPolicy: "on-request",
      summary: "auto",
      model: "gpt-5.1-codex-lite",
      effort: "medium"
    });
    expect(mockClient.request).toHaveBeenNthCalledWith(3, "turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: expect.any(String), text_elements: [] }],
      cwd: "/repo",
      approvalPolicy: "on-request",
      summary: "detailed",
      model: "gpt-5.1-codex-lite",
      effort: "medium"
    });
  });

  it("retries turn/start with detailed mode when that is the only supported fallback", async () => {
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockRejectedValueOnce(
          new Error(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "unsupported_value",
                message:
                  "Unsupported value: 'auto' is not supported with the 'gpt-5.1-codex-lite' model. Supported values are: 'detailed'.",
                param: "reasoning.summary"
              },
              status: 400
            }),
          ),
        )
        .mockResolvedValueOnce({ turn: { id: "turn-1" } }),
      respond: vi.fn(),
      dispose: vi.fn()
    };

    const provider = new CodexAgentProvider(mockClient as never, "/repo", () => undefined);

    await provider.submitPrompt(
      "session-1",
      "Change it",
      {
        componentName: "Button",
        selector: "button",
        htmlPreview: "<button />",
        stackString: "Button",
        stack: [],
        styles: "",
        source: null,
        fiberId: 1,
        isReactComponent: true
      },
      {
        model: "gpt-5.1-codex-lite",
        effort: "medium"
      },
    );

    expect(mockClient.request).toHaveBeenNthCalledWith(3, "turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: expect.any(String), text_elements: [] }],
      cwd: "/repo",
      approvalPolicy: "on-request",
      summary: "detailed",
      model: "gpt-5.1-codex-lite",
      effort: "medium"
    });
  });

  it("reverts the latest diff and emits a diff.reverted event", async () => {
    const events: BridgeEvent[] = [];
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi.fn(),
      respond: vi.fn(),
      dispose: vi.fn()
    };
    const patchReverter = vi.fn().mockResolvedValue(undefined);

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/repo",
      (_sessionId, event) => events.push(event),
      patchReverter,
    );

    await provider.revertDiff("session-1", "diff --git a/file b/file");

    expect(patchReverter).toHaveBeenCalledWith("/repo", "diff --git a/file b/file");
    expect(events).toContainEqual({
      event: "diff.reverted",
      message: "Reverted latest diff."
    });
  });

  it("normalizes absolute diff paths before reverting", async () => {
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi.fn(),
      respond: vi.fn(),
      dispose: vi.fn()
    };
    const patchReverter = vi.fn().mockResolvedValue(undefined);

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/Users/nearby/Sites/codex-grab",
      () => undefined,
      patchReverter,
    );

    await provider.revertDiff(
      "session-1",
      [
        "diff --git a//Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx b//Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "--- a//Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "+++ b//Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new"
      ].join("\n"),
    );

    expect(patchReverter).toHaveBeenCalledWith(
      "/Users/nearby/Sites/codex-grab",
      [
        "diff --git a/demo-vite/src/App.tsx b/demo-vite/src/App.tsx",
        "--- a/demo-vite/src/App.tsx",
        "+++ b/demo-vite/src/App.tsx",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new"
      ].join("\n"),
    );
  });

  it("normalizes unprefixed and rename diff headers before reverting", async () => {
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi.fn(),
      respond: vi.fn(),
      dispose: vi.fn()
    };
    const patchReverter = vi.fn().mockResolvedValue(undefined);

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/Users/nearby/Sites/codex-grab",
      () => undefined,
      patchReverter,
    );

    await provider.revertDiff(
      "session-1",
      [
        "diff --git /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx /Users/nearby/Sites/codex-grab/demo-vite/src/AppRenamed.tsx",
        "rename from /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "rename to /Users/nearby/Sites/codex-grab/demo-vite/src/AppRenamed.tsx",
        "--- /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "+++ /Users/nearby/Sites/codex-grab/demo-vite/src/AppRenamed.tsx",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new"
      ].join("\n"),
    );

    expect(patchReverter).toHaveBeenCalledWith(
      "/Users/nearby/Sites/codex-grab",
      [
        "diff --git a/demo-vite/src/App.tsx b/demo-vite/src/AppRenamed.tsx",
        "rename from demo-vite/src/App.tsx",
        "rename to demo-vite/src/AppRenamed.tsx",
        "--- a/demo-vite/src/App.tsx",
        "+++ b/demo-vite/src/AppRenamed.tsx",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new"
      ].join("\n"),
    );
  });

  it("falls back to a Codex turn when reverse apply fails", async () => {
    const events: BridgeEvent[] = [];
    const selection = {
      componentName: "FeatureCard",
      selector: "#featurecard",
      htmlPreview: "<button />",
      stackString: "FeatureCard",
      stack: [],
      styles: "",
      source: {
        fileName: "demo-vite/src/App.tsx",
        lineNumber: 11,
        columnNumber: 3
      },
      fiberId: 1,
      isReactComponent: true
    };
    const mockClient = {
      getMetadata: () => ({ version: "0.108.0", accountEmail: "test@example.com" }),
      onNotification() {
        return () => undefined;
      },
      onServerRequest() {
        return () => undefined;
      },
      request: vi
        .fn()
        .mockResolvedValueOnce({ thread: { id: "thread-1" } })
        .mockResolvedValueOnce({ turn: { id: "turn-1" } })
        .mockResolvedValueOnce({ turn: { id: "turn-2" } }),
      respond: vi.fn(),
      dispose: vi.fn()
    };
    const patchReverter = vi.fn().mockRejectedValue(new Error("error: invalid path '/Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx'"));

    const provider = new CodexAgentProvider(
      mockClient as never,
      "/Users/nearby/Sites/codex-grab",
      (_sessionId, event) => events.push(event),
      patchReverter,
    );

    await provider.submitPrompt("session-1", "Change it", selection, {
      model: "gpt-5.3-codex",
      effort: "medium"
    });

    await provider.revertDiff(
      "session-1",
      [
        "diff --git /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "--- /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "+++ /Users/nearby/Sites/codex-grab/demo-vite/src/App.tsx",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new"
      ].join("\n"),
    );

    expect(patchReverter).toHaveBeenCalledTimes(1);
    expect(mockClient.request).toHaveBeenNthCalledWith(3, "turn/start", {
      threadId: "thread-1",
      input: [
        {
          type: "text",
          text: expect.stringContaining("Revert the most recent change represented by the diff below."),
          text_elements: []
        }
      ],
      cwd: "/Users/nearby/Sites/codex-grab",
      approvalPolicy: "on-request",
      summary: "auto",
      model: "gpt-5.3-codex",
      effort: "medium"
    });
    expect(events).toContainEqual({
      event: "turn.started",
      threadId: "thread-1",
      turnId: "turn-2",
      prompt: expect.stringContaining("Revert the most recent change represented by the diff below."),
      selection
    });
  });
});
