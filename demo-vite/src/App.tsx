import { BrowserRouter } from "react-router-dom";
import { CodexGrabDemoShell } from "@codex-grab/demo-shell";

export const App = () => {
  const bridgeUrl = import.meta.env.VITE_CODEX_GRAB_BRIDGE_URL ?? "ws://127.0.0.1:4318";
  const token = import.meta.env.VITE_CODEX_GRAB_TOKEN ?? "dev-token";

  return (
    <BrowserRouter>
      <CodexGrabDemoShell bridgeUrl={bridgeUrl} token={token} />
    </BrowserRouter>
  );
};
