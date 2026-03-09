import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation
} from "react-router-dom";
import { CodexGrabOverlay, CodexGrabProvider } from "@codex-grab/react";

const appShellStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "28px 24px 96px",
  background:
    "radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 30%), radial-gradient(circle at top right, rgba(244, 114, 182, 0.12), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #edf6ff 100%)",
  color: "#0f172a",
  fontFamily: '"Iowan Old Style", Georgia, serif'
};

const navShellStyle: CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16
};

const navGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

const panelStyle: CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  display: "grid",
  gap: 22
};

const heroCardStyle: CSSProperties = {
  padding: "32px",
  borderRadius: 30,
  background:
    "radial-gradient(circle at 15% 20%, rgba(14, 165, 233, 0.25), transparent 45%), radial-gradient(circle at 85% 10%, rgba(244, 114, 182, 0.25), transparent 50%), linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(219, 234, 254, 0.95))",
  border: "1px solid rgba(15, 23, 42, 0.06)",
  boxShadow: "0 26px 72px rgba(15, 23, 42, 0.16)"
};

const settingsHeroCardStyle: CSSProperties = {
  ...heroCardStyle,
  background:
    "radial-gradient(120% 135% at 6% 0%, rgba(14, 116, 144, 0.18), transparent 44%), radial-gradient(95% 125% at 94% 8%, rgba(251, 146, 60, 0.16), transparent 48%), linear-gradient(162deg, rgba(255, 255, 255, 0.97), rgba(241, 245, 249, 0.92)), repeating-linear-gradient(130deg, rgba(15, 23, 42, 0.03) 0 2px, transparent 2px 14px)",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  boxShadow: "0 28px 72px rgba(15, 23, 42, 0.2)"
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 18
};

const featureCardStyle: CSSProperties = {
  borderRadius: 28,
  padding: 28,
  background:
    "radial-gradient(circle at 15% 20%, rgba(14, 165, 233, 0.18), transparent 45%)," +
    "radial-gradient(circle at 85% 5%, rgba(244, 114, 182, 0.18), transparent 40%)," +
    "linear-gradient(160deg, rgba(255, 255, 255, 0.94), rgba(239, 246, 255, 0.92))",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  boxShadow: "0 24px 58px rgba(15, 23, 42, 0.16)",
  minHeight: 220,
  display: "flex",
  flexDirection: "column",
  gap: 12
};

const badgeStyle: CSSProperties = {
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

const routeLinkBaseStyle: CSSProperties = {
  textDecoration: "none",
  borderRadius: 999,
  padding: "10px 14px",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255,255,255,0.8)",
  color: "#0f172a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "none",
  borderRadius: 999,
  padding: "14px 18px",
  fontSize: 15,
  cursor: "pointer"
};

function AccentLine() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: 74,
        height: 5,
        borderRadius: 999,
        background: "linear-gradient(90deg, #0f172a, #475569)"
      }}
    />
  );
}

