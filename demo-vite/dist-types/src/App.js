import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { CodexGrabOverlay, CodexGrabProvider } from "@codex-grab/react";
const cardStyle = {
    borderRadius: 28,
    padding: "32px",
    // base tint keeps the cards colorful even under softer gradients
    backgroundColor: "#f7fbff",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.9))",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    minHeight: 230,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    position: "relative",
    overflow: "hidden",
    transition: "transform 200ms ease, box-shadow 200ms ease"
};
const cardHoverStyle = {
    transform: "translateY(-6px)",
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.25)"
};
const accentStyle = {
    height: 4,
    width: 64,
    borderRadius: 999,
    background: "linear-gradient(90deg, #34d399, #3b82f6)",
    marginBottom: 6,
    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.35)"
};
const titleStyle = {
    margin: 0,
    fontSize: 22,
    letterSpacing: "0.02em",
    color: "#0f172a"
};
const bodyStyle = {
    color: "#475569",
    lineHeight: 1.7,
    fontSize: 16,
    marginBottom: 0
};
function FeatureCard({ title, children }) {
    const [hovered, setHovered] = useState(false);
    return (_jsxs("article", { tabIndex: 0, style: { ...cardStyle, ...(hovered ? cardHoverStyle : {}) }, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), onFocus: () => setHovered(true), onBlur: () => setHovered(false), children: [_jsx("span", { style: accentStyle, "aria-hidden": "true" }), _jsx("h3", { style: titleStyle, children: title }), _jsx("div", { style: bodyStyle, children: children })] }));
}
function HeroButton() {
    return (_jsx("button", { style: {
            appearance: "none",
            border: "none",
            borderRadius: 999,
            padding: "14px 20px",
            background: "#2563eb",
            color: "white",
            fontSize: 16,
            cursor: "pointer"
        }, children: "Hello Word" }));
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
                                        color: "#0b6ef5"
                                    }, children: "codex-grab demo" }), _jsx("h1", { style: {
                                        fontSize: "clamp(3rem, 8vw, 5.5rem)",
                                        lineHeight: 0.94,
                                        margin: 0
                                    }, children: "Update a React component straight from the browser." }), _jsx("p", { style: { maxWidth: 680, fontSize: 20, color: "#334155", margin: 0 }, children: "Select a rendered component, send a prompt to Codex, review the live reasoning summary and diff, then approve the change and let Fast Refresh do the rest." }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center" }, children: [_jsx(HeroButton, {}), _jsx("span", { style: { color: "#475569" }, children: "Use the overlay in the bottom-right corner." })] })] }), _jsxs("section", { style: {
                                display: "flex",
                                flexDirection: "row",
                                flexWrap: "nowrap",
                                gap: 18,
                                justifyContent: "space-between",
                                alignItems: "stretch"
                            }, children: [_jsx(FeatureCard, { title: "Select", children: "Hover any React-owned element, inspect its stack and source, and pass that context to the bridge." }), _jsx(FeatureCard, { title: "Stream", children: "See plan updates, concise reasoning summaries, command activity, and the current diff streaming inline so you never lose the narrative while you edit." }), _jsxs(FeatureCard, { title: "What in the world", children: [_jsx("p", { style: { marginTop: 0 }, children: "The world feels wonderfully unpredictable today\u2014let\u2019s acknowledge that with a wink before diving into the next sprint." }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsxs("p", { style: { margin: "4px 0" }, children: [_jsx("strong", { children: "Cheer:" }), " \u201CWhat in the world comes next? A bright, slightly confused cheer for the curious steps ahead.\u201D"] }), _jsxs("p", { style: { margin: "4px 0" }, children: [_jsx("strong", { children: "Mini-brief:" }), " Add a quick observational note that keeps the team smiling while tracking the plan\u2019s wild turns."] }), _jsxs("p", { style: { margin: "4px 0" }, children: [_jsx("strong", { children: "Adjectives:" }), " exuberant, speculative, grounded, ready-for-the-plot-twist."] })] })] })] })] }) }), _jsx(CodexGrabOverlay, {})] }));
};
//# sourceMappingURL=App.js.map