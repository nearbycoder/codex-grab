import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CodexAppServerClient } from "./codex-client.js";

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];

  send(data: string) {
    const payload = JSON.parse(data) as { id?: number; method?: string };
    this.sent.push(payload);

    if (payload.method === "initialize") {
      queueMicrotask(() => {
        this.emit("message", JSON.stringify({ id: payload.id, result: { userAgent: "fake" } }));
      });
    }

    if (payload.method === "account/read") {
      queueMicrotask(() => {
        this.emit("message", JSON.stringify({ id: payload.id, result: { account: null } }));
      });
    }
  }

  close() {
    this.readyState = 3;
  }
}

class FakeChild extends EventEmitter {
  stderr = new PassThrough();

  kill() {
    return true;
  }
}

describe("CodexAppServerClient startup smoke", () => {
  it("fails cleanly when the Codex binary is missing", async () => {
    const client = new CodexAppServerClient({
      cwd: "/repo",
      codexPath: "/definitely/missing/codex"
    });

    await expect(client.start()).rejects.toThrow(/Codex CLI was not found|spawn/i);
  });

  it("fails cleanly when launching app-server reports ENOENT", async () => {
    const child = new FakeChild();
    const client = new CodexAppServerClient({
      cwd: "/repo",
      versionReader: async () => "0.108.0",
      appServerLauncher: () => {
        queueMicrotask(() => {
          child.emit(
            "error",
            Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" }),
          );
        });
        return child;
      },
      socketConnector: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("Timed out waiting for codex app-server WebSocket.");
      }
    });

    await expect(client.start()).rejects.toThrow(/Codex CLI was not found on PATH/i);
  });

  it("rejects unsupported Codex versions before launching the app server", async () => {
    const launcher = vi.fn();
    const client = new CodexAppServerClient({
      cwd: "/repo",
      versionReader: async () => "0.1.0",
      appServerLauncher: launcher as never
    });

    await expect(client.start()).rejects.toThrow("unsupported");
    expect(launcher).not.toHaveBeenCalled();
  });

  it("fails when Codex is not authenticated", async () => {
    const socket = new FakeSocket();
    const child = new FakeChild();
    const client = new CodexAppServerClient({
      cwd: "/repo",
      versionReader: async () => "0.108.0",
      appServerLauncher: () => child,
      socketConnector: async () => socket
    });

    await expect(client.start()).rejects.toThrow(/not authenticated/i);
  });
});
