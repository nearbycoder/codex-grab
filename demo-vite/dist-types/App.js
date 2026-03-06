import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CodexGrabOverlay, CodexGrabProvider } from "@codex-grab/react";
const cardStyle = {
    borderRadius: 24,
    padding: 24,
    background: "rgba(255,255,255,0.72)",
    boxShadow: "0 24px 64px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(255,255,255,0.65)"
};
function FeatureCard({ title, children }) {
    return (_jsxs("article", { style: cardStyle, children: [_jsx("h3", { style: { marginTop: 0 }, children: title }), _jsx("p", { style: { color: "#334155", marginBottom: 0 }, children: children })] }));
}
function HeroButton() {
    return (_jsx("button", { style: {
            appearance: "none",
            border: "none",
            borderRadius: 999,
            padding: "14px 20px",
            background: "#0f766e",
            color: "white",
            fontSize: 16,
            cursor: "pointer"
        }, children: "Ship the change" }));
}
export const App = () => {
    const bridgeUrl = import.meta.env.VITE_CODEX_GRAB_BRIDGE_URL ?? "ws://127.0.0.1:4318";
    const token = import.meta.env.VITE_CODEX_GRAB_TOKEN ?? "dev-token";
    return (_jsxs(CodexGrabProvider, { bridgeUrl: bridgeUrl, token: token, enabled: true, children: [_jsx("main", { style: {
                    minHeight: "100vh",
                    padding: "64px 24px 96px",
                    background: "radial-gradient(circle at top, rgba(13,148,136,0.16), transparent 36%), linear-gradient(180deg, #f8fafc 0%, #ecfeff 100%)",
                    color: "#0f172a",
                    fontFamily: "Georgia, 'Times New Roman', serif"
                }, children: _jsxs("div", { style: { maxWidth: 960, margin: "0 auto" }, children: [_jsxs("header", { style: {
                                display: "grid",
                                gap: 18,
                                padding: "48px 0"
                            }, children: [_jsx("div", { style: {
                                        textTransform: "uppercase",
                                        letterSpacing: "0.18em",
                                        fontSize: 12,
                                        color: "#0f766e"
                                    }, children: "codex-grab demo" }), _jsx("h1", { style: {
                                        fontSize: "clamp(3rem, 8vw, 5.5rem)",
                                        lineHeight: 0.94,
                                        margin: 0
                                    }, children: "Edit a React component straight from the browser." }), _jsx("p", { style: { maxWidth: 680, fontSize: 20, color: "#334155", margin: 0 }, children: "Select a rendered component, send a prompt to Codex, review the live reasoning summary and diff, then approve the change and let Fast Refresh do the rest." }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center" }, children: [_jsx(HeroButton, {}), _jsx("span", { style: { color: "#475569" }, children: "Use the overlay in the bottom-right corner." })] })] }), _jsxs("section", { style: {
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                                gap: 18
                            }, children: [_jsx(FeatureCard, { title: "Select", children: "Hover any React-owned element, inspect its stack and source, and pass that context to the bridge." }), _jsx(FeatureCard, { title: "Stream", children: "Watch plan updates, concise reasoning summaries, command activity, and the current diff stream inline." }), _jsx(FeatureCard, { title: "Approve", children: "Keep file writes behind an explicit review step so the dev loop stays fast without giving up control." })] })] }) }), _jsx(CodexGrabOverlay, {})] }));
};
//# sourceMappingURL=App.js.map