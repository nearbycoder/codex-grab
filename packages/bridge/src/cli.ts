#!/usr/bin/env node
import path from "node:path";
import { CodexAppServerClient } from "./codex-client.js";
import { CodexAgentProvider } from "./provider.js";
import { CodexGrabBridgeServer } from "./server.js";

interface CliOptions {
  cwd: string;
  port: number;
  token: string;
  allowedOrigins: string[];
}

const parseArgs = (argv: string[]): CliOptions => {
  if (argv[0] !== "dev") {
    throw new Error(
      "Usage: codex-grab dev --cwd <path> --port <number> --token <value> [--allowed-origin <origin>]",
    );
  }

  const options: CliOptions = {
    cwd: process.cwd(),
    port: 4318,
    token: "",
    allowedOrigins: []
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    switch (arg) {
      case "--cwd":
        options.cwd = path.resolve(value);
        index += 1;
        break;
      case "--port":
        options.port = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--token":
        options.token = value;
        index += 1;
        break;
      case "--allowed-origin":
        options.allowedOrigins.push(value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.token) {
    throw new Error("Missing required --token argument.");
  }

  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const client = new CodexAppServerClient({
    cwd: options.cwd
  });
  await client.start();

  const server = new CodexGrabBridgeServer({
    port: options.port,
    cwd: options.cwd,
    token: options.token,
    allowedOrigins: options.allowedOrigins,
    provider: new CodexAgentProvider(client, options.cwd, (sessionId, event) => {
      server.send(sessionId, event);
    })
  });

  process.stdout.write(`codex-grab bridge listening on ${server.address}\n`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
