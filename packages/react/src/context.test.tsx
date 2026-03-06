import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodexGrabOverlay } from "./overlay.js";
import { CodexGrabProvider } from "./context.js";
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
    }
  };
});

class MockSocket {
  static instances: MockSocket[] = [];
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
    const message = JSON.parse(data) as { type?: string; token?: string };
    if (message.type === "session.ping" && message.token === "secret") {
      this.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            event: "session.started",
            sessionId: "session",
            bridgeVersion: "0.1.0",
            codexVersion: "0.108.0",
            cwd: "/tmp",
            models: [
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
                  }
                ]
              },
              {
                id: "model-2",
                model: "gpt-5.1-codex",
                displayName: "gpt-5.1-codex",
                description: "Faster coding model for lighter changes.",
                hidden: false,
                isDefault: false,
                defaultReasoningEffort: "low",
                supportedReasoningEfforts: [
                  {
                    effort: "low",
                    description: "Fast responses with lighter reasoning"
                  },
                  {
                    effort: "medium",
                    description: "Balanced speed and reasoning depth"
                  }
                ]
              }
            ],
            defaultModel: "gpt-5.3-codex",
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

describe("CodexGrabProvider", () => {
  const createSelection = (name: string): GrabElementContext => {
    const element = document.createElement("button");
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
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    installMockLocalStorage();
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
    expect(await screen.findByDisplayValue("gpt-5.3-codex")).toBeTruthy();
    expect(await screen.findByDisplayValue("medium")).toBeTruthy();
    expect(MockSocket.instances[0]?.sent).toContain(
      JSON.stringify({ type: "session.ping", token: "secret" }),
    );
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

    await user.click(await screen.findByRole("button", { name: "Select area for codex-grab" }));
    await act(async () => {
      await selectorState.options?.onSelect(createSelection("FeatureCard"));
    });

    expect(screen.getAllByText("HeroCard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FeatureCard").length).toBeGreaterThan(0);

    const featureCardPanel = screen
      .getAllByText("FeatureCard")
      .map((node) => node.closest("aside"))
      .find(Boolean);

    expect(featureCardPanel).toBeTruthy();

    const featureCardScope = within(featureCardPanel as HTMLElement);
    await user.type(
      featureCardScope.getByPlaceholderText("Describe the change you want Codex to make."),
      "Change this to Welcome!",
    );
    await user.click(featureCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(
      MockSocket.instances[1]?.sent,
    ).toContain(
      JSON.stringify({
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
          model: "gpt-5.3-codex",
          effort: "medium"
        }
      }),
    );
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
    await user.click(await screen.findByRole("option", { name: /gpt-5\.1-codex/i }));
    await user.click(featureCardScope.getByRole("button", { name: "Choose thinking" }));
    await user.click(await screen.findByRole("option", { name: /low/i }));

    await user.type(
      featureCardScope.getByPlaceholderText("Describe the change you want Codex to make."),
      "Change this to Welcome!",
    );
    await user.click(featureCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(MockSocket.instances[0]?.sent).toContain(
      JSON.stringify({
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
          model: "gpt-5.1-codex",
          effort: "low"
        }
      }),
    );
  });

  it("reuses the stored model preference for new widgets", async () => {
    window.localStorage.setItem("codex-grab-selected-model", "gpt-5.1-codex");
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
      "gpt-5.1-codex",
    );
    expect(
      storedCardScope.getByRole("button", { name: "Choose thinking" }).textContent,
    ).toContain("low");

    await user.type(
      storedCardScope.getByPlaceholderText("Describe the change you want Codex to make."),
      "Use the stored model",
    );
    await user.click(storedCardScope.getByRole("button", { name: "Send To Codex" }));

    expect(MockSocket.instances[0]?.sent).toContain(
      JSON.stringify({
        type: "select.submitPrompt",
        prompt: "Use the stored model",
        selection: {
          componentName: "StoredCard",
          selector: "#storedcard",
          htmlPreview: "<button>StoredCard</button>",
          stackString: "StoredCard > Button",
          stack: [],
          styles: "display:inline-flex;",
          source: {
            fileName: "/tmp/StoredCard.tsx",
            lineNumber: 10,
            columnNumber: 3
          },
          fiberId: 1,
          isReactComponent: true
        },
        preferences: {
          model: "gpt-5.1-codex",
          effort: "low"
        }
      }),
    );
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
});
