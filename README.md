# codex-grab

`codex-grab` is a dev-only toolkit for selecting rendered React components in the browser, attaching small inline Codex widgets next to them, sending edit prompts, and watching streamed status updates while your app refreshes through its normal HMR / Fast Refresh loop.

## Packages

- `@codex-grab/core`: DOM selection, React context capture, serialization, and shared bridge message types.
- `@codex-grab/react`: provider, overlay, pinned widgets, and hooks for mounting the browser UI in a React app.
- `@codex-grab/bridge`: localhost WebSocket sidecar that manages `codex app-server` and streams stable browser events.
- `demo-vite`: reference app for manual testing and Playwright smoke checks.

## Requirements

- Node.js with `npm`
- Codex CLI with app-server support. The bridge currently enforces `codex-cli >= 0.108.0`.
- An authenticated Codex session. Run [`codex login`](https://developers.openai.com/codex/) before starting the bridge.

## Workspace commands

From the repo root:

```bash
npm install
npm run build
npm run check
npm test
```

Useful dev commands:

```bash
npm run dev:demo
npm run dev:bridge
```

`@codex-grab/bridge` runs from `dist`, so if you change bridge source and are running the built CLI manually, rebuild before restarting it.

## Quickstart

Start the bridge:

```bash
node packages/bridge/dist/cli.js dev \
  --cwd /absolute/path/to/your/react/app \
  --port 4318 \
  --token dev-token \
  --allowed-origin http://127.0.0.1:5173
```

Mount the provider and overlay in your app:

```tsx
import { CodexGrabOverlay, CodexGrabProvider } from "@codex-grab/react";

export function AppShell() {
  return (
    <CodexGrabProvider
      bridgeUrl="ws://127.0.0.1:4318"
      token="dev-token"
      enabled={import.meta.env.DEV}
    >
      <App />
      <CodexGrabOverlay />
    </CodexGrabProvider>
  );
}
```

Run the demo app:

```bash
npm run dev -w demo-vite -- --host 127.0.0.1 --port 5173
```

Then open `http://127.0.0.1:5173`.

## Browser workflow

1. Use the floating circular picker button to enter selection mode.
2. Click a React-owned element in the page.
3. A pinned widget appears beside that element and focuses the prompt automatically.
4. Press `Enter` to submit. Press `Shift+Enter` for a newline.
5. After submit, the widget collapses into a small live status chip unless you click it again.
6. While Codex runs, the chip streams short status text inline.
7. When finished, the chip stays compact and shows `Done` with a green dot.
8. If Codex requests approval for file writes, approve or decline from the widget.

You can create multiple widgets at once by selecting multiple areas. Each widget maintains its own prompt, session state, streamed output, approvals, model choice, and pin position.

## Overlay behavior

- The picker launcher can be dragged between corners.
- Right-click the launcher to hide the overlay for the current browser session.
- Clicking a compact widget expands it.
- Clicking away clears focus and collapses expanded widgets back into the background.
- New widgets autofocus once, but they do not permanently steal active focus from other widgets.

## Widget behavior

- Widgets are pinned next to the selected element when created.
- Dragging a widget moves it to a new page position and it stays there while scrolling.
- Idle widgets start in a compact composer state.
- Running and completed widgets prefer the compact chip form when unfocused.
- Expanded widgets expose more detail: selection metadata, model selection, reasoning effort, prompt editing, plan updates, reasoning summary, command output, diff view, recent events, theme toggle, and picker shortcut settings.

## Models and thinking

Each widget has its own:

- model selection
- reasoning effort selection

The selected model is persisted in `localStorage` and reused for new widgets until changed.

The bridge reads available models from Codex app-server `model/list` and passes the selected `model` and `effort` through when starting turns.

## Keyboard shortcuts

- The picker shortcut defaults to `Command + C` on Mac-style keyboards.
- Shortcut capture ignores typing inside editable inputs and text selection cases.
- Shortcut settings live inside the expanded widget menu.

## Theme

- `codex-grab` ships with dark and light themes.
- Theme switching is available from the widget menu.
- The launcher, widgets, popovers, diff view, and compact chips all switch together.

## Diffs

- Expanded widgets render unified diffs with colored formatting.
- The diff view is read-only in the current UI.

## Bridge protocol

Browser requests:

- `session.ping`
- `select.submitPrompt`
- `approval.respond`
- `turn.interrupt`

Browser events:

- `session.started`
- `selection.accepted`
- `turn.started`
- `reasoning.summary.delta`
- `plan.updated`
- `command.output.delta`
- `diff.updated`
- `approval.requested`
- `approval.resolved`
- `turn.completed`
- `turn.failed`
- `turn.cancelled`

## Notes

- `codex-grab` is development-only and should not be mounted in production.
- The bridge binds to `127.0.0.1` / `localhost` only.
- The current provider is Codex app-server only.
- Live UI updates depend on your app's normal HMR / Fast Refresh behavior after approved edits are written.
- Non-React DOM nodes are treated as unsupported selections.
