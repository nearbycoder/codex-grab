import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { CodexGrabOverlay } from "./overlay.js";
import { CodexGrabProvider, useCodexGrab } from "./context.js";
import { installMockIndexedDb } from "./test-indexeddb.js";
import type {
  CreateElementSelectorOptions,
  GrabElementContext,
  SerializedGrabElementContext
} from "@codex-grab/core";

const selectorState: {
  options: CreateElementSelectorOptions | null;
  active: boolean;
} = {
  options: null,
  active: false
};

const installMockLocalStorage = () => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      }
    }
  });
};

vi.mock("@codex-grab/core", async () => {
  const actual = await vi.importActual<typeof import("@codex-grab/core")>("@codex-grab/core");

  return {
    ...actual,
    createElementSelector(options: CreateElementSelectorOptions) {
      selectorState.options = options;

      return {
        start() {
          selectorState.active = true;
        },
        stop() {
          selectorState.active = false;
          options.onCancel?.();
        },
        destroy() {
          selectorState.active = false;
        },
        isActive() {
          return selectorState.active;
        }
      };
    },
    serializeElementContext(context: GrabElementContext): SerializedGrabElementContext {
      const { element, ...serialized } = context;
      void element;
      return serialized;
    },
    async getElementContext(element: Element): Promise<GrabElementContext> {
      const name = element.textContent?.trim() || "Recovered";
      return {
        element,
        componentName: name,
        selector: element.id ? `#${element.id}` : null,
        htmlPreview: element.outerHTML,
        stackString: `${name} > Button`,
        stack: [],
        styles: "display:inline-flex;",
        source: {
          fileName: `/tmp/${name}.tsx`,
          lineNumber: 10,
          columnNumber: 3
        },
        fiberId: 1,
        isReactComponent: true
      };
    }
  };
});

class MockSocket {
  static instances: MockSocket[] = [];
  static autoSessionStart = true;
  static onSend: ((socket: MockSocket, message: Record<string, unknown>) => void) | null = null;
  static OPEN = 1;
  readyState = WebSocket.OPEN;
  listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();
  sent: string[] = [];

  constructor() {
    MockSocket.instances.push(this);
    queueMicrotask(() => {
      this.emit("open", new Event("open"));
    });
  }

  addEventListener(type: string, listener: (event: MessageEvent | Event) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.emit("close", new Event("close"));
  }

  send(data: string) {
    this.sent.push(data);
    const message = JSON.parse(data) as {
      type?: string;
      token?: string;
      resumeSessionId?: string | null;
    };
    if (MockSocket.onSend) {
      MockSocket.onSend(this, message as Record<string, unknown>);
      return;
    }

    if (MockSocket.autoSessionStart && message.type === "session.ping" && message.token === "secret") {
      this.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "session.started",
            sessionId: "session",
            resumed: Boolean(message.resumeSessionId),
            bridgeVersion: "0.1.0",
            codexVersion: "0.108.0",
            cwd: "/tmp",
            models: [
              {
                id: "model-1",
                model: "model-alpha",
                displayName: "model-alpha",
                description: "Primary allowed model.",
                hidden: false,
                isDefault: true,
                defaultReasoningEffort: "medium",
                supportedReasoningEfforts: [
                  {
                    effort: "low",
                    description: "Fast responses with lighter reasoning"
                  },
                  {
                    effort: "medium",
                    description: "Balanced speed and reasoning depth"
                  },
                  {
                    effort: "high",
                    description: "Deeper reasoning for harder tasks"
                  },
                  {
                    effort: "xhigh",
                    description: "Maximum reasoning depth for the hardest tasks"
                  }
                ]
              },
              {
                id: "model-2",
                model: "model-beta",
                displayName: "model-beta",
                description: "Secondary allowed model.",
                hidden: false,
                isDefault: false,
                defaultReasoningEffort: "none",
                supportedReasoningEfforts: [
                  {
                    effort: "none",
                    description: "Lowest-latency responses with no extra reasoning"
                  },
                  {
                    effort: "medium",
                    description: "Balanced speed and reasoning depth"
                  },
                  {
                    effort: "high",
                    description: "Deeper reasoning for harder tasks"
                  },
                  {
                    effort: "xhigh",
                    description: "Maximum reasoning depth for the hardest tasks"
                  }
                ]
              }
            ],
            defaultModel: "model-alpha",
            defaultEffort: "medium"
          })
        }),
      );
    }
  }

  emit(type: string, event: MessageEvent | Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const getSentMessages = (socket: MockSocket | undefined) =>
  (socket?.sent ?? []).map((payload) => JSON.parse(payload) as Record<string, unknown>);

const findSentMessage = (socket: MockSocket | undefined, type: string) =>
  getSentMessages(socket).find((message) => message.type === type);

const findAnySentMessage = (type: string) =>
  MockSocket.instances
    .map((socket) => findSentMessage(socket, type))
    .find((message) => message !== undefined);

const flushPersistence = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const openHistoryFromLauncherMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  fireEvent.contextMenu(screen.getByRole("button", { name: "Select area for codex-grab" }), {
    clientX: 120,
    clientY: 140
  });
  const historyAction = await screen.findByText("History");
  await user.click(historyAction.closest("button") as HTMLButtonElement);
};

