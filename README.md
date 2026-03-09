# codex-grab

`codex-grab` is a dev-only toolkit for selecting rendered React components in the browser, attaching small inline Codex widgets next to them, sending edit prompts, and watching streamed status updates while your app refreshes through its normal HMR / Fast Refresh loop.

## Packages

- `@codex-grab/core`: DOM selection, React context capture, serialization, and shared bridge message types.
- `@codex-grab/react`: provider, overlay, pinned widgets, and hooks for mounting the browser UI in a React app.
- `@codex-grab/demo-shell`: shared routed demo UI used by the manual Vite demo and the promo video workspace.
- `@codex-grab/bridge`: localhost WebSocket sidecar that manages `codex app-server` and streams stable browser events.
- `demo-vite`: reference app for manual testing and Playwright smoke checks.
- `promo-remotion`: scripted Remotion promo workspace that drives the real overlay with deterministic mock bridge events.

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

`npm run build` runs the workspace builds in dependency order: `@codex-grab/core`, `@codex-grab/react`, `@codex-grab/demo-shell`, `@codex-grab/bridge`, `demo-vite`, then `promo-remotion`.

Useful dev commands:

```bash
npm run dev:demo
npm run dev:bridge
npm run dev:promo
npm run stage:promo
npm run render:promo
npm run dev:all
```

`@codex-grab/bridge` runs from `dist`, so if you change bridge source and are running the built CLI manually, rebuild before restarting it.

`npm run dev:all` is the one-command local demo launcher. It builds the bridge, starts the bridge on `127.0.0.1:4318`, starts the routed Vite demo on `127.0.0.1:5173`, and shuts both down together when you stop the process.

Optional environment overrides:

```bash
CODEX_GRAB_CWD=/absolute/path/to/workspace \
CODEX_GRAB_TOKEN=dev-token \
CODEX_GRAB_BRIDGE_PORT=4318 \
CODEX_GRAB_DEMO_HOST=127.0.0.1 \
CODEX_GRAB_DEMO_PORT=5173 \
CODEX_GRAB_ALLOWED_ORIGIN=http://127.0.0.1:5173 \
npm run dev:all
```

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
      viewId={`${window.location.pathname}${window.location.search}${window.location.hash}`}
      persistWidgets
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
4. Optionally attach a screenshot of the selected UI region before sending the prompt.
5. Press `Enter` to submit. Press `Shift+Enter` for a newline.
6. After submit, the widget collapses into a small live status chip unless you click it again.
7. While Codex runs, the chip streams short status text inline.
8. When finished, the chip stays compact and shows `Done` with a green dot.
9. If Codex requests approval for file writes, approve or decline from the widget.

You can create multiple widgets at once by selecting multiple areas. Each widget maintains its own prompt, session state, streamed output, approvals, model choice, and pin position.

## Route-aware widgets

- `CodexGrabProvider` accepts `viewId?: string`.
- If you do not pass one, `codex-grab` defaults to `pathname + search + hash`.
- Widgets are persisted in IndexedDB with their `viewId`, so route-local widgets disappear when you navigate away and remount when you return to the same view.
- When a persisted widget remounts, `codex-grab` re-queries the stored selector and verifies the React component name and source before showing the widget again.
- If the selector no longer matches the same component, the widget stays persisted but hidden until that target comes back or the user clears saved widgets.
- Dragged widgets keep their manual page anchor when they remount. Untouched widgets re-anchor beside the selected element.

## Overlay behavior

- The picker launcher can be dragged between corners.
- Right-click the launcher to open the launcher menu.
- The launcher menu exposes appearance switching, browser-local turn history, clear-saved-widgets, and hide-for-session.
- Clicking a compact widget expands it.
- Clicking away clears focus and collapses expanded widgets back into the background.
- New widgets autofocus once, but they do not permanently steal active focus from other widgets.

## Widget behavior

- Widgets are pinned next to the selected element when created.
- Dragging a widget moves it to a new page position and it stays there while scrolling.
- Idle widgets start in a compact composer state.
- Running and completed widgets prefer the compact chip form when unfocused.
- Expanded widgets expose more detail: selection metadata, model selection, reasoning effort, prompt editing, plan updates, reasoning summary, command output, diff view, recent events, theme toggle, and picker shortcut settings.
- Widgets can optionally capture a screenshot of the selected DOM region and send it to Codex as extra visual context.

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
- Theme switching is available from the launcher right-click menu.
- The launcher, widgets, popovers, diff view, and compact chips all switch together.

## Promo Video Workspace

- `promo-remotion` uses the real `CodexGrabProvider`, `CodexGrabOverlay`, and shared routed demo shell.
- The workspace installs a promo-only `WebSocket` shim for `ws://promo-bridge` so the video can replay deterministic bridge events without a live Codex session.
- `npm run dev:promo` opens Remotion Studio for the scripted promo composition.
- `npm run stage:promo` opens a Vite staging app with a scrubber for scene iteration outside the final render flow.
- `npm run render:promo` renders the main promo composition to `promo-remotion/out/codex-grab-promo.mp4`.

## Diffs

- Expanded widgets render unified diffs with colored formatting.
- The diff view is read-only in the current UI.

## History

- Turn history is persisted locally in the browser with IndexedDB.
- History is scoped to the current browser profile and origin.
- Reloading the page does not recreate old live widgets, but saved turns remain available from the launcher menu.
- The history dialog shows prompt, selection, model, status, reasoning summary, command output, diff, approvals, and stored run metadata.
- History can be cleared manually from the history dialog.
- If IndexedDB is unavailable, the live widget flow still works and the history view shows a non-blocking unavailable state.

## Widget persistence and refresh restore

- Widget persistence is enabled by default when the provider is enabled, and can be disabled with `persistWidgets={false}`.
- Persisted widgets are stored locally in IndexedDB alongside turn history.
- A full page refresh restores widgets for the current view from IndexedDB.
- Running widgets try to resume their bridge session automatically after refresh.
- The bridge keeps disconnected sessions resumable for 10 minutes. After that TTL, restored widgets keep their last known output but the old run is marked as no longer resumable.
- Clearing saved widgets removes persisted live widget state without deleting turn history.

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

Protocol notes:

- `session.ping` accepts optional `resumeSessionId`
- `session.started` includes `resumed: boolean`

## Notes

- `codex-grab` is development-only and should not be mounted in production.
- The bridge binds to `127.0.0.1` / `localhost` only.
- The current provider is Codex app-server only.
- Live UI updates depend on your app's normal HMR / Fast Refresh behavior after approved edits are written.
- Non-React DOM nodes are treated as unsupported selections.
- `demo-vite` now includes a routed example using `react-router-dom` to show view-aware widget persistence and refresh restore behavior.
