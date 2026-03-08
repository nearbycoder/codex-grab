import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CodexGrabOverlay, CodexGrabProvider } from "@codex-grab/react";
const appShellStyle = {
    minHeight: "100vh",
    padding: "28px 24px 96px",
    background: "radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 30%), radial-gradient(circle at top right, rgba(244, 114, 182, 0.12), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #edf6ff 100%)",
    color: "#0f172a",
    fontFamily: "\"Iowan Old Style\", Georgia, serif"
};
const navShellStyle = {
    maxWidth: 1120,
    margin: "0 auto 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
};
const navGroupStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
};
const panelStyle = {
    maxWidth: 1120,
    margin: "0 auto",
    display: "grid",
    gap: 22
};
const heroCardStyle = {
    padding: "32px",
    borderRadius: 30,
    background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 26px 72px rgba(15, 23, 42, 0.16)"
};
const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 18
};
const featureCardStyle = {
    borderRadius: 28,
    padding: 28,
    background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(244,247,251,0.94))",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.12)",
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
    gap: 12
};
const badgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(15, 23, 42, 0.05)",
    color: "#334155",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12
};
const routeLinkBaseStyle = {
    textDecoration: "none",
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "rgba(255,255,255,0.8)",
    color: "#0f172a",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13
};
const buttonStyle = {
    appearance: "none",
    border: "none",
    borderRadius: 999,
    padding: "14px 18px",
    fontSize: 15,
    cursor: "pointer"
};
function AccentLine() {
    return (_jsx("span", { "aria-hidden": "true", style: {
            display: "block",
            width: 74,
            height: 5,
            borderRadius: 999,
            background: "linear-gradient(90deg, #0f172a, #475569)"
        } }));
}
function FeatureCard({ title, children, accent }) {
    const [hovered, setHovered] = useState(false);
    return (_jsxs("article", { tabIndex: 0, style: {
            ...featureCardStyle,
            transform: hovered ? "translateY(-4px)" : "translateY(0px)",
            transition: "transform 180ms ease, box-shadow 180ms ease",
            boxShadow: hovered
                ? "0 24px 58px rgba(15, 23, 42, 0.18)"
                : featureCardStyle.boxShadow
        }, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), onFocus: () => setHovered(true), onBlur: () => setHovered(false), children: [_jsx("span", { "aria-hidden": "true", style: {
                    width: 60,
                    height: 4,
                    borderRadius: 999,
                    background: accent
                } }), _jsx("h3", { style: { margin: 0, fontSize: 24 }, children: title }), _jsx("div", { style: { color: "#475569", lineHeight: 1.7, fontSize: 16 }, children: children })] }));
}
function RouteLink({ to, label, currentPath }) {
    const active = currentPath === to;
    return (_jsx(Link, { to: to, style: {
            ...routeLinkBaseStyle,
            background: active ? "#0f172a" : routeLinkBaseStyle.background,
            color: active ? "#f8fafc" : "#0f172a",
            boxShadow: active ? "0 10px 24px rgba(15, 23, 42, 0.22)" : "none"
        }, children: label }));
}
function LandingView() {
    return (_jsxs(_Fragment, { children: [_jsx("section", { style: heroCardStyle, children: _jsxs("div", { style: { display: "grid", gap: 20, maxWidth: 760 }, children: [_jsx("div", { style: { ...badgeStyle, width: "fit-content" }, children: "Route A \u00B7 marketing" }), _jsx(AccentLine, {}), _jsx("h1", { style: { margin: 0, fontSize: "clamp(3rem, 7vw, 5.25rem)", lineHeight: 0.92 }, children: "Pick a component here, switch routes, then come back and watch the widget return." }), _jsx("p", { style: { margin: 0, fontSize: 20, color: "#334155", lineHeight: 1.55 }, children: "This route is meant to show element-anchored widgets. Select the headline, CTA, or one of the cards below, navigate to the settings route, and then return to confirm the widget remounts on the same view." }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("button", { type: "button", style: {
                                        ...buttonStyle,
                                        background: "#0f172a",
                                        color: "#f8fafc"
                                    }, children: "Route A CTA" }), _jsx("span", { style: { color: "#475569" }, children: "Refresh the page here and the current route's widgets should restore too." })] })] }) }), _jsxs("section", { style: gridStyle, children: [_jsx(FeatureCard, { title: "Select inline", accent: "linear-gradient(90deg, #0f172a, #1d4ed8)", children: "Hover any React-owned card or heading, click it, and a compact Codex widget appears beside that content." }), _jsx(FeatureCard, { title: "Navigate away", accent: "linear-gradient(90deg, #475569, #0891b2)", children: "Widgets created on this route stay persisted but unmount visually when the active view changes." }), _jsx(FeatureCard, { title: "Come back", accent: "linear-gradient(90deg, #0369a1, #38bdf8)", children: "When you return to this view, `codex-grab` re-queries the selector, verifies the component match, and remounts the widget if the target is present." })] })] }));
}
function SettingsView() {
    const statusRows = useMemo(() => [
        {
            title: "Resume policy",
            body: "Running widgets try to reconnect to the same bridge session for 10 minutes after a refresh."
        },
        {
            title: "Widget persistence",
            body: "Widgets are stored locally, scoped by origin plus view id, and reattached only when the selector resolves to the right component."
        },
        {
            title: "History",
            body: "Turn history stays archival and read-only. Refresh restore does not reopen old work as active widgets unless it was already live."
        }
    ], []);
    return (_jsxs(_Fragment, { children: [_jsx("section", { style: heroCardStyle, children: _jsxs("div", { style: { display: "grid", gap: 20, maxWidth: 780 }, children: [_jsx("div", { style: { ...badgeStyle, width: "fit-content" }, children: "Route B \u00B7 settings" }), _jsx(AccentLine, {}), _jsx("h2", { style: { margin: 0, fontSize: "clamp(2.4rem, 6vw, 4rem)", lineHeight: 0.98 }, children: "A second view with different targets to prove route-aware unmount and remount." }), _jsx("p", { style: { margin: 0, fontSize: 19, color: "#334155", lineHeight: 1.6 }, children: "Create widgets here as well. Route A widgets should disappear while you are on this screen, but background runs can keep streaming through persistence and bridge resume." })] }) }), _jsx("section", { style: gridStyle, children: statusRows.map((row) => (_jsx(FeatureCard, { title: row.title, accent: "linear-gradient(90deg, #111827, #6b7280)", children: row.body }, row.title))) })] }));
}
function RoutedDemoShell() {
    const location = useLocation();
    const bridgeUrl = import.meta.env.VITE_CODEX_GRAB_BRIDGE_URL ?? "ws://127.0.0.1:4318";
    const token = import.meta.env.VITE_CODEX_GRAB_TOKEN ?? "dev-token";
    const currentViewId = `${location.pathname}${location.search}${location.hash}`;
    return (_jsxs(CodexGrabProvider, { bridgeUrl: bridgeUrl, token: token, enabled: true, viewId: currentViewId, persistWidgets: true, children: [_jsxs("main", { style: appShellStyle, children: [_jsxs("nav", { style: navShellStyle, children: [_jsxs("div", { style: navGroupStyle, children: [_jsx("div", { style: { ...badgeStyle, background: "rgba(15, 23, 42, 0.08)" }, children: "codex-grab routed demo" }), _jsx(RouteLink, { to: "/landing", label: "Route A", currentPath: location.pathname }), _jsx(RouteLink, { to: "/settings", label: "Route B", currentPath: location.pathname })] }), _jsxs("div", { style: { ...badgeStyle, background: "rgba(15, 23, 42, 0.04)" }, children: ["viewId: ", currentViewId] })] }), _jsx("div", { style: panelStyle, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/landing", replace: true }) }), _jsx(Route, { path: "/landing", element: _jsx(LandingView, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsView, {}) })] }) })] }), _jsx(CodexGrabOverlay, {})] }));
}
export const App = () => (_jsx(BrowserRouter, { children: _jsx(RoutedDemoShell, {}) }));
//# sourceMappingURL=App.js.map