function FeatureCard({
  title,
  children,
  accent,
  promoTarget
}: {
  title: string;
  children: ReactNode;
  accent: string;
  promoTarget: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <article
      tabIndex={0}
      data-promo-target={promoTarget}
      style={{
        ...featureCardStyle,
        transform: hovered ? "translateY(-4px)" : "translateY(0px)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        boxShadow: hovered
          ? "0 24px 58px rgba(15, 23, 42, 0.18)"
          : featureCardStyle.boxShadow
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        aria-hidden="true"
        style={{
          width: 60,
          height: 4,
          borderRadius: 999,
          background: accent
        }}
      />
      <h3 style={{ margin: 0, fontSize: 24 }}>{title}</h3>
      <div style={{ color: "#475569", lineHeight: 1.7, fontSize: 16 }}>{children}</div>
    </article>
  );
}

function RouteLink({
  to,
  label,
  currentPath,
  promoTarget
}: {
  to: string;
  label: string;
  currentPath: string;
  promoTarget: string;
}) {
  const active = currentPath === to;

  return (
    <Link
      to={to}
      data-promo-target={promoTarget}
      style={{
        ...routeLinkBaseStyle,
        background: active ? "#0f172a" : routeLinkBaseStyle.background,
        color: active ? "#f8fafc" : "#0f172a",
        boxShadow: active ? "0 10px 24px rgba(15, 23, 42, 0.22)" : "none"
      }}
    >
      {label}
    </Link>
  );
}

function LandingHeroCard() {
  return (
    <section style={heroCardStyle} data-promo-target="landing-hero-card">
      <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
        <div style={{ ...badgeStyle, width: "fit-content" }} data-promo-target="landing-badge">
          Route A · landing
        </div>
        <AccentLine />
        <h1
          style={{ margin: 0, fontSize: "clamp(3rem, 7vw, 5.25rem)", lineHeight: 0.92 }}
          data-promo-target="landing-headline"
        >
          Pick a component here, switch routes, then come back and watch the widget return.
        </h1>
        <p style={{ margin: 0, fontSize: 20, color: "#334155", lineHeight: 1.55 }}>
          This route is meant to show element-anchored widgets. Select the headline,
          CTA, or one of the cards below, navigate to the settings route, and then
          return to confirm the widget remounts on the settings view.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            data-promo-target="landing-cta"
            style={{
              ...buttonStyle,
              background: "#0f172a",
              color: "#f8fafc"
            }}
          >
            Route A CTA
          </button>
          <span style={{ color: "#475569" }}>
            Refresh the page here and the current route&apos;s widgets should restore too.
          </span>
        </div>
      </div>
    </section>
  );
}

function LandingView() {
  return (
    <>
      <LandingHeroCard />

      <section style={gridStyle}>
        <FeatureCard
          title="Select inline"
          accent="linear-gradient(90deg, #0f172a, #1d4ed8)"
          promoTarget="landing-feature-inline"
        >
          Hover any React-owned card or heading, click it, and a compact Codex widget
          appears beside that content.
        </FeatureCard>
        <FeatureCard
          title="Navigate away"
          accent="linear-gradient(90deg, #475569, #0891b2)"
          promoTarget="landing-feature-away"
        >
          Widgets created on this route stay persisted but unmount visually when the
          active view changes.
        </FeatureCard>
        <FeatureCard
          title="Come back"
          accent="linear-gradient(90deg, #0369a1, #38bdf8)"
          promoTarget="landing-feature-return"
        >
          When you return to this view, `codex-grab` re-queries the selector, verifies
          the component match, and remounts the widget if the target is present.
        </FeatureCard>
      </section>
    </>
  );
}

function SettingsHeroCard() {
  return (
    <section style={settingsHeroCardStyle} data-promo-target="settings-hero-card">
      <div style={{ display: "grid", gap: 20, maxWidth: 780 }}>
        <div style={{ ...badgeStyle, width: "fit-content" }} data-promo-target="settings-badge">
          Route B · settings
        </div>
        <AccentLine />
        <h2
          style={{ margin: 0, fontSize: "clamp(2.4rem, 6vw, 4rem)", lineHeight: 0.98 }}
          data-promo-target="settings-headline"
        >
          A second view with different targets to prove route-aware unmount and remount
        </h2>
        <p style={{ margin: 0, fontSize: 19, color: "#334155", lineHeight: 1.6 }}>
          Create widgets here as well. Route A widgets should disappear while you are on
          this screen, but background runs can keep streaming through persistence and
          bridge resume.
        </p>
      </div>
    </section>
  );
}

function SettingsView() {
  const statusRows = useMemo(
    () => [
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
    ],
    [],
  );

  return (
    <>
      <SettingsHeroCard />

      <section style={gridStyle}>
        {statusRows.map((row, index) => (
          <FeatureCard
            key={row.title}
            title={row.title}
            accent="linear-gradient(90deg, #111827, #6b7280)"
            promoTarget={`settings-card-${index + 1}`}
          >
            {row.body}
          </FeatureCard>
        ))}
      </section>
    </>
  );
}

function DemoSurface({
  bridgeUrl,
  token
}: {
  bridgeUrl: string;
  token: string;
}) {
  const location = useLocation();
  const currentViewId = `${location.pathname}${location.search}${location.hash}`;

  return (
    <CodexGrabProvider bridgeUrl={bridgeUrl} token={token} viewId={currentViewId} persistWidgets>
      <main style={appShellStyle} data-promo-target="app-shell">
        <nav style={navShellStyle}>
          <div style={navGroupStyle}>
            <div
              style={{ ...badgeStyle, background: "rgba(15, 23, 42, 0.08)" }}
              data-promo-target="shell-badge"
            >
              codex-grab routed demo
            </div>
            <RouteLink
              to="/landing"
              label="Landing"
              currentPath={location.pathname}
              promoTarget="route-landing"
            />
            <RouteLink
              to="/settings"
              label="Settings"
              currentPath={location.pathname}
              promoTarget="route-settings"
            />
          </div>
          <div
            style={{ ...badgeStyle, background: "rgba(15, 23, 42, 0.04)" }}
            data-promo-target="view-id-badge"
          >
            viewId: {currentViewId}
          </div>
        </nav>

        <div style={panelStyle}>
          <Routes>
            <Route path="/" element={<Navigate to="/landing" replace />} />
            <Route path="/landing" element={<LandingView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </div>
      </main>
      <CodexGrabOverlay />
    </CodexGrabProvider>
  );
}

export const App = () => {
  const bridgeUrl = import.meta.env.VITE_CODEX_GRAB_BRIDGE_URL ?? "ws://127.0.0.1:4318";
  const token = import.meta.env.VITE_CODEX_GRAB_TOKEN ?? "dev-token";

  return (
    <BrowserRouter>
      <DemoSurface bridgeUrl={bridgeUrl} token={token} />
    </BrowserRouter>
  );
};
