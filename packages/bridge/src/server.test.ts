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
});