const HistoryHarness = () => {
  const { openHistory } = useCodexGrab();
  return <button onClick={() => openHistory()}>Open history panel</button>;
};

const HistoryStatusHarness = () => {
  const { historyStatus, historyError } = useCodexGrab();
  return (
    <div>
      <span>History status: {historyStatus}</span>
      <span>History error: {historyError ?? "none"}</span>
    </div>
  );
};

describe("CodexGrabProvider", () => {
  const createSelectionFromElement = (
    element: HTMLButtonElement,
    name: string,
  ): GrabElementContext => {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 40,
      top: 40,
      left: 20,
      right: 180,
      bottom: 80,
      width: 160,
      height: 40,
      toJSON: () => ({})
    } as DOMRect);

    return {
      element,
      componentName: name,
      selector: `#${name.toLowerCase()}`,
      htmlPreview: `<button>${name}</button>`,
      stackString: `${name} > Button`,
      stack: [],
      styles: "display:inline-flex;",
      source: {
        fileName: `/tmp/${name}.tsx`,
        lineNumber: 10,
        columnNumber: 3
      },
      fiberId: 1,
      isReactComponent: true
    };
  };

  const createSelection = (name: string): GrabElementContext => {
    const element = document.createElement("button");
    element.id = name.toLowerCase();
    element.textContent = name;
    document.body.appendChild(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 40,
      top: 40,
      left: 20,
      right: 180,
      bottom: 80,
      width: 160,
      height: 40,
      toJSON: () => ({})
    } as DOMRect);

    return {
      element,
      componentName: name,
      selector: `#${name.toLowerCase()}`,
      htmlPreview: `<button>${name}</button>`,
      stackString: `${name} > Button`,
      stack: [],
      styles: "display:inline-flex;",
      source: {
        fileName: `/tmp/${name}.tsx`,
        lineNumber: 10,
        columnNumber: 3
      },
      fiberId: 1,
      isReactComponent: true
    };
  };

  beforeEach(() => {
    MockSocket.instances = [];
    MockSocket.autoSessionStart = true;
    MockSocket.onSend = null;
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    installMockLocalStorage();
    installMockIndexedDb();
    selectorState.options = null;
    selectorState.active = false;
    window.localStorage.clear();
    document.cookie =
      "codex-grab-hidden-session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a widget after selection and connects its bridge session", async () => {
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    expect(await screen.findByRole("button", { name: "Cancel selection" })).toBeTruthy();

    await act(async () => {
      await selectorState.options?.onSelect(createSelection("HeroCard"));
    });

    expect(screen.getAllByText("HeroCard").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText("Describe the change you want Codex to make."),
      );
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("button", { name: "Choose model" })
          .some((button) => button.textContent?.includes("model-alpha")),
      ).toBe(true);
      expect(
        screen
          .getAllByRole("button", { name: "Choose thinking" })
          .some((button) => button.textContent?.includes("medium")),
      ).toBe(true);
    });
    expect(findSentMessage(MockSocket.instances[0], "session.ping")).toMatchObject({
      type: "session.ping",
      token: "secret"
    });
  });

  it("shows a stable connection error and retries on demand", async () => {
    MockSocket.autoSessionStart = false;
    MockSocket.onSend = (socket, message) => {
      if (message.type === "session.ping") {
        socket.emit("close", new Event("close"));
      }
    };

    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("RetryCard"));
    });

    expect(await screen.findByText("Bridge connection closed.")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(MockSocket.instances).toHaveLength(1);

    MockSocket.autoSessionStart = true;
    MockSocket.onSend = null;

    await user.click(screen.getByRole("button", { name: "Retry connection" }));

    await waitFor(() => {
      expect(MockSocket.instances).toHaveLength(2);
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
  });

  it("supports multiple widgets with independent prompt submission", async () => {
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("HeroCard"));
    });
    const heroSocket = MockSocket.instances.at(-1);

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("FeatureCard"));
    });
    await waitFor(() => {
      expect(MockSocket.instances.length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getAllByText("HeroCard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FeatureCard").length).toBeGreaterThan(0);

    const featureCardPanel = screen
      .getAllByText("FeatureCard")
      .map((node) => node.closest("aside"))
      .find(Boolean);

    expect(featureCardPanel).toBeTruthy();

    const featureCardScope = within(featureCardPanel as HTMLElement);
    const featurePrompt = featureCardScope.getByPlaceholderText(
      "Describe the change you want Codex to make.",
    ) as HTMLTextAreaElement;
    fireEvent.change(
      featurePrompt,
      { target: { value: "Change this to Welcome!" } },
    );
    const featureSocket = MockSocket.instances.find((socket) => socket !== heroSocket);
    await waitFor(() => {
      expect(featurePrompt.value).toBe("Change this to Welcome!");
      expect(
        (featureCardScope.getByRole("button", { name: "Send To Codex" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
    await user.click(featureCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(findSentMessage(featureSocket, "select.submitPrompt")).toMatchObject({
      type: "select.submitPrompt",
      prompt: "Change this to Welcome!",
      selection: {
        componentName: "FeatureCard",
        selector: "#featurecard",
        htmlPreview: "<button>FeatureCard</button>",
        stackString: "FeatureCard > Button",
        stack: [],
        styles: "display:inline-flex;",
        source: {
          fileName: "/tmp/FeatureCard.tsx",
          lineNumber: 10,
          columnNumber: 3
        },
        fiberId: 1,
        isReactComponent: true
      },
      preferences: {
        model: "model-alpha",
        effort: "medium"
      }
    });
  });

  it("focuses the newest widget prompt when selecting another area", async () => {
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("HeroCard"));
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText("Describe the change you want Codex to make."),
      );
    });

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("FeatureCard"));
    });

    const featureCardPanel = screen
      .getAllByText("FeatureCard")
      .map((node) => node.closest("aside"))
      .find(Boolean);

    expect(featureCardPanel).toBeTruthy();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(featureCardPanel as HTMLElement).getByPlaceholderText(
          "Describe the change you want Codex to make.",
        ),
      );
    });
  });

  it("lets the compact widget switch model and thinking with custom pickers", async () => {
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("FeatureCard"));
    });

    const featureCardPanel = screen
      .getAllByText("FeatureCard")
      .map((node) => node.closest("aside"))
      .find(Boolean);

    expect(featureCardPanel).toBeTruthy();

    const featureCardScope = within(featureCardPanel as HTMLElement);
    await user.click(featureCardScope.getByRole("button", { name: "Choose model" }));
    await user.click(await screen.findByRole("option", { name: /model-beta/i }));
    await user.click(featureCardScope.getByRole("button", { name: "Choose thinking" }));
    await user.click(await screen.findByRole("option", { name: /xhigh/i }));
    await waitFor(() => {
      expect(featureCardScope.getByRole("button", { name: "Choose model" }).textContent).toContain(
        "model-beta",
      );
      expect(
        featureCardScope.getByRole("button", { name: "Choose thinking" }).textContent,
      ).toContain("xhigh");
    });

    const featurePrompt = featureCardScope.getByPlaceholderText(
      "Describe the change you want Codex to make.",
    ) as HTMLTextAreaElement;
    fireEvent.change(
      featurePrompt,
      { target: { value: "Change this to Welcome!" } },
    );
    await waitFor(() => {
      expect(featurePrompt.value).toBe("Change this to Welcome!");
      expect(
        (featureCardScope.getByRole("button", { name: "Send To Codex" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
    await user.click(featureCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(findAnySentMessage("select.submitPrompt")).toMatchObject({
      type: "select.submitPrompt",
      prompt: "Change this to Welcome!",
      preferences: {
        model: "model-beta",
        effort: "xhigh"
      }
    });
  });

  it("reuses the stored model preference for new widgets", async () => {
    window.localStorage.setItem("codex-grab-selected-model", "model-beta");
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("StoredCard"));
    });

    const storedCardPanel = screen
      .getAllByText("StoredCard")
      .map((node) => node.closest("aside"))
      .find(Boolean);

    expect(storedCardPanel).toBeTruthy();

    const storedCardScope = within(storedCardPanel as HTMLElement);
    expect(storedCardScope.getByRole("button", { name: "Choose model" }).textContent).toContain(
      "model-beta",
    );
    expect(
      storedCardScope.getByRole("button", { name: "Choose thinking" }).textContent,
    ).toContain("none");

    const storedPrompt = storedCardScope.getByPlaceholderText(
      "Describe the change you want Codex to make.",
    ) as HTMLTextAreaElement;
    fireEvent.change(
      storedPrompt,
      { target: { value: "Use the stored model" } },
    );
    await waitFor(() => {
      expect(storedPrompt.value).toBe("Use the stored model");
      expect(
        (storedCardScope.getByRole("button", { name: "Send To Codex" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
    await user.click(storedCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(findAnySentMessage("select.submitPrompt")).toMatchObject({
      type: "select.submitPrompt",
      prompt: "Use the stored model",
      preferences: {
        model: "model-beta",
        effort: "none"
      }
    });
  });

  it("unmounts widgets when the view changes and remounts them when returning", async () => {
    const user = userEvent.setup();

    const RouteStateHarness = () => {
      const { currentViewId, widgets } = useCodexGrab();
      return (
        <div data-testid="route-state">
          {currentViewId}:{widgets.map((widget) => widget.serializedSelection.componentName).join(",")}
        </div>
      );
    };

    const RoutedHarness = () => {
      const [route, setRoute] = useState("route-a");
      return (
        <>
          <button onClick={() => setRoute("route-a")}>Route A</button>
          <button onClick={() => setRoute("route-b")}>Route B</button>
          <CodexGrabProvider
            bridgeUrl="ws://127.0.0.1:4321"
            token="secret"
            viewId={route}
          >
            <RouteStateHarness />
            {route === "route-a" ? <button id="featurecard">FeatureCard</button> : <button id="othercard">OtherCard</button>}
            <CodexGrabOverlay />
          </CodexGrabProvider>
        </>
      );
    };

    render(<RoutedHarness />);

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    const featureButton = screen.getByRole("button", { name: "FeatureCard" });
    await act(async () => {
      await selectorState.options?.onSelect(
        createSelectionFromElement(featureButton as HTMLButtonElement, "FeatureCard"),
      );
    });

    expect(screen.getAllByText("FeatureCard").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByTestId("route-state").textContent).toBe("route-a:FeatureCard");
    });

    await user.click(screen.getByRole("button", { name: "Route B" }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Describe the change you want Codex to make.")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Select area for codex-grab" }));
    const otherButton = screen.getByRole("button", { name: "OtherCard" });
    await act(async () => {
      await selectorState.options?.onSelect(
        createSelectionFromElement(otherButton as HTMLButtonElement, "OtherCard"),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText("OtherCard").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("route-state").textContent).toBe("route-b:OtherCard");
    });

    await user.click(screen.getByRole("button", { name: "Route A" }));
    await waitFor(() => {
      expect(screen.getByTestId("route-state").textContent).toBe("route-a:FeatureCard");
    });
  });

  it("restores persisted widgets after refresh and resumes running turns", async () => {
    const user = userEvent.setup();

    const Shell = () => (
      <CodexGrabProvider
        bridgeUrl="ws://127.0.0.1:4321"
        token="secret"
        viewId="route-a"
      >
        <button id="featurecard">FeatureCard</button>
        <CodexGrabOverlay />
      </CodexGrabProvider>
    );

    const firstRender = render(<Shell />);

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    const featureButton = screen.getByRole("button", { name: "FeatureCard" });
    await act(async () => {
      await selectorState.options?.onSelect(
        createSelectionFromElement(featureButton as HTMLButtonElement, "FeatureCard"),
      );
    });
    const keepAlivePrompt = screen.getByPlaceholderText(
      "Describe the change you want Codex to make.",
    ) as HTMLTextAreaElement;
    fireEvent.change(keepAlivePrompt, {
      target: { value: "Keep this alive" }
    });
    await waitFor(() => {
      expect(keepAlivePrompt.value).toBe("Keep this alive");
      expect((screen.getByRole("button", { name: "Send To Codex" }) as HTMLButtonElement).disabled).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Send To Codex" }));

    act(() => {
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.started",
            threadId: "thread-live",
            turnId: "turn-live",
            selection: {
              componentName: "FeatureCard",
              selector: "#featurecard",
              htmlPreview: "<button>FeatureCard</button>",
              stackString: "FeatureCard > Button",
              stack: [],
              styles: "display:inline-flex;",
              source: {
                fileName: "/tmp/FeatureCard.tsx",
                lineNumber: 10,
                columnNumber: 3
              },
              fiberId: 1,
              isReactComponent: true
            }
          })
        }),
      );
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "reasoning.summary.delta",
            threadId: "thread-live",
            turnId: "turn-live",
            itemId: "item-1",
            summaryIndex: 0,
            delta: "Still working after refresh."
          })
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Still working after refresh.")).toBeTruthy();
    });
    await flushPersistence();
    firstRender.unmount();

    render(<Shell />);

    await waitFor(() => {
      expect(
        MockSocket.instances.some((socket) => {
          const message = findSentMessage(socket, "session.ping");
          return (
            message?.token === "secret" &&
            message?.resumeSessionId === "session"
          );
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getAllByText("FeatureCard").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Still working after refresh.")).toBeTruthy();
  });

  it("hides the overlay when the session cookie is present", () => {
    document.cookie = "codex-grab-hidden-session=1; path=/";
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    expect(screen.queryByRole("button", { name: "Select area for codex-grab" })).toBeNull();
  });

  it("persists submitted turn history across reloads without recreating live widgets", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("FeatureCard"));
    });
    const prompt = screen.getByPlaceholderText("Describe the change you want Codex to make.");
    const featureSocket = MockSocket.instances.at(-1);
    fireEvent.change(prompt, { target: { value: "Change the feature copy" } });
    await waitFor(() => {
      expect((prompt as HTMLTextAreaElement).value).toBe("Change the feature copy");
      expect((screen.getByRole("button", { name: "Send To Codex" }) as HTMLButtonElement).disabled).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Send To Codex" }));

    act(() => {
      featureSocket?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.started",
            threadId: "thread-1",
            turnId: "turn-1",
            selection: {
              componentName: "FeatureCard",
              selector: "#featurecard",
              htmlPreview: "<button>FeatureCard</button>",
              stackString: "FeatureCard > Button",
              stack: [],
              styles: "display:inline-flex;",
              source: {
                fileName: "/tmp/FeatureCard.tsx",
                lineNumber: 10,
                columnNumber: 3
              },
              fiberId: 1,
              isReactComponent: true
            }
          })
        }),
      );
      featureSocket?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "reasoning.summary.delta",
            delta: "Updating the body copy."
          })
        }),
      );
      featureSocket?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "command.output.delta",
            delta: "M demo-vite/src/App.tsx"
          })
        }),
      );
      featureSocket?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "diff.updated",
            diff: [
              "diff --git a/demo-vite/src/App.tsx b/demo-vite/src/App.tsx",
              "--- a/demo-vite/src/App.tsx",
              "+++ b/demo-vite/src/App.tsx",
              "@@ -1,1 +1,1 @@",
              "-Hello",
              "+Hello world",
              "diff --git a/demo-vite/src/main.tsx b/demo-vite/src/main.tsx",
              "--- a/demo-vite/src/main.tsx",
              "+++ b/demo-vite/src/main.tsx",
              "@@ -1,1 +1,1 @@",
              "-createRoot(node)",
              "+createRoot(node).render(app)"
            ].join("\n")
          })
        }),
      );
      featureSocket?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.completed",
            threadId: "thread-1",
            turnId: "turn-1"
          })
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Done/)).toBeTruthy();
    });
    await flushPersistence();

    firstRender.unmount();

    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Describe the change you want Codex to make.")).toBeNull();
    });

    await openHistoryFromLauncherMenu(user);

    expect(await screen.findByText("Saved browser history of Codex turns for this origin.")).toBeTruthy();
    expect(screen.getAllByText("FeatureCard").length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Change the feature copy/)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Updating the body copy\./)).toBeTruthy();
    expect(await screen.findByText(/M demo-vite\/src\/App\.tsx/)).toBeTruthy();
    expect(document.querySelectorAll("diffs-container").length).toBeGreaterThanOrEqual(2);
  });

  it("shows history unavailable state without breaking widgets when IndexedDB fails", async () => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined
    });

    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
        <HistoryStatusHarness />
      </CodexGrabProvider>,
    );

    expect(await screen.findByText("History status: error")).toBeTruthy();
    expect(screen.getByText("History error: History is unavailable in this browser.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select area for codex-grab" })).toBeTruthy();
  });

  it("opens picker shortcut settings from the launcher menu", async () => {
    const user = userEvent.setup();
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Select area for codex-grab" }), {
      clientX: 120,
      clientY: 140
    });

    const shortcutAction = await screen.findByText("Picker shortcut");
    await user.click(shortcutAction.closest("button") as HTMLButtonElement);

    expect(await screen.findByText("Trigger select mode without clicking the launcher.")).toBeTruthy();
    expect(screen.getAllByText("Meta + C").length).toBeGreaterThan(0);
  });

  it("toggles the launcher menu off on a second right click", async () => {
    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    const launcher = screen.getByRole("button", { name: "Select area for codex-grab" });

    fireEvent.contextMenu(launcher, {
      clientX: 120,
      clientY: 140
    });
    expect(await screen.findByText("History")).toBeTruthy();

    fireEvent.contextMenu(launcher, {
      clientX: 120,
      clientY: 140
    });

    await waitFor(() => {
      expect(screen.queryByText("History")).toBeNull();
    });
  });

  it("clears persisted history from the history dialog", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("ClearHistoryCard"));
    });

    await user.type(
      screen.getByPlaceholderText("Describe the change you want Codex to make."),
      "Archive this run",
    );
    await user.click(screen.getByRole("button", { name: "Send To Codex" }));

    act(() => {
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.started",
            threadId: "thread-clear",
            turnId: "turn-clear",
            selection: {
              componentName: "ClearHistoryCard",
              selector: "#clearhistorycard",
              htmlPreview: "<button>ClearHistoryCard</button>",
              stackString: "ClearHistoryCard > Button",
              stack: [],
              styles: "display:inline-flex;",
              source: {
                fileName: "/tmp/ClearHistoryCard.tsx",
                lineNumber: 10,
                columnNumber: 3
              },
              fiberId: 1,
              isReactComponent: true
            }
          })
        }),
      );
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.completed",
            threadId: "thread-clear",
            turnId: "turn-clear"
          })
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Done")).toBeTruthy();
    });
    await flushPersistence();

    firstRender.unmount();

    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await openHistoryFromLauncherMenu(user);
    await waitFor(() => {
      expect(screen.queryByText("Loading history…")).toBeNull();
    });

    expect((await screen.findAllByText(/Archive this run/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Clear history" }));
    await waitFor(() => {
      expect(screen.getByText("No saved turns yet.")).toBeTruthy();
    });
  });

  it("removes an individual history entry from the history dialog", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("RemoveHistoryCard"));
    });

    await user.type(
      screen.getByPlaceholderText("Describe the change you want Codex to make."),
      "Delete just this turn",
    );
    await user.click(screen.getByRole("button", { name: "Send To Codex" }));

    act(() => {
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.started",
            threadId: "thread-remove",
            turnId: "turn-remove",
            selection: {
              componentName: "RemoveHistoryCard",
              selector: "#removehistorycard",
              htmlPreview: "<button>RemoveHistoryCard</button>",
              stackString: "RemoveHistoryCard > Button",
              stack: [],
              styles: "display:inline-flex;",
              source: {
                fileName: "/tmp/RemoveHistoryCard.tsx",
                lineNumber: 10,
                columnNumber: 3
              },
              fiberId: 1,
              isReactComponent: true
            }
          })
        }),
      );
      MockSocket.instances[0]?.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "turn.completed",
            threadId: "thread-remove",
            turnId: "turn-remove"
          })
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Done")).toBeTruthy();
    });
    await flushPersistence();

    firstRender.unmount();

    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await openHistoryFromLauncherMenu(user);
    await waitFor(() => {
      expect(screen.queryByText("Loading history…")).toBeNull();
    });

    expect(screen.getAllByText("Delete just this turn").length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole("button", { name: "Remove history entry for RemoveHistoryCard" }),
    );

    await waitFor(() => {
      expect(screen.getByText("No saved turns yet.")).toBeTruthy();
    });

    document.body.innerHTML = "";

    render(
      <CodexGrabProvider bridgeUrl="ws://127.0.0.1:4321" token="secret">
        <CodexGrabOverlay />
      </CodexGrabProvider>,
    );

    await openHistoryFromLauncherMenu(user);
    await waitFor(() => {
      expect(screen.queryByText("Loading history…")).toBeNull();
    });
    expect(screen.getByText("No saved turns yet.")).toBeTruthy();
  });
});
