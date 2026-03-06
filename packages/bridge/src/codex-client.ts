import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import type { Readable } from "node:stream";
import WebSocket from "ws";
import { MIN_CODEX_VERSION, isSupportedCodexVersion } from "./version.js";

type JsonRpcId = string | number;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export interface ChildProcessHandle {
  stderr: Readable;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: "exit", listener: (code: number | null) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export interface SocketHandle {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (raw: unknown) => void): this;
}

type VersionReader = (codexPath: string) => Promise<string>;
type AppServerLauncher = (
  codexPath: string,
  cwd: string,
  port: number,
) => ChildProcessHandle;
type SocketConnector = (port: number) => Promise<SocketHandle>;

export interface CodexClientOptions {
  cwd: string;
  codexPath?: string;
  versionReader?: VersionReader;
  appServerLauncher?: AppServerLauncher;
  socketConnector?: SocketConnector;
}

export interface CodexMetadata {
  version: string;
  accountEmail: string | null;
}

export type CodexNotificationHandler = (message: JsonRpcNotification) => void;
export type CodexServerRequestHandler = (message: JsonRpcRequest) => void;

const getFreePort = async (): Promise<number> => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to allocate a local port for codex app-server.");
  }

  const { port } = address;
  server.close();
  return port;
};

const parseCodexVersion = (raw: string): string => raw.trim().replace(/^codex-cli\s+/i, "");

const execVersion = async (codexPath: string): Promise<string> => {
  const child = spawn(codexPath, ["--version"]);
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  const spawnError = once(child, "error").then(([error]) => {
    throw error;
  });
  child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
  const [code] = (await Promise.race([once(child, "exit"), spawnError])) as [number | null];

  if (code !== 0) {
    throw new Error(Buffer.concat(errors).toString("utf8") || "Failed to read Codex version.");
  }

  return parseCodexVersion(Buffer.concat(chunks).toString("utf8"));
};

const defaultLaunchAppServer: AppServerLauncher = (codexPath, cwd, port) =>
  spawn(codexPath, ["app-server", "--listen", `ws://127.0.0.1:${port}`], {
    cwd,
    stdio: "pipe"
  });

const defaultSocketConnector: SocketConnector = async (port) => {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      await once(socket, "open");
      return socket;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error("Timed out waiting for codex app-server WebSocket.");
};

export class CodexAppServerClient {
  private readonly cwd: string;

  private readonly codexPath: string;

  private readonly versionReader: VersionReader;

  private readonly appServerLauncher: AppServerLauncher;

  private readonly socketConnector: SocketConnector;

  private readonly notificationHandlers = new Set<CodexNotificationHandler>();

  private readonly serverRequestHandlers = new Set<CodexServerRequestHandler>();

  private readonly pending = new Map<JsonRpcId, PendingRequest>();

  private metadata: CodexMetadata | null = null;

  private ws: SocketHandle | null = null;

  private child: ChildProcessHandle | null = null;

  private requestId = 1;

  constructor(options: CodexClientOptions) {
    this.cwd = options.cwd;
    this.codexPath = options.codexPath ?? "codex";
    this.versionReader = options.versionReader ?? execVersion;
    this.appServerLauncher = options.appServerLauncher ?? defaultLaunchAppServer;
    this.socketConnector = options.socketConnector ?? defaultSocketConnector;
  }

  getMetadata(): CodexMetadata {
    if (!this.metadata) {
      throw new Error("Codex app-server client has not been started.");
    }

    return this.metadata;
  }

  onNotification(handler: CodexNotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onServerRequest(handler: CodexServerRequestHandler): () => void {
    this.serverRequestHandlers.add(handler);
    return () => this.serverRequestHandlers.delete(handler);
  }

  async start(): Promise<void> {
    const version = await this.versionReader(this.codexPath).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Failed to run Codex CLI version check.";
      throw new Error(message.includes("ENOENT") ? "Codex CLI was not found on PATH." : message);
    });
    if (!isSupportedCodexVersion(version)) {
      throw new Error(
        `Codex CLI ${version} is unsupported. codex-grab requires ${MIN_CODEX_VERSION} or newer.`,
      );
    }

    const port = await getFreePort();
    this.child = this.appServerLauncher(this.codexPath, this.cwd, port);

    const stderr: Buffer[] = [];
    this.child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    const childError = new Promise<never>((_, reject) => {
      this.child?.on("error", (error) => reject(error));
    });
    this.child.on("exit", (code) => {
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8");
        for (const pending of this.pending.values()) {
          pending.reject(new Error(message || `codex app-server exited with code ${code}.`));
        }
        this.pending.clear();
      }
    });

    this.ws = await Promise.race([this.socketConnector(port), childError]);
    this.ws.on("message", (raw) => this.handleMessage(String(raw)));

    await this.request("initialize", {
      clientInfo: {
        name: "codex-grab",
        version: "0.1.0"
      },
      capabilities: null
    });
    this.notify("initialized");

    const account = (await this.request("account/read", {})) as {
      account?: { email?: string };
      requiresOpenaiAuth?: boolean;
    };

    if (!account.account?.email) {
      throw new Error("Codex is not authenticated. Run `codex login` before starting codex-grab.");
    }

    this.metadata = {
      version,
      accountEmail: account.account.email ?? null
    };
  }

  async dispose(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.child?.kill();
    this.child = null;
    this.pending.clear();
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }

    const id = this.requestId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
    });

    this.ws.send(JSON.stringify(payload));
    return response;
  }

  respond(id: JsonRpcId, result: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }

    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result
      }),
    );
  }

  private notify(method: string, params?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }

    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params
      }),
    );
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as JsonRpcResponse | JsonRpcRequest | JsonRpcNotification;

    if ("id" in message && !("method" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (!("method" in message)) {
      return;
    }

    if ("id" in message) {
      for (const handler of this.serverRequestHandlers) {
        handler(message);
      }
      return;
    }

    for (const handler of this.notificationHandlers) {
      handler(message);
    }
  }
}
