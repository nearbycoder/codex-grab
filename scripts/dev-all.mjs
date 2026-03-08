import { spawn } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const bridgePort = process.env.CODEX_GRAB_BRIDGE_PORT ?? "4318";
const demoPort = process.env.CODEX_GRAB_DEMO_PORT ?? "5173";
const demoHost = process.env.CODEX_GRAB_DEMO_HOST ?? "127.0.0.1";
const token = process.env.CODEX_GRAB_TOKEN ?? "dev-token";
const bridgeCwd = process.env.CODEX_GRAB_CWD ?? repoRoot;
const allowedOrigin =
  process.env.CODEX_GRAB_ALLOWED_ORIGIN ?? `http://${demoHost}:${demoPort}`;

function run(command, args, name) {
  return spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });
}

function terminate(child, signal = "SIGTERM") {
  if (!child.killed) {
    child.kill(signal);
  }
}

const bridgeBuild = run("npm", ["run", "build", "-w", "@codex-grab/bridge"], "bridge build");

bridgeBuild.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const bridge = run(
    "node",
    [
      "./packages/bridge/dist/cli.js",
      "dev",
      "--cwd",
      bridgeCwd,
      "--port",
      bridgePort,
      "--token",
      token,
      "--allowed-origin",
      allowedOrigin
    ],
    "bridge"
  );

  const demo = run(
    "npm",
    ["run", "dev", "-w", "demo-vite", "--", "--host", demoHost, "--port", demoPort],
    "demo"
  );

  let shuttingDown = false;

  function shutdown(signal = "SIGTERM") {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    terminate(bridge, signal);
    terminate(demo, signal);
  }

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  bridge.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });

  demo.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
});
