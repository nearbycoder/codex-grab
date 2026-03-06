import { randomUUID } from "node:crypto";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type {
  BridgeClientMessage,
  BridgeEvent,
  SerializedGrabElementContext
} from "@codex-grab/core";
import { BRIDGE_VERSION } from "./version.js";
import type { AgentProvider } from "./provider.js";

export interface BridgeServerOptions {
  host?: string;
  port: number;
  cwd: string;
  token: string;
  allowedOrigins: string[];
  provider: AgentProvider;
}

interface ClientSession {
  sessionId: string;
  authenticated: boolean;
}

const isLocalHost = (host: string): boolean => host === "127.0.0.1" || host === "localhost";

export class CodexGrabBridgeServer {
  private readonly server: WebSocketServer;

  private readonly clientSessions = new WeakMap<WebSocket, ClientSession>();

  constructor(private readonly options: BridgeServerOptions) {
    const host = options.host ?? "127.0.0.1";
    if (!isLocalHost(host)) {
      throw new Error("codex-grab bridge must bind to 127.0.0.1 or localhost only.");
    }

    this.server = new WebSocketServer({
      host,
      port: options.port
    });
    this.server.on("connection", (socket: WebSocket, request) => {
      const origin = request.headers.origin;
      if (
        options.allowedOrigins.length > 0 &&
        (!origin || !options.allowedOrigins.includes(origin))
      ) {
        socket.close(1008, "Origin not allowed.");
        return;
      }

      this.clientSessions.set(socket, {
        sessionId: randomUUID(),
        authenticated: false
      });

      socket.on("message", (raw: RawData) => {
        void this.handleMessage(socket, String(raw));
      });
      socket.on("close", () => {
        const session = this.clientSessions.get(socket);
        if (session) {
          void this.options.provider.closeSession(session.sessionId);
        }
      });
    });
  }

  get address(): string {
    return `ws://${this.options.host ?? "127.0.0.1"}:${this.options.port}`;
  }

  async close(): Promise<void> {
    for (const client of this.server.clients) {
      client.close();
    }
    await this.options.provider.dispose();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  send(sessionId: string, event: BridgeEvent): void {
    for (const client of this.server.clients) {
      const session = this.clientSessions.get(client);
      if (session?.sessionId === sessionId && client.readyState === client.OPEN) {
        client.send(JSON.stringify(event));
      }
    }
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const session = this.clientSessions.get(socket);
    if (!session) {
      socket.close(1011, "Missing session.");
      return;
    }

    let message: BridgeClientMessage;
    try {
      message = JSON.parse(raw) as BridgeClientMessage;
    } catch {
      socket.close(1003, "Invalid JSON payload.");
      return;
    }
    if (message.type === "session.ping") {
      if (message.token !== this.options.token) {
        socket.close(1008, "Invalid token.");
        return;
      }

      session.authenticated = true;
      const models = await this.options.provider.listModels();
      const defaultModel = models.find((model) => model.isDefault) ?? models[0] ?? null;
      this.send(session.sessionId, {
        event: "session.started",
        sessionId: session.sessionId,
        bridgeVersion: BRIDGE_VERSION,
        codexVersion: this.options.provider.getCodexVersion(),
        cwd: this.options.cwd,
        models,
        defaultModel: defaultModel?.model ?? null,
        defaultEffort: defaultModel?.defaultReasoningEffort ?? null
      });
      return;
    }

    if (!session.authenticated) {
      socket.close(1008, "Authenticate with session.ping before sending commands.");
      return;
    }

    switch (message.type) {
      case "select.submitPrompt":
        this.send(session.sessionId, {
          event: "selection.accepted",
          selection: message.selection
        });
        await this.options.provider.submitPrompt(
          session.sessionId,
          message.prompt,
          message.selection as SerializedGrabElementContext,
          message.preferences,
        );
        break;
      case "approval.respond":
        await this.options.provider.respondToApproval(
          session.sessionId,
          message.requestId,
          message.decision,
        );
        break;
      case "turn.interrupt":
        await this.options.provider.interrupt(
          session.sessionId,
          message.threadId,
          message.turnId,
        );
        break;
      case "diff.revert":
        try {
          await this.options.provider.revertDiff(session.sessionId, message.diff);
        } catch (error) {
          this.send(session.sessionId, {
            event: "diff.revert.failed",
            message: error instanceof Error ? error.message : "Failed to revert diff."
          });
        }
        break;
      default:
        break;
    }
  }
}
