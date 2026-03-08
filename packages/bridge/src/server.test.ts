import WebSocket from "ws";
import { CodexGrabBridgeServer } from "./server.js";

const waitForOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });

const waitForClose = (socket: WebSocket) =>
  new Promise<number>((resolve) => {
    socket.once("close", (code) => resolve(code));
  });

const waitForMessage = (socket: WebSocket) =>
  new Promise<unknown>((resolve) => {
    socket.once("message", (raw) => resolve(JSON.parse(String(raw))));
  });

describe("CodexGrabBridgeServer security", () => {
  it("rejects non-local binding configuration", () => {
    expect(
      () =>
        new CodexGrabBridgeServer({
          host: "0.0.0.0",
          port: 4322,
          cwd: "/repo",
          token: "secret",
          allowedOrigins: [],
          provider: {
            getCodexVersion: () => "0.108.0",
            listModels: async () => [],
            submitPrompt: async () => undefined,
            respondToApproval: async () => undefined,
            interrupt: async () => undefined,
            revertDiff: async () => undefined,
            closeSession: async () => undefined,
            dispose: async () => undefined
          }
        }),
    ).toThrow("127.0.0.1");
  });

  it("rejects bad tokens and disallowed origins", async () => {
    const provider = {
      getCodexVersion: () => "0.108.0",
      listModels: async () => [],
      submitPrompt: async () => undefined,
      respondToApproval: async () => undefined,
      interrupt: async () => undefined,
      revertDiff: async () => undefined,
      closeSession: async () => undefined,
      dispose: async () => undefined
    };

    const server = new CodexGrabBridgeServer({
      port: 4323,
      cwd: "/repo",
      token: "secret",
      allowedOrigins: ["http://127.0.0.1:5173"],
      provider
    });

    const badOrigin = new WebSocket(server.address, {
      headers: { Origin: "http://localhost:3000" }
    });
    await waitForOpen(badOrigin);
    await expect(waitForClose(badOrigin)).resolves.toBe(1008);

    const badToken = new WebSocket(server.address, {
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    await waitForOpen(badToken);

    const closePromise = waitForClose(badToken);
    badToken.send(JSON.stringify({ type: "session.ping", token: "wrong" }));
    await expect(closePromise).resolves.toBe(1008);

    await server.close();
  });

  it("reuses resumable sessions and expires them after the ttl", async () => {
    const provider = {
      getCodexVersion: () => "0.108.0",
      listModels: async () => [],
      submitPrompt: async () => undefined,
      respondToApproval: async () => undefined,
      interrupt: async () => undefined,
      revertDiff: async () => undefined,
      closeSession: vi.fn(async () => undefined),
      dispose: async () => undefined
    };

    const server = new CodexGrabBridgeServer({
      port: 4324,
      cwd: "/repo",
      token: "secret",
      allowedOrigins: ["http://127.0.0.1:5173"],
      provider,
      sessionTtlMs: 20
    });

    const initial = new WebSocket(server.address, {
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    await waitForOpen(initial);
    const initialMessage = waitForMessage(initial);
    initial.send(JSON.stringify({ type: "session.ping", token: "secret" }));
    const started = (await initialMessage) as { sessionId: string; resumed: boolean };
    expect(started).toEqual(expect.objectContaining({ resumed: false }));

    initial.close();
    await waitForClose(initial);
    expect(provider.closeSession).not.toHaveBeenCalled();

    const resumed = new WebSocket(server.address, {
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    await waitForOpen(resumed);
    const resumedMessage = waitForMessage(resumed);
    resumed.send(
      JSON.stringify({
        type: "session.ping",
        token: "secret",
        resumeSessionId: started.sessionId
      }),
    );
    const resumedStarted = (await resumedMessage) as { sessionId: string; resumed: boolean };
    expect(resumedStarted).toEqual(
      expect.objectContaining({
        sessionId: started.sessionId,
        resumed: true
      }),
    );

    resumed.close();
    await waitForClose(resumed);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(provider.closeSession).toHaveBeenCalledWith(started.sessionId);

    await server.close();
  });
});
