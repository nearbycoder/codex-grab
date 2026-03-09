import { AnimatePresence, motion } from "motion/react";
import { PatchDiff } from "@pierre/diffs/react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { CodexReasoningEffort } from "@codex-grab/core";
import { useCodexGrab, type GrabWidget } from "./context.js";
import type { GrabTurnHistoryRecord } from "./history-types.js";

type OverlayTheme = "dark" | "light";
type LauncherCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type LauncherMenuDirection = "up" | "down";
type LauncherMenuHorizontal = "left" | "right";

interface LauncherContextMenuState {
  anchorX: number;
  anchorY: number;
  direction: LauncherMenuDirection;
  horizontal: LauncherMenuHorizontal;
}

interface OverlayThemeStyles {
  launcher: CSSProperties;
  iconButton: CSSProperties;
  themeToggleGroup: CSSProperties;
  themeToggleButton: CSSProperties;
  themeToggleButtonActive: CSSProperties;
  widget: CSSProperties;
  compactWidget: CSSProperties;
  section: CSSProperties;
  card: CSSProperties;
  approvalCard: CSSProperties;
  infoBubble: CSSProperties;
  pickerButton: CSSProperties;
  pickerPopover: CSSProperties;
  pickerOption: CSSProperties;
  primaryButton: CSSProperties;
  secondaryButton: CSSProperties;
  select: CSSProperties;
  unsupportedToast: CSSProperties;
  mutedText: CSSProperties;
  softText: CSSProperties;
  prompt(focused: boolean): CSSProperties;
  statusDotColor: string;
  successDotColor: string;
}

const launcherStyle: CSSProperties = {
  width: 56,
  height: 56,
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 999,
  background:
    "linear-gradient(180deg, rgba(51,65,85,0.98), rgba(15,23,42,0.98))",
  color: "white",
  boxShadow: "0 20px 48px rgba(15, 23, 42, 0.18)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  cursor: "pointer",
  touchAction: "manipulation"
};

const launcherDockStyle: CSSProperties = {
  position: "fixed",
  zIndex: 2_147_483_100,
  display: "flex",
  alignItems: "center",
  gap: 10,
  touchAction: "none",
  cursor: "grab"
};

const iconButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "#e2e8f0",
  color: "#0f172a",
  cursor: "pointer",
  padding: 0
};

const widgetStyle: CSSProperties = {
  position: "absolute",
  width: 340,
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "min(560px, calc(100vh - 32px))",
  overflow: "visible",
  zIndex: 2_147_483_099,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.97), rgba(240,253,250,0.95))",
  boxShadow: "0 28px 90px rgba(15, 23, 42, 0.2)",
  backdropFilter: "blur(18px)",
  color: "#0f172a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  boxSizing: "border-box"
};

const compactWidgetStyle: CSSProperties = {
  position: "absolute",
  width: 228,
  minHeight: 56,
  zIndex: 2_147_483_099,
  padding: "12px 14px",
  borderRadius: 18,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,245,249,0.94))",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.16)",
  backdropFilter: "blur(18px)",
  color: "#0f172a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  boxSizing: "border-box",
  cursor: "grab",
  touchAction: "none"
};

const sectionStyle: CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid rgba(15, 23, 42, 0.08)"
};

const cardStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "rgba(15, 23, 42, 0.04)"
};

const diffViewerStyle: CSSProperties = {
  marginTop: 6,
  borderRadius: 12,
  overflow: "hidden"
};

const contentSlideStyle: CSSProperties = {
  overflow: "hidden"
};

const widgetScrollRegionStyle: CSSProperties = {
  maxHeight: "calc(min(560px, calc(100vh - 32px)) - 54px)",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "none",
  scrollbarGutter: "stable",
  width: "calc(100% + 12px)",
  marginRight: -12,
  paddingRight: 12,
  boxSizing: "border-box"
};

const headerControlButtonStyle: CSSProperties = {
  minHeight: 30,
  padding: "0 10px",
  fontSize: 11
};

const headerMenuStyle: CSSProperties = {
  position: "absolute",
  top: 42,
  right: 14,
  width: 220,
  padding: 8,
  borderRadius: 14,
  zIndex: 6
};

const launcherFanoutFieldStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2_147_483_101,
  pointerEvents: "none"
};

const launcherFanoutItemStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  pointerEvents: "auto"
};

const launcherFanoutButtonStyle: CSSProperties = {
  width: 224,
  minHeight: 48,
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: 10,
  padding: "0 12px 0 10px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background:
    "linear-gradient(180deg, rgba(20,22,30,0.98), rgba(7,9,15,0.985))",
  boxShadow: "0 18px 34px rgba(15, 23, 42, 0.18)",
  backdropFilter: "blur(18px)",
  color: "#f8fafc",
  fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  boxSizing: "border-box",
  textAlign: "left"
};

const launcherFanoutIconWrapStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxSizing: "border-box"
};

const launcherFanoutLabelTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  fontSize: 13,
  fontWeight: 600
};

const launcherFanoutMetaStyle: CSSProperties = {
  flexShrink: 0,
  minWidth: 24,
  height: 24,
  display: "inline-grid",
  placeItems: "center",
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  boxSizing: "border-box",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.01em",
  opacity: 0.82
};

const launcherFanoutLabelGroupStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 2
};

const launcherFanoutEyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  opacity: 0.58
};

const launcherFanoutThemeGroupStyle: CSSProperties = {
  position: "relative",
  width: 62,
  height: 30,
  display: "inline-block",
  borderRadius: 999,
  overflow: "hidden",
  flexShrink: 0
};

const shortcutDialogOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  zIndex: 2_147_483_103,
  padding: 16,
  background: "rgba(2, 6, 23, 0.28)",
  backdropFilter: "blur(10px)"
};

const shortcutDialogStyle: CSSProperties = {
  width: "min(320px, calc(100vw - 32px))",
  padding: 14,
  borderRadius: 16,
  boxSizing: "border-box"
};

const historyDialogOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2_147_483_102,
  display: "grid",
  placeItems: "center",
  padding: 16,
  overscrollBehavior: "contain",
  background: "rgba(2, 6, 23, 0.34)",
  backdropFilter: "blur(12px) saturate(1.05)"
};

const historyDialogStyle: CSSProperties = {
  width: "min(960px, calc(100vw - 32px))",
  height: "min(720px, calc(100vh - 32px))",
  display: "grid",
  gridTemplateRows: "auto 1fr",
  borderRadius: 20,
  overflow: "hidden",
  boxSizing: "border-box",
  fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
  backdropFilter: "blur(24px) saturate(1.06)"
};

const historyBodyStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  minHeight: 0,
  overscrollBehavior: "contain",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.048), rgba(255,255,255,0.02))"
};

const historySidebarStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  borderRight: "1px solid rgba(15, 23, 42, 0.08)",
  padding: 14,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))"
};

const historyDetailStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: 22,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))"
};

const historyHeaderTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: '"Iowan Old Style", Georgia, serif',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.05
};

const historyHeaderDescriptionStyle: CSSProperties = {
  marginTop: 6,
  maxWidth: 540,
  fontSize: 13,
  lineHeight: 1.45
};

const historySidebarCardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid transparent",
  color: "inherit",
  borderRadius: 16,
  padding: "14px 14px 13px",
  cursor: "pointer",
  marginBottom: 10,
  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
  boxSizing: "border-box"
};

const historySidebarTitleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  lineHeight: 1.2
};

const historySidebarPromptStyle: CSSProperties = {
  marginTop: 7,
  fontSize: 13,
  lineHeight: 1.45
};

const historySidebarMetaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 10,
  fontSize: 12,
  lineHeight: 1.35
};

const historyDetailHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 4
};

const historyDetailTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: '"Iowan Old Style", Georgia, serif',
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  lineHeight: 1
};

const historyDetailStatusStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

const historySectionStyle: CSSProperties = {
  marginTop: 18,
  paddingTop: 18
};

const historySectionHeadingStyle: CSSProperties = {
  marginBottom: 10,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

const historyBodyTextStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6
};

const historyCodeBlockStyle: CSSProperties = {
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  margin: 0,
  padding: "14px 16px",
  borderRadius: 14,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap"
};

const historyInfoCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.03)"
};

const infoBubbleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#475569",
  whiteSpace: "nowrap",
  maxWidth: 150
};

const pickerButtonStyle: CSSProperties = {
  ...infoBubbleStyle,
  minHeight: 32,
  gap: 6,
  border: "1px solid rgba(15, 23, 42, 0.08)",
  cursor: "pointer",
  font: "inherit",
  fontSize: 11,
  padding: "0 9px",
  minWidth: 0,
  maxWidth: "100%",
  justifyContent: "space-between"
};

const pickerLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1
};

const pickerPopoverStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: "calc(100% + 8px)",
  minWidth: 196,
  maxWidth: 260,
  maxHeight: 240,
  overflow: "auto",
  padding: 8,
  borderRadius: 16,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.16)",
  backdropFilter: "blur(16px)",
  zIndex: 5,
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const pickerPopoverPortalStyle: CSSProperties = {
  position: "fixed",
  minWidth: 196,
  maxWidth: 260,
  maxHeight: 240,
  overflow: "auto",
  padding: 8,
  borderRadius: 16,
  zIndex: 2_147_483_110
};

const pickerOptionStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 4,
  border: "none",
  borderRadius: 12,
  background: "transparent",
  color: "#0f172a",
  font: "inherit",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
  lineHeight: 1.2
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "none",
  borderRadius: 999,
  padding: "7px 11px",
  font: "inherit",
  cursor: "pointer",
  background: "#0f766e",
  color: "white"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#e2e8f0",
  color: "#0f172a"
};

const wrapTextStyle: CSSProperties = {
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word"
};

const threeLineClampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  overflow: "hidden"
};

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.16)",
  padding: "10px 12px",
  font: "inherit",
  background: "rgba(255,255,255,0.94)",
  color: "#0f172a",
  boxSizing: "border-box"
};

const getPromptTextareaStyle = (
  focused: boolean,
  themeStyles: OverlayThemeStyles,
): CSSProperties => ({
  boxSizing: "border-box",
  width: "100%",
  resize: "vertical",
  borderRadius: 12,
  padding: 10,
  font: "inherit",
  outline: "none",
  transition: "border-color 160ms ease, box-shadow 160ms ease",
  ...themeStyles.prompt(focused)
});

const getPortalPopoverPosition = (button: HTMLButtonElement | null) => {
  if (!button) {
    return null;
  }

  const rect = button.getBoundingClientRect();
  const inset = 16;
  const gap = 8;
  const minWidth = 196;
  const maxWidth = 260;
  const estimatedHeight = 220;
  const availableWidth = Math.max(160, window.innerWidth - inset * 2);
  const availableAbove = Math.max(0, rect.top - inset - gap);
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - inset - gap);
  const openAbove =
    availableAbove > availableBelow && availableAbove >= Math.min(estimatedHeight, 160);
  const width = Math.min(
    availableWidth,
    Math.min(maxWidth, Math.max(Math.min(minWidth, availableWidth), rect.width)),
  );
  const maxLeft = Math.max(inset, window.innerWidth - inset - width);
  const left = Math.min(Math.max(inset, rect.right - width), maxLeft);
  const maxHeight = Math.max(120, openAbove ? availableAbove : availableBelow);
  const top = openAbove
    ? Math.max(inset, rect.top - gap - Math.min(estimatedHeight, maxHeight))
    : Math.min(rect.bottom + gap, window.innerHeight - inset - Math.min(estimatedHeight, maxHeight));

  return {
    left: Math.round(left),
    top: Math.round(top),
    width,
    maxHeight
  } satisfies Pick<CSSProperties, "left" | "top" | "width" | "maxHeight">;
};

const splitPatchIntoFileDiffs = (patch: string): string[] => {
  const normalized = patch.trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const fileDiffs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ") && current.length) {
      fileDiffs.push(current.join("\n"));
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length) {
    fileDiffs.push(current.join("\n"));
  }

  return fileDiffs;
};

const DiffPreview = ({
  patch,
  theme
}: {
  patch: string;
  theme: OverlayTheme;
}) => {
  const fileDiffs = useMemo(() => splitPatchIntoFileDiffs(patch), [patch]);

  return (
    <div style={{ ...diffViewerStyle, display: "grid", gap: 10 }}>
      {fileDiffs.map((filePatch, index) => (
        <PatchDiff
          key={`${index}:${filePatch.slice(0, 80)}`}
          patch={filePatch}
          options={{
            theme: theme === "dark" ? "pierre-dark" : "pierre-light",
            themeType: theme,
            diffStyle: "unified",
            diffIndicators: "bars",
            lineDiffType: "word",
            overflow: "wrap",
            disableLineNumbers: true
          }}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11.5
          }}
        />
      ))}
    </div>
  );
};

const WIDGET_WIDTH = 340;
const COMPACT_WIDGET_WIDTH = 228;
const VIEWPORT_INSET = 16;
const ESTIMATED_WIDGET_HEIGHT = 300;
const COMPACT_WIDGET_HEIGHT = 64;
const SHORTCUT_STORAGE_KEY = "codex-grab-picker-shortcut";
const THEME_STORAGE_KEY = "codex-grab-overlay-theme";
const LAUNCHER_CORNER_STORAGE_KEY = "codex-grab-launcher-corner";
const HIDDEN_SESSION_COOKIE = "codex-grab-hidden-session";
const DEFAULT_SHORTCUT = "Meta+C";
const DEFAULT_THEME: OverlayTheme = "dark";
const DEFAULT_LAUNCHER_CORNER: LauncherCorner = "bottom-right";

const getThemeStyles = (theme: OverlayTheme): OverlayThemeStyles => {
  if (theme === "dark") {
    return {
      launcher: {
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(39,39,42,0.98), rgba(9,9,11,0.98))",
        color: "#fafafa",
        boxShadow: "0 24px 56px rgba(0, 0, 0, 0.42)"
      },
      iconButton: {
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.06)",
        color: "#fafafa"
      },
      themeToggleGroup: {
        position: "relative",
        width: 72,
        height: 36,
        display: "inline-block",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
        cursor: "pointer",
        overflow: "hidden"
      },
      themeToggleButton: {
        width: 18,
        height: 18,
        display: "grid",
        placeItems: "center",
        border: "none",
        background: "transparent",
        color: "rgba(244,244,245,0.82)",
        padding: 0,
        zIndex: 1,
        pointerEvents: "none"
      },
      themeToggleButtonActive: {
        position: "absolute",
        top: 3,
        left: 4,
        width: 30,
        height: 30,
        borderRadius: 999,
        background: "linear-gradient(180deg, rgba(250,250,250,0.98), rgba(228,228,231,0.94))",
        boxShadow: "0 8px 18px rgba(0, 0, 0, 0.28)"
      },
      widget: {
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(24,24,27,0.97), rgba(9,9,11,0.97))",
        boxShadow: "0 32px 92px rgba(0, 0, 0, 0.45)",
        color: "#fafafa"
      },
      compactWidget: {
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(24,24,27,0.97), rgba(9,9,11,0.97))",
        boxShadow: "0 20px 56px rgba(0, 0, 0, 0.34)",
        color: "#fafafa"
      },
      section: {
        borderTop: "1px solid rgba(255,255,255,0.08)"
      },
      card: {
        background: "rgba(255,255,255,0.035)"
      },
      approvalCard: {
        background: "rgba(255,255,255,0.07)"
      },
      infoBubble: {
        background: "rgba(255,255,255,0.05)",
        color: "rgba(244,244,245,0.92)",
        border: "1px solid rgba(255,255,255,0.06)"
      },
      pickerButton: {
        background: "rgba(255,255,255,0.05)",
        color: "rgba(244,244,245,0.92)",
        border: "1px solid rgba(255,255,255,0.08)"
      },
      pickerPopover: {
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(22,22,26,0.98), rgba(8,8,10,0.98))",
        boxShadow: "0 28px 64px rgba(0, 0, 0, 0.44), inset 0 1px 0 rgba(255,255,255,0.04)"
      },
      pickerOption: {
        color: "#fafafa"
      },
      primaryButton: {
        background: "#fafafa",
        color: "#09090b"
      },
      secondaryButton: {
        background: "rgba(255,255,255,0.06)",
        color: "#fafafa",
        border: "1px solid rgba(255,255,255,0.08)"
      },
      select: {
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "#fafafa"
      },
      unsupportedToast: {
        background: "rgba(9,9,11,0.96)",
        color: "#fafafa",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 48px rgba(0, 0, 0, 0.38)"
      },
      mutedText: {
        color: "rgba(212,212,216,0.76)"
      },
      softText: {
        color: "rgba(161,161,170,0.9)"
      },
      prompt: (focused) => ({
        border: focused
          ? "1px solid rgba(244,244,245,0.22)"
          : "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "#fafafa",
        boxShadow: focused ? "0 0 0 3px rgba(255,255,255,0.08)" : "none"
      }),
      statusDotColor: "#fafafa",
      successDotColor: "#34d399"
    };
  }

  return {
    launcher: {
      border: "1px solid rgba(15,23,42,0.08)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))",
      color: "#0f172a",
      boxShadow: "0 20px 48px rgba(15, 23, 42, 0.16)"
    },
    iconButton: {
      border: "1px solid rgba(15, 23, 42, 0.08)",
      background: "#e2e8f0",
      color: "#0f172a"
    },
    themeToggleGroup: {
      position: "relative",
      width: 72,
      height: 36,
      display: "inline-block",
      borderRadius: 999,
      border: "1px solid rgba(15,23,42,0.08)",
      background: "linear-gradient(180deg, rgba(15,23,42,0.06), rgba(15,23,42,0.03))",
      cursor: "pointer",
      overflow: "hidden"
    },
    themeToggleButton: {
      width: 18,
      height: 18,
      display: "grid",
      placeItems: "center",
      border: "none",
      background: "transparent",
      color: "#64748b",
      padding: 0,
      zIndex: 1,
      pointerEvents: "none"
    },
    themeToggleButtonActive: {
      position: "absolute",
      top: 3,
      left: 4,
      width: 30,
      height: 30,
      borderRadius: 999,
      background: "linear-gradient(180deg, #111827, #0f172a)",
      boxShadow: "0 8px 18px rgba(15, 23, 42, 0.18)"
    },
    widget: {
      border: "1px solid rgba(15,23,42,0.12)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,250,252,0.96))",
      boxShadow: "0 28px 90px rgba(15, 23, 42, 0.18)",
      color: "#0f172a"
    },
    compactWidget: {
      border: "1px solid rgba(15,23,42,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
      boxShadow: "0 18px 48px rgba(15, 23, 42, 0.14)",
      color: "#0f172a"
    },
    section: {
      borderTop: "1px solid rgba(15,23,42,0.08)"
    },
    card: {
      background: "rgba(15,23,42,0.04)"
    },
    approvalCard: {
      background: "rgba(15,23,42,0.06)"
    },
    infoBubble: {
      background: "rgba(15,23,42,0.06)",
      color: "#475569",
      border: "1px solid rgba(15,23,42,0.08)"
    },
    pickerButton: {
      background: "rgba(15,23,42,0.06)",
      color: "#475569",
      border: "1px solid rgba(15,23,42,0.08)"
    },
    pickerPopover: {
      border: "1px solid rgba(15,23,42,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.98))",
      boxShadow: "0 24px 56px rgba(15, 23, 42, 0.14)"
    },
    pickerOption: {
      color: "#0f172a"
    },
    primaryButton: {
      background: "#0f172a",
      color: "#f8fafc"
    },
    secondaryButton: {
      background: "#e2e8f0",
      color: "#0f172a",
      border: "1px solid rgba(15,23,42,0.08)"
    },
    select: {
      border: "1px solid rgba(15,23,42,0.16)",
      background: "rgba(255,255,255,0.94)",
      color: "#0f172a"
    },
    unsupportedToast: {
      background: "rgba(15,23,42,0.94)",
      color: "#f8fafc",
      border: "1px solid rgba(255,255,255,0.18)",
      boxShadow: "0 20px 48px rgba(15, 23, 42, 0.22)"
    },
    mutedText: {
      color: "#475569"
    },
    softText: {
      color: "#64748b"
    },
    prompt: (focused) => ({
      border: focused
        ? "1px solid rgba(15, 23, 42, 0.32)"
        : "1px solid rgba(15, 23, 42, 0.16)",
      background: "rgba(255,255,255,0.94)",
      color: "#0f172a",
      boxShadow: focused ? "0 0 0 3px rgba(15, 23, 42, 0.08)" : "none"
    }),
    statusDotColor: "#0f172a",
    successDotColor: "#16a34a"
  };
};

const isMacLikePlatform = (): boolean =>
  typeof navigator !== "undefined" && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
};

const normalizeShortcut = (shortcut: string): string => {
  const tokens = shortcut
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  const key = tokens[tokens.length - 1] ?? "";
  const modifiers = new Set(tokens.slice(0, -1).map((token) => token.toLowerCase()));
  const orderedModifiers = ["meta", "ctrl", "alt", "shift"].filter((token) =>
    modifiers.has(token),
  );

  return [...orderedModifiers, key.length === 1 ? key.toUpperCase() : key].join("+");
};

const readShortcutPreference = (): string => {
  if (typeof window === "undefined") {
    return DEFAULT_SHORTCUT;
  }

  try {
    const storage = window.localStorage;
    const stored =
      storage && typeof storage.getItem === "function"
        ? storage.getItem(SHORTCUT_STORAGE_KEY)
        : null;
    return stored ? normalizeShortcut(stored) : DEFAULT_SHORTCUT;
  } catch {
    return DEFAULT_SHORTCUT;
  }
};

const writeShortcutPreference = (shortcut: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storage = window.localStorage;
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(SHORTCUT_STORAGE_KEY, normalizeShortcut(shortcut));
    }
  } catch {
    // Ignore persistence errors and keep the in-memory shortcut active for this session.
  }
};

const readThemePreference = (): OverlayTheme => {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const storage = window.localStorage;
    const stored =
      storage && typeof storage.getItem === "function"
        ? storage.getItem(THEME_STORAGE_KEY)
        : null;
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const writeThemePreference = (theme: OverlayTheme) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storage = window.localStorage;
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Ignore persistence failures.
  }
};

const readLauncherCornerPreference = (): LauncherCorner => {
  if (typeof window === "undefined") {
    return DEFAULT_LAUNCHER_CORNER;
  }

  try {
    const stored = window.localStorage.getItem(LAUNCHER_CORNER_STORAGE_KEY);
    return stored === "top-left" ||
      stored === "top-right" ||
      stored === "bottom-left" ||
      stored === "bottom-right"
      ? stored
      : DEFAULT_LAUNCHER_CORNER;
  } catch {
    return DEFAULT_LAUNCHER_CORNER;
  }
};

const writeLauncherCornerPreference = (corner: LauncherCorner) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LAUNCHER_CORNER_STORAGE_KEY, corner);
  } catch {
    // Ignore persistence failures.
  }
};

const readOverlayHiddenPreference = (): boolean => {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${HIDDEN_SESSION_COOKIE}=1`);
};

const writeOverlayHiddenCookie = (hidden: boolean) => {
  if (typeof document === "undefined") {
    return;
  }

  if (hidden) {
    document.cookie = `${HIDDEN_SESSION_COOKIE}=1; path=/; SameSite=Lax`;
    return;
  }

  document.cookie = `${HIDDEN_SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
};

const getLauncherDockPosition = (
  corner: LauncherCorner,
): Pick<CSSProperties, "top" | "right" | "bottom" | "left"> => {
  switch (corner) {
    case "top-left":
      return { top: 16, left: 16 };
    case "top-right":
      return { top: 16, right: 16 };
    case "bottom-left":
      return { bottom: 16, left: 16 };
    case "bottom-right":
    default:
      return { bottom: 16, right: 16 };
  }
};

const getClosestLauncherCorner = (clientX: number, clientY: number): LauncherCorner => {
  const corners: Array<{ corner: LauncherCorner; x: number; y: number }> = [
    { corner: "top-left", x: 44, y: 44 },
    { corner: "top-right", x: window.innerWidth - 44, y: 44 },
    { corner: "bottom-left", x: 44, y: window.innerHeight - 44 },
    { corner: "bottom-right", x: window.innerWidth - 44, y: window.innerHeight - 44 }
  ];

  return corners.reduce((closest, candidate) => {
    const closestDistance = Math.hypot(clientX - closest.x, clientY - closest.y);
    const candidateDistance = Math.hypot(clientX - candidate.x, clientY - candidate.y);
    return candidateDistance < closestDistance ? candidate : closest;
  }).corner;
};

const clampLauncherDockPosition = (left: number, top: number) => ({
  left: Math.min(Math.max(16, left), window.innerWidth - 72),
  top: Math.min(Math.max(16, top), window.innerHeight - 72)
});

const getLauncherContextMenuState = (rect: DOMRect): LauncherContextMenuState => {
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceLeft = rect.left;
  const spaceRight = window.innerWidth - rect.right;

  return {
    anchorX: Math.round(rect.left + rect.width / 2),
    anchorY: Math.round(rect.top + rect.height / 2),
    direction: spaceBelow >= spaceAbove ? "down" : "up",
    horizontal: spaceRight >= spaceLeft ? "right" : "left"
  };
};

const eventToShortcut = (event: KeyboardEvent): string | null => {
  const key = event.key;
  if (!key || key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") {
    return null;
  }

  const modifiers: string[] = [];
  if (event.metaKey) {
    modifiers.push("Meta");
  }
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  return normalizeShortcut([...modifiers, normalizedKey].join("+"));
};

const shortcutToLabel = (shortcut: string): string =>
  shortcut
    .split("+")
    .map((token) => {
      switch (token.toLowerCase()) {
        case "meta":
          return isMacLikePlatform() ? "Command" : "Meta";
        case "ctrl":
          return "Control";
        case "alt":
          return "Option";
        case "shift":
          return "Shift";
        default:
          return token.length === 1 ? token.toUpperCase() : token;
      }
    })
    .join(" + ");

const shortcutMatches = (event: KeyboardEvent, shortcut: string): boolean =>
  eventToShortcut(event) === normalizeShortcut(shortcut);

const clampAnchor = (
  anchor: GrabWidget["anchor"],
  mode: "panel" | "compact",
): GrabWidget["anchor"] => {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const width = mode === "compact" ? COMPACT_WIDGET_WIDTH : WIDGET_WIDTH;
  const height = mode === "compact" ? COMPACT_WIDGET_HEIGHT : ESTIMATED_WIDGET_HEIGHT;
  const maxLeft = Math.max(scrollX + window.innerWidth - width - VIEWPORT_INSET, scrollX + VIEWPORT_INSET);
  const maxTop = Math.max(scrollY + window.innerHeight - height - VIEWPORT_INSET, scrollY + VIEWPORT_INSET);

  return {
    top: Math.min(Math.max(scrollY + VIEWPORT_INSET, anchor.top), maxTop),
    left: Math.min(Math.max(scrollX + VIEWPORT_INSET, anchor.left), maxLeft)
  };
};

const getWidgetPosition = (
  widget: GrabWidget,
  mode: "panel" | "compact",
): CSSProperties => {
  const anchor = clampAnchor(widget.anchor, mode);
  return {
    top: anchor.top,
    left: anchor.left
  };
};

const getWidgetStatusCopy = (widget: GrabWidget) => {
  if (widget.turnStatus === "running") {
    return widget.plan.find((step) => step.status === "in_progress")?.step ?? "Working";
  }

  if (widget.turnStatus === "completed") {
    return "Done";
  }

  if (widget.turnStatus === "failed") {
    return "Failed";
  }

  if (widget.turnStatus === "cancelled") {
    return "Cancelled";
  }

  return widget.connectionStatus === "connected" ? "Ready" : "Connecting";
};

const summarizeText = (text: string, maxLength = 140): string => {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const normalizeStreamText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const getLatestPlanStep = (widget: GrabWidget): string =>
  widget.plan.find((step) => step.status === "in_progress")?.step ??
  widget.plan[widget.plan.length - 1]?.step ??
  "";

const getLatestCommandLine = (widget: GrabWidget): string => {
  const lines = widget.commandOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
};

const getCollapsedStatusText = (widget: GrabWidget): string => {
  if (widget.pendingApproval) {
    return summarizeText(
      normalizeStreamText(
        `${widget.pendingApproval.kind}${widget.pendingApproval.reason ? ` - ${widget.pendingApproval.reason}` : ""}`,
      ),
      110,
    );
  }

  if (widget.turnStatus === "running") {
    const liveText =
      normalizeStreamText(getLatestCommandLine(widget)) ||
      normalizeStreamText(widget.reasoningSummary) ||
      normalizeStreamText(getLatestPlanStep(widget));

    return summarizeText(liveText || "Working through the change…", 110);
  }

  return getWidgetStatusCopy(widget);
};

const formatHistoryTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
};

const getHistoryStatusColor = (
  record: GrabTurnHistoryRecord,
  themeStyles: OverlayThemeStyles,
): string => {
  if (record.status === "completed") {
    return themeStyles.successDotColor;
  }

  if (record.status === "failed" || record.status === "cancelled") {
    return "#ef4444";
  }

  return themeStyles.statusDotColor;
};

const shouldAllowSubmit = (widget: GrabWidget): boolean =>
  widget.connectionStatus === "connected" &&
  widget.prompt.trim().length > 0 &&
  !widget.isCapturingScreenshot;

const CrosshairIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3V6M12 18V21M3 12H6M18 12H21M12 16.2A4.2 4.2 0 1 0 12 7.8A4.2 4.2 0 0 0 12 16.2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 6L18 18M18 6L6 18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const EllipsisIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5.5 12A1.5 1.5 0 1 1 5.5 12.01M12 12A1.5 1.5 0 1 1 12 12.01M18.5 12A1.5 1.5 0 1 1 18.5 12.01"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 3L21 21M10.58 10.58A2 2 0 0 0 13.42 13.42M9.88 5.09A10.94 10.94 0 0 1 12 4.9C17 4.9 20.27 8.38 21.5 12C20.98 13.52 20.1 14.9 18.93 16.01M14.47 14.7A5 5 0 0 1 7.8 8.03M6.09 6.23C3.96 7.66 2.75 9.74 2.5 12C3.73 15.62 7 19.1 12 19.1C13.55 19.1 14.98 18.77 16.27 18.2"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SlidersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 6H19M7 12H17M9 18H15"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 12L20 4L14 20L11.5 13.5L4 12Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M8 6.5L9.3 5H14.7L16 6.5H18.5A2.5 2.5 0 0 1 21 9V16A2.5 2.5 0 0 1 18.5 18.5H5.5A2.5 2.5 0 0 1 3 16V9A2.5 2.5 0 0 1 5.5 6.5H8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7 10L12 15L17 10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 4H4V9M15 4H20V9M20 15V20H15M4 15V20H9"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect
      x="7"
      y="7"
      width="10"
      height="10"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20 15.2A7.8 7.8 0 1 1 8.8 4A8.6 8.6 0 0 0 20 15.2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21M5.64 5.64L7.4 7.4M16.6 16.6L18.36 18.36M18.36 5.64L16.6 7.4M7.4 16.6L5.64 18.36M15.5 12A3.5 3.5 0 1 1 8.5 12A3.5 3.5 0 0 1 15.5 12Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 8V12L14.5 14.5M21 12A9 9 0 1 1 18.36 5.64M21 4V9H16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WidgetPanel = ({
  widget,
  focused,
  autoFocus,
  onFocus,
  onAutoFocusConsumed,
  theme,
  themeStyles
}: {
  widget: GrabWidget;
  focused: boolean;
  autoFocus: boolean;
  onFocus(widgetId: string | null): void;
  onAutoFocusConsumed(widgetId: string): void;
  theme: OverlayTheme;
  themeStyles: OverlayThemeStyles;
}) => {
  const {
    updateAnchor,
    updatePrompt,
    updateModel,
    updateEffort,
    retryConnection,
    toggleScreenshot,
    refreshScreenshot,
    submitPrompt,
    approve,
    decline,
    interrupt,
    toggleWidget,
    setWidgetCollapsed,
    removeWidget
  } = useCodexGrab();
  const selectedModel =
    widget.availableModels.find((model) => model.model === widget.selectedModel) ?? null;
  const selectionSnapshot = widget.serializedSelection;
  const screenshot = selectionSnapshot.screenshot ?? null;
  const effortOptions = selectedModel?.supportedReasoningEfforts ?? [];
  const compact =
    (widget.turnStatus === "running" ||
      widget.turnStatus === "completed" ||
      widget.isSubmitting) &&
    !focused;
  const expanded = !widget.collapsed;
  const showHeaderExpand = expanded || widget.turnStatus !== "idle";
  const statusCopy = getWidgetStatusCopy(widget);
  const modelLabel = selectedModel?.displayName ?? widget.selectedModel ?? "No model";
  const thinkingLabel = widget.selectedEffort ?? "default";
  const collapsedStatusText = getCollapsedStatusText(widget);
  const canSubmit = shouldAllowSubmit(widget);
  const expandedScrollRegionStyle: CSSProperties = {
    ...widgetScrollRegionStyle,
    maxHeight: "calc(min(560px, calc(100vh - 32px)) - 176px)"
  };
  const [openPicker, setOpenPicker] = useState<"model" | "thinking" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusedPrompt, setFocusedPrompt] = useState<"compact" | "expanded" | null>(null);
  const [pickerPopoverPosition, setPickerPopoverPosition] = useState<Pick<
    CSSProperties,
    "left" | "top" | "width" | "maxHeight"
  > | null>(null);
  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const pickerPopoverRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const thinkingButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const compactPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAnimateContentRef = useRef(false);
  const dragStateRef = useRef<{
    mode: "panel" | "compact";
    pointerId: number;
    startX: number;
    startY: number;
    origin: GrabWidget["anchor"];
    moveHandler: (event: PointerEvent) => void;
    upHandler: (event: PointerEvent) => void;
  } | null>(null);

  const finishDrag = () => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    window.removeEventListener("pointermove", dragState.moveHandler);
    window.removeEventListener("pointerup", dragState.upHandler);
    window.removeEventListener("pointercancel", dragState.upHandler);
    dragStateRef.current = null;
  };

  const startDragging = (
    event: ReactPointerEvent<HTMLElement>,
    mode: "panel" | "compact",
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onFocus(widget.id);
    finishDrag();

    const moveHandler = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) {
        return;
      }

      moveEvent.preventDefault();
      updateAnchor(
        widget.id,
        clampAnchor(
          {
            top: dragState.origin.top + (moveEvent.clientY - dragState.startY),
            left: dragState.origin.left + (moveEvent.clientX - dragState.startX)
          },
          dragState.mode,
        ),
      );
    };

    const upHandler = (upEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || upEvent.pointerId !== dragState.pointerId) {
        return;
      }

      finishDrag();
    };

    dragStateRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: widget.anchor,
      moveHandler,
      upHandler
    };
    window.addEventListener("pointermove", moveHandler, { passive: false });
    window.addEventListener("pointerup", upHandler);
    window.addEventListener("pointercancel", upHandler);
  };

  useEffect(() => finishDrag, []);

  useEffect(() => {
    shouldAnimateContentRef.current = true;
  }, []);

  useEffect(() => {
    if (!openPicker) {
      setPickerPopoverPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor =
        openPicker === "model" ? modelButtonRef.current : thinkingButtonRef.current;
      setPickerPopoverPosition(getPortalPopoverPosition(anchor));
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [openPicker]);

  useEffect(() => {
    if (!openPicker && !menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !pickerRootRef.current?.contains(event.target as Node) &&
        !pickerPopoverRef.current?.contains(event.target as Node)
      ) {
        setOpenPicker(null);
      }

      if (
        menuOpen &&
        !menuRef.current?.contains(event.target as Node) &&
        !(event.target instanceof Element && event.target.closest("[data-header-menu-trigger='true']"))
      ) {
        setMenuOpen(false);
      }

    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPicker(null);
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, openPicker]);

  useLayoutEffect(() => {
    if ((!focused && !autoFocus) || widget.turnStatus !== "idle") {
      return;
    }

    const promptElement = expanded ? expandedPromptRef.current : compactPromptRef.current;
    if (!promptElement || document.activeElement === promptElement) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    promptElement.focus();
    const length = promptElement.value.length;
    promptElement.setSelectionRange(length, length);
    setFocusedPrompt(expanded ? "expanded" : "compact");
    if (autoFocus) {
      onAutoFocusConsumed(widget.id);
    }
  }, [autoFocus, expanded, focused, onAutoFocusConsumed, widget.id, widget.turnStatus]);

  const handleSubmit = () => {
    setOpenPicker(null);
    void submitPrompt(widget.id);
    onFocus(null);
  };

  if (compact) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={() => {
          onFocus(widget.id);
          setWidgetCollapsed(widget.id, false);
        }}
        onPointerDown={(event) => startDragging(event, "compact")}
        style={{
          ...compactWidgetStyle,
          ...themeStyles.compactWidget,
          ...getWidgetPosition(widget, "compact")
        }}
        data-codex-grab-overlay="true"
        data-widget-id={widget.id}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background:
                widget.turnStatus === "completed"
                  ? themeStyles.successDotColor
                  : themeStyles.statusDotColor,
              flexShrink: 0
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, ...wrapTextStyle }}>
              {selectionSnapshot.componentName ?? "Unknown component"}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${widget.turnStatus}:${collapsedStatusText}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{
                  ...(widget.turnStatus === "running" ? themeStyles.softText : themeStyles.mutedText),
                  marginTop: 4,
                  ...wrapTextStyle,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                  fontStyle: widget.turnStatus === "running" ? "italic" : "normal"
                }}
                title={collapsedStatusText}
              >
                {collapsedStatusText}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.aside
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      onPointerDown={() => onFocus(widget.id)}
      style={{
        ...widgetStyle,
        ...themeStyles.widget,
        ...getWidgetPosition(widget, "panel"),
        cursor: "default"
      }}
      data-codex-grab-overlay="true"
      data-widget-id={widget.id}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{ ...wrapTextStyle, flex: 1, cursor: "grab", touchAction: "none" }}
          onPointerDown={(event) => startDragging(event, "panel")}
        >
          <strong>{selectionSnapshot.componentName ?? "Unknown component"}</strong>
          <div style={{ ...themeStyles.mutedText, marginTop: 4 }}>
            {widget.connectionStatus === "connected"
              ? widget.turnStatus === "running"
                ? statusCopy
                : "Ready"
              : widget.connectionStatus === "connecting"
                ? "Connecting…"
                : widget.connectionError ?? "Connection error"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {widget.connectionStatus === "error" ? (
            <button
              type="button"
              style={{
                ...iconButtonStyle,
                ...headerControlButtonStyle,
                ...themeStyles.iconButton,
                width: "auto",
                padding: "0 12px"
              }}
              onClick={() => retryConnection(widget.id)}
              aria-label="Retry connection"
              title="Retry connection"
            >
              Retry
            </button>
          ) : null}
          {!expanded && widget.turnStatus !== "idle" ? (
            <button
              type="button"
              style={{
                ...iconButtonStyle,
                ...themeStyles.iconButton,
                width: 30,
                height: 30
              }}
              onClick={() => toggleWidget(widget.id)}
              aria-label="Expand widget"
              title="Expand"
            >
              <ExpandIcon />
            </button>
          ) : null}
          {!expanded && widget.turnStatus === "running" ? (
            <button
              type="button"
              style={{
                ...iconButtonStyle,
                ...themeStyles.iconButton,
                width: 30,
                height: 30
              }}
              onClick={() => interrupt(widget.id)}
              aria-label="Interrupt turn"
              title="Interrupt"
            >
              <StopIcon />
            </button>
          ) : null}
          {expanded ? (
            <button
              type="button"
              data-header-menu-trigger="true"
              style={{
                ...iconButtonStyle,
                ...themeStyles.iconButton,
                width: 30,
                height: 30
              }}
              onClick={() => setMenuOpen((current) => !current)}
              aria-label="More widget options"
              title="More"
            >
              <EllipsisIcon />
            </button>
          ) : null}
          <button
            type="button"
            style={{
              ...iconButtonStyle,
              ...themeStyles.iconButton,
              width: 30,
              height: 30
            }}
            onClick={() => removeWidget(widget.id)}
            aria-label="Close widget"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {expanded && menuOpen ? (
        <div
          ref={menuRef}
          style={{
            ...headerMenuStyle,
            ...themeStyles.widget,
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.22)"
          }}
          data-codex-grab-overlay="true"
        >
          <div style={{ display: "grid", gap: 8 }}>
            {showHeaderExpand ? (
              <button
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  ...themeStyles.secondaryButton,
                  ...headerControlButtonStyle,
                  width: "100%",
                  marginBottom: 8
                }}
                onClick={() => {
                  toggleWidget(widget.id);
                  setMenuOpen(false);
                }}
              >
                {expanded ? "Collapse" : "Expand"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="expanded"
            style={contentSlideStyle}
            initial={
              shouldAnimateContentRef.current ? { height: 0, opacity: 0, y: -10 } : false
            }
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8 }}
            transition={{
              height: { type: "spring", stiffness: 260, damping: 28 },
              opacity: { duration: 0.18, ease: "easeOut" },
              y: { duration: 0.24, ease: "easeOut" }
            }}
          >
        <div style={expandedScrollRegionStyle}>
          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>Selection</div>
            <div style={wrapTextStyle}>
              <strong>{selectionSnapshot.componentName ?? "Unknown component"}</strong>
            </div>
            <div style={wrapTextStyle}>{selectionSnapshot.selector ?? "No selector"}</div>
            <div style={{ ...wrapTextStyle, ...themeStyles.mutedText, marginTop: 6 }}>
              {selectionSnapshot.source?.fileName ?? "No source location"}
            </div>
          </section>

          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>Prompt</div>
            {widget.availableModels.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                  marginBottom: 8
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={themeStyles.mutedText}>Model</span>
                  <button
                    ref={modelButtonRef}
                    type="button"
                    style={{
                      ...pickerButtonStyle,
                      ...themeStyles.pickerButton,
                      ...wrapTextStyle,
                      width: "100%",
                      minHeight: 42,
                      padding: "0 14px",
                      fontSize: 13
                    }}
                    title={modelLabel}
                    aria-label="Choose model"
                    aria-haspopup="listbox"
                    aria-expanded={openPicker === "model"}
                    onClick={() =>
                      setOpenPicker((current) => (current === "model" ? null : "model"))
                    }
                    disabled={!widget.availableModels.length}
                  >
                    <span style={{ ...pickerLabelStyle, maxWidth: "100%" }}>{modelLabel}</span>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center" }}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={themeStyles.mutedText}>Thinking</span>
                  <button
                    ref={thinkingButtonRef}
                    type="button"
                    style={{
                      ...pickerButtonStyle,
                      ...themeStyles.pickerButton,
                      ...wrapTextStyle,
                      width: "100%",
                      minHeight: 42,
                      padding: "0 14px",
                      fontSize: 13
                    }}
                    title={thinkingLabel}
                    aria-label="Choose thinking"
                    aria-haspopup="listbox"
                    aria-expanded={openPicker === "thinking"}
                    onClick={() =>
                      setOpenPicker((current) => (current === "thinking" ? null : "thinking"))
                    }
                    disabled={!effortOptions.length}
                  >
                    <span style={{ ...pickerLabelStyle, maxWidth: "100%" }}>{thinkingLabel}</span>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center" }}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
            {selectedModel ? (
              <div style={{ ...themeStyles.softText, marginBottom: 8, ...wrapTextStyle }}>
                {selectedModel.description}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  ...themeStyles.secondaryButton,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  ...(widget.includeScreenshot
                    ? {
                        background: themeStyles.infoBubble.background,
                        borderColor: "rgba(148, 163, 184, 0.35)"
                      }
                    : null)
                }}
                onClick={() => void toggleScreenshot(widget.id)}
                disabled={widget.isCapturingScreenshot}
              >
                <CameraIcon />
                {widget.includeScreenshot ? "Remove screenshot" : "Include screenshot"}
              </button>
              {widget.includeScreenshot && screenshot ? (
                <button
                  type="button"
                  style={{ ...secondaryButtonStyle, ...themeStyles.secondaryButton }}
                  onClick={() => void refreshScreenshot(widget.id)}
                  disabled={widget.isCapturingScreenshot}
                >
                  Retake
                </button>
              ) : null}
              <div style={{ ...themeStyles.softText, ...wrapTextStyle }}>
                {widget.isCapturingScreenshot
                  ? "Capturing screenshot…"
                  : widget.includeScreenshot && screenshot
                    ? `${screenshot.width}×${screenshot.height} attached`
                    : "Optional visual context for Codex."}
              </div>
            </div>
            {widget.includeScreenshot && screenshot ? (
              <div
                style={{
                  ...cardStyle,
                  ...themeStyles.card,
                  marginBottom: 8,
                  padding: 8
                }}
              >
                <img
                  src={screenshot.dataUrl}
                  alt="Selected UI screenshot"
                  style={{
                    width: "100%",
                    maxHeight: 180,
                    objectFit: "contain",
                    display: "block",
                    borderRadius: 10
                  }}
                />
              </div>
            ) : null}
            {widget.screenshotError ? (
              <div style={{ color: "#fca5a5", marginBottom: 8, ...wrapTextStyle }}>
                {widget.screenshotError}
              </div>
            ) : null}
            <textarea
              ref={expandedPromptRef}
              value={widget.prompt}
              onChange={(event) => updatePrompt(widget.id, event.target.value)}
              onFocus={() => setFocusedPrompt("expanded")}
              onBlur={() => {
                if (focusedPrompt === "expanded") {
                  setFocusedPrompt(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && canSubmit) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              rows={5}
              style={getPromptTextareaStyle(focusedPrompt === "expanded", themeStyles)}
              placeholder="Describe the change you want Codex to make."
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {widget.turnStatus === "running" ? (
                <button
                  type="button"
                  style={{ ...secondaryButtonStyle, ...themeStyles.secondaryButton }}
                  onClick={() => interrupt(widget.id)}
                >
                  Interrupt
                </button>
              ) : null}
              <button
                type="button"
                style={{ ...buttonStyle, ...themeStyles.primaryButton, flex: 1 }}
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                Send To Codex
              </button>
            </div>
          </section>

          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>
              Turn status: <strong>{widget.turnStatus}</strong>
            </div>
            {widget.planExplanation ? (
              <div style={{ marginBottom: 8 }}>{widget.planExplanation}</div>
            ) : null}
            {widget.plan.length ? (
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {widget.plan.map((step) => (
                  <li key={step.step}>
                    {step.status}: {step.step}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={themeStyles.softText}>No plan updates yet.</div>
            )}
          </section>

          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>Reasoning summary</div>
            <pre style={{ ...wrapTextStyle, whiteSpace: "pre-wrap", margin: 0 }}>
              {widget.reasoningSummary || "No reasoning summary streamed yet."}
            </pre>
          </section>

          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>
              Command / file activity
            </div>
            <pre style={{ ...wrapTextStyle, whiteSpace: "pre-wrap", margin: 0 }}>
              {widget.commandOutput || "No command output yet."}
            </pre>
          </section>

          <section style={{ ...sectionStyle, ...themeStyles.section }}>
            <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>Current diff</div>
            {widget.diff ? (
              <DiffPreview patch={widget.diff} theme={theme} />
            ) : (
              <pre style={{ ...wrapTextStyle, whiteSpace: "pre-wrap", margin: 0 }}>
                No diff yet.
              </pre>
            )}
          </section>

          {widget.pendingApproval ? (
            <section style={{ ...sectionStyle, ...themeStyles.section }}>
              <div style={{ ...themeStyles.mutedText, marginBottom: 8 }}>Pending approval</div>
              <div style={{ marginBottom: 8 }}>
                {widget.pendingApproval.kind}{" "}
                {widget.pendingApproval.reason ? `- ${widget.pendingApproval.reason}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={{ ...buttonStyle, ...themeStyles.primaryButton }}
                  onClick={() => approve(widget.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  style={{ ...secondaryButtonStyle, ...themeStyles.secondaryButton }}
                  onClick={() => decline(widget.id)}
                >
                  Decline
                </button>
              </div>
            </section>
          ) : null}
        </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            style={contentSlideStyle}
            initial={
              shouldAnimateContentRef.current ? { height: 0, opacity: 0, y: -8 } : false
            }
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -6 }}
            transition={{
              height: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.16, ease: "easeOut" },
              y: { duration: 0.2, ease: "easeOut" }
            }}
          >
          {widget.turnStatus === "idle" ? (
            <section style={{ ...sectionStyle, ...themeStyles.section }}>
              <textarea
                ref={compactPromptRef}
                value={widget.prompt}
                onChange={(event) => updatePrompt(widget.id, event.target.value)}
                onFocus={() => setFocusedPrompt("compact")}
                onBlur={() => {
                  if (focusedPrompt === "compact") {
                    setFocusedPrompt(null);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && canSubmit) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                rows={3}
                style={getPromptTextareaStyle(focusedPrompt === "compact", themeStyles)}
                placeholder="Describe the change you want Codex to make."
              />
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 10,
                  alignItems: "center",
                  flexWrap: "nowrap"
                }}
                ref={pickerRootRef}
              >
                <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
                  <button
                    ref={modelButtonRef}
                    type="button"
                    style={{
                      ...pickerButtonStyle,
                      ...themeStyles.pickerButton,
                      ...wrapTextStyle,
                      width: "100%",
                      minHeight: 32,
                      padding: "0 10px"
                    }}
                    title={modelLabel}
                    aria-label="Choose model"
                    aria-haspopup="listbox"
                    aria-expanded={openPicker === "model"}
                    onClick={() =>
                      setOpenPicker((current) => (current === "model" ? null : "model"))
                    }
                    disabled={!widget.availableModels.length}
                  >
                    <span style={{ ...pickerLabelStyle, maxWidth: 78 }}>{modelLabel}</span>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center" }}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                </div>
                <div style={{ position: "relative", flex: "0 0 100px", minWidth: 100 }}>
                  <button
                    ref={thinkingButtonRef}
                    type="button"
                    style={{
                      ...pickerButtonStyle,
                      ...themeStyles.pickerButton,
                      ...wrapTextStyle,
                      width: "100%",
                      minHeight: 32,
                      padding: "0 10px"
                    }}
                    title={thinkingLabel}
                    aria-label="Choose thinking"
                    aria-haspopup="listbox"
                    aria-expanded={openPicker === "thinking"}
                    onClick={() =>
                      setOpenPicker((current) => (current === "thinking" ? null : "thinking"))
                    }
                    disabled={!effortOptions.length}
                  >
                    <span style={{ ...pickerLabelStyle, maxWidth: 56 }}>{thinkingLabel}</span>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center" }}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  style={{
                    ...iconButtonStyle,
                    ...themeStyles.iconButton,
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    ...(widget.includeScreenshot
                      ? {
                          background: themeStyles.infoBubble.background,
                          borderColor: "rgba(148, 163, 184, 0.35)"
                        }
                      : null)
                  }}
                  onClick={() => void toggleScreenshot(widget.id)}
                  aria-label={widget.includeScreenshot ? "Remove screenshot" : "Include screenshot"}
                  title={
                    widget.isCapturingScreenshot
                      ? "Capturing screenshot…"
                      : widget.includeScreenshot
                        ? "Remove screenshot"
                        : "Include screenshot"
                  }
                  disabled={widget.isCapturingScreenshot}
                >
                  <CameraIcon />
                </button>
                <button
                  type="button"
                  style={{
                    ...iconButtonStyle,
                    ...themeStyles.iconButton,
                    width: 32,
                    height: 32,
                    flexShrink: 0
                  }}
                  onClick={() => {
                    setOpenPicker(null);
                    toggleWidget(widget.id);
                  }}
                  aria-label="More options"
                  title="More"
                >
                  <SlidersIcon />
                </button>
                <button
                  type="button"
                  style={{
                    ...buttonStyle,
                    ...themeStyles.primaryButton,
                    width: 40,
                    minHeight: 32,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0
                  }}
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  aria-label="Send To Codex"
                  title="Send To Codex"
                >
                  <SendIcon />
                </button>
              </div>
              {widget.includeScreenshot && screenshot ? (
                <div
                  style={{
                    ...cardStyle,
                    ...themeStyles.card,
                    marginTop: 8,
                    padding: 8
                  }}
                >
                  <img
                    src={screenshot.dataUrl}
                    alt="Selected UI screenshot"
                    style={{
                      width: "100%",
                      maxHeight: 110,
                      objectFit: "contain",
                      display: "block",
                      borderRadius: 10
                    }}
                  />
                </div>
              ) : null}
              {widget.screenshotError ? (
                <div style={{ color: "#fca5a5", marginTop: 8, ...wrapTextStyle }}>
                  {widget.screenshotError}
                </div>
              ) : null}
            </section>
          ) : (
            <section
              style={{
                ...sectionStyle,
                ...themeStyles.section,
                marginTop: 10,
                paddingTop: 10,
                paddingBottom: 2
              }}
            >
              <div>
                <div style={themeStyles.mutedText}>Status</div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${widget.turnStatus}:${collapsedStatusText}`}
                    initial={{ opacity: 0, y: 4, filter: "blur(3px)", height: 0 }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)", height: "auto" }}
                    exit={{ opacity: 0, y: -4, filter: "blur(2px)", height: 0 }}
                    transition={{
                      height: { duration: 0.24, ease: "easeOut" },
                      opacity: { duration: 0.2, ease: "easeOut" },
                      y: { duration: 0.2, ease: "easeOut" }
                    }}
                    style={{
                      marginTop: 4,
                      fontStyle: widget.turnStatus === "running" ? "italic" : "normal",
                      lineHeight: 1.35,
                      ...wrapTextStyle,
                      ...threeLineClampStyle
                    }}
                  >
                    {collapsedStatusText}
                  </motion.div>
                </AnimatePresence>
              </div>
              {widget.pendingApproval ? (
                <div style={{ ...cardStyle, ...themeStyles.approvalCard }}>
                  <div style={{ ...themeStyles.mutedText, marginBottom: 6 }}>Approval needed</div>
                  <div style={{ ...wrapTextStyle, marginBottom: 8 }}>
                    {widget.pendingApproval.kind}
                    {widget.pendingApproval.reason ? ` - ${widget.pendingApproval.reason}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={{ ...buttonStyle, ...themeStyles.primaryButton }}
                      onClick={() => approve(widget.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryButtonStyle, ...themeStyles.secondaryButton }}
                      onClick={() => decline(widget.id)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}
          {openPicker && pickerPopoverPosition && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={pickerPopoverRef}
                  role="listbox"
                  aria-label={openPicker === "model" ? "Model options" : "Thinking options"}
                  style={{
                    ...pickerPopoverPortalStyle,
                    ...themeStyles.pickerPopover,
                    ...pickerPopoverPosition
                  }}
                  data-codex-grab-overlay="true"
                >
                  {openPicker === "model"
                    ? widget.availableModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={model.model === widget.selectedModel}
                          style={{
                            ...pickerOptionStyle,
                            ...themeStyles.pickerOption,
                            background:
                              model.model === widget.selectedModel
                                ? themeStyles.infoBubble.background
                                : "transparent"
                          }}
                          onClick={() => {
                            updateModel(widget.id, model.model);
                            setOpenPicker(null);
                          }}
                        >
                          <span
                            style={{
                              ...wrapTextStyle,
                              fontSize: 13,
                              fontWeight: 600,
                              letterSpacing: "-0.01em"
                            }}
                          >
                            {model.displayName}
                          </span>
                          <span
                            style={{
                              ...wrapTextStyle,
                              ...themeStyles.softText,
                              fontSize: 12,
                              lineHeight: 1.35
                            }}
                          >
                            {model.description}
                          </span>
                        </button>
                      ))
                    : effortOptions.map((option) => (
                        <button
                          key={option.effort}
                          type="button"
                          role="option"
                          aria-selected={option.effort === widget.selectedEffort}
                          style={{
                            ...pickerOptionStyle,
                            ...themeStyles.pickerOption,
                            background:
                              option.effort === widget.selectedEffort
                                ? themeStyles.infoBubble.background
                                : "transparent"
                          }}
                          onClick={() => {
                            updateEffort(widget.id, option.effort);
                            setOpenPicker(null);
                          }}
                        >
                          <span
                            style={{
                              ...wrapTextStyle,
                              fontSize: 13,
                              fontWeight: 600,
                              letterSpacing: "-0.01em",
                              textTransform: "capitalize"
                            }}
                          >
                            {option.effort}
                          </span>
                          <span
                            style={{
                              ...wrapTextStyle,
                              ...themeStyles.softText,
                              fontSize: 12,
                              lineHeight: 1.35
                            }}
                          >
                            {option.description}
                          </span>
                        </button>
                      ))}
                </div>,
                document.body,
              )
            : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
};

const HistoryDialog = ({
  history,
  historyStatus,
  historyError,
  selectedHistoryId,
  onSelectHistory,
  onClose,
  onClear,
  onRemoveEntry,
  isClearing,
  removingEntryId,
  theme,
  themeStyles
}: {
  history: GrabTurnHistoryRecord[];
  historyStatus: "idle" | "loading" | "ready" | "error";
  historyError: string | null;
  selectedHistoryId: string | null;
  onSelectHistory(historyId: string): void;
  onClose(): void;
  onClear(): void;
  onRemoveEntry(historyId: string): void | Promise<void>;
  isClearing: boolean;
  removingEntryId: string | null;
  theme: OverlayTheme;
  themeStyles: OverlayThemeStyles;
}) => {
  const selectedRecord =
    history.find((record) => record.id === selectedHistoryId) ?? history[0] ?? null;

  return (
    <div
      style={historyDialogOverlayStyle}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      data-codex-grab-overlay="true"
    >
      <div
        style={{
          ...historyDialogStyle,
          ...themeStyles.widget,
          boxShadow: "0 32px 92px rgba(0, 0, 0, 0.36)"
        }}
        data-codex-grab-overlay="true"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px 16px",
            borderBottom: themeStyles.section.borderTop
          }}
        >
          <div>
            <h2 style={historyHeaderTitleStyle}>History</h2>
            <div style={{ ...historyHeaderDescriptionStyle, ...themeStyles.softText }}>
              Saved browser history of Codex turns for this origin.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={{
                ...secondaryButtonStyle,
                ...themeStyles.secondaryButton,
                minHeight: 42,
                padding: "0 22px",
                display: "inline-flex",
                alignItems: "center"
              }}
              onClick={onClear}
              disabled={isClearing || history.length === 0}
            >
              {isClearing ? "Clearing..." : "Clear history"}
            </button>
            <button
              type="button"
              style={{
                ...iconButtonStyle,
                ...themeStyles.iconButton,
                width: 42,
                height: 42,
                flexShrink: 0
              }}
              onClick={onClose}
              aria-label="Close history"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div style={historyBodyStyle}>
          <div style={historySidebarStyle}>
            {historyStatus === "loading" ? (
              <div style={{ ...themeStyles.softText, ...historyBodyTextStyle }}>Loading history…</div>
            ) : null}
            {historyStatus === "error" ? (
              <div style={{ ...themeStyles.softText, ...historyBodyTextStyle }}>
                {historyError ?? "History is unavailable in this browser."}
              </div>
            ) : null}
            {historyStatus !== "loading" && historyStatus !== "error" && history.length === 0 ? (
              <div style={{ ...themeStyles.softText, ...historyBodyTextStyle }}>No saved turns yet.</div>
            ) : null}
            {historyStatus === "ready"
              ? history.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    style={{
                      ...historySidebarCardStyle,
                      border: `1px solid ${
                        selectedRecord?.id === record.id
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.03)"
                      }`,
                      background:
                        selectedRecord?.id === record.id
                          ? "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.05))"
                          : "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
                      boxShadow:
                        selectedRecord?.id === record.id
                          ? "0 18px 32px rgba(0, 0, 0, 0.16)"
                          : "none"
                    }}
                    onClick={() => onSelectHistory(record.id)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8
                      }}
                    >
                      <strong style={historySidebarTitleStyle}>
                        {record.selection.componentName ?? "Unknown component"}
                      </strong>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: getHistoryStatusColor(record, themeStyles),
                          flexShrink: 0
                        }}
                      />
                    </div>
                    <div style={{ ...historySidebarPromptStyle, ...themeStyles.softText, ...wrapTextStyle }}>
                      {record.prompt || "No prompt"}
                    </div>
                    <div
                      style={{
                        ...historySidebarMetaRowStyle,
                        ...themeStyles.mutedText
                      }}
                    >
                      <span style={{ ...wrapTextStyle, flex: 1 }}>
                        {record.model ?? "No model"}{record.effort ? ` · ${record.effort}` : ""}
                      </span>
                      <span style={{ flexShrink: 0 }}>{formatHistoryTimestamp(record.updatedAt)}</span>
                    </div>
                  </button>
                ))
              : null}
          </div>

          <div style={historyDetailStyle}>
            {!selectedRecord && historyStatus === "ready" ? (
              <div style={{ ...themeStyles.softText, ...historyBodyTextStyle }}>
                Select a saved turn to inspect it.
              </div>
            ) : null}
            {selectedRecord ? (
              <>
                <div style={historyDetailHeaderStyle}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: getHistoryStatusColor(selectedRecord, themeStyles),
                      flexShrink: 0
                    }}
                  />
                  <h3 style={historyDetailTitleStyle}>
                    {selectedRecord.selection.componentName ?? "Unknown component"}
                  </h3>
                  <span
                    style={{
                      ...historyDetailStatusStyle,
                      ...themeStyles.softText,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                    {selectedRecord.status}
                  </span>
                  <button
                    type="button"
                    style={{
                      ...secondaryButtonStyle,
                      ...themeStyles.secondaryButton,
                      minHeight: 34,
                      padding: "0 14px",
                      marginLeft: "auto",
                      display: "inline-flex",
                      alignItems: "center"
                    }}
                    onClick={() => void onRemoveEntry(selectedRecord.id)}
                    disabled={removingEntryId === selectedRecord.id}
                    aria-label={`Remove history entry for ${
                      selectedRecord.selection.componentName ?? "Unknown component"
                    }`}
                  >
                    {removingEntryId === selectedRecord.id ? "Removing..." : "Remove"}
                  </button>
                </div>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Prompt</div>
                  <pre style={{ ...historyCodeBlockStyle, ...themeStyles.card }}>
                    {selectedRecord.prompt}
                  </pre>
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Selection</div>
                  <div style={{ ...historyInfoCardStyle, ...themeStyles.card }}>
                  <div style={{ ...wrapTextStyle, ...historyBodyTextStyle }}>
                    <strong>{selectedRecord.selection.componentName ?? "Unknown component"}</strong>
                  </div>
                  <div
                    style={{
                      ...wrapTextStyle,
                      ...themeStyles.softText,
                      marginTop: 6,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12
                    }}
                  >
                    {selectedRecord.selection.selector ?? "No selector"}
                  </div>
                  <div
                    style={{
                      ...wrapTextStyle,
                      ...themeStyles.softText,
                      marginTop: 8,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12
                    }}
                  >
                    {selectedRecord.selection.source?.fileName ?? "No source location"}
                  </div>
                  </div>
                  {selectedRecord.selection.screenshot ? (
                    <div
                      style={{
                        ...cardStyle,
                        ...themeStyles.card,
                        marginTop: 10,
                        padding: 8
                      }}
                    >
                      <img
                        src={selectedRecord.selection.screenshot.dataUrl}
                        alt="Saved UI screenshot"
                        style={{
                          width: "100%",
                          maxHeight: 180,
                          objectFit: "contain",
                          display: "block",
                          borderRadius: 10
                        }}
                      />
                    </div>
                  ) : null}
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Run details</div>
                  <div style={{ ...historyInfoCardStyle, ...themeStyles.card }}>
                  <div style={{ ...themeStyles.softText, ...wrapTextStyle, ...historyBodyTextStyle }}>
                    {selectedRecord.model ?? "No model"}
                    {selectedRecord.effort ? ` · ${selectedRecord.effort}` : ""}
                    {" · "}
                    {formatHistoryTimestamp(selectedRecord.createdAt)}
                  </div>
                  <div
                    style={{
                      ...themeStyles.softText,
                      ...wrapTextStyle,
                      marginTop: 6,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12
                    }}
                  >
                    {selectedRecord.cwd ?? "No cwd"}
                  </div>
                  </div>
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Plan</div>
                  {selectedRecord.planExplanation ? (
                    <div style={{ ...historyBodyTextStyle, marginBottom: 8 }}>{selectedRecord.planExplanation}</div>
                  ) : null}
                  {selectedRecord.plan.length ? (
                    <ul style={{ paddingLeft: 18, margin: 0, ...historyBodyTextStyle }}>
                      {selectedRecord.plan.map((step) => (
                        <li key={`${selectedRecord.id}:${step.step}`}>
                          {step.status}: {step.step}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={themeStyles.softText}>No plan updates recorded.</div>
                  )}
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>
                    Reasoning summary
                  </div>
                  <pre style={{ ...historyCodeBlockStyle, ...themeStyles.card }}>
                    {selectedRecord.reasoningSummary || "No reasoning summary recorded."}
                  </pre>
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>
                    Command / file activity
                  </div>
                  <pre style={{ ...historyCodeBlockStyle, ...themeStyles.card }}>
                    {selectedRecord.commandOutput || "No command output recorded."}
                  </pre>
                </section>

                <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                  <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Current diff</div>
                  {selectedRecord.diff ? (
                    <DiffPreview patch={selectedRecord.diff} theme={theme} />
                  ) : (
                    <pre style={{ ...historyCodeBlockStyle, ...themeStyles.card }}>
                      No diff recorded.
                    </pre>
                  )}
                </section>

                {selectedRecord.errorMessage ? (
                  <section style={{ ...historySectionStyle, ...sectionStyle, ...themeStyles.section }}>
                    <div style={{ ...historySectionHeadingStyle, ...themeStyles.mutedText }}>Error</div>
                    <pre style={{ ...historyCodeBlockStyle, ...themeStyles.card }}>
                      {selectedRecord.errorMessage}
                    </pre>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const ShortcutDialog = ({
  shortcutLabel,
  isRecordingShortcut,
  onStartShortcutRecording,
  onResetShortcut,
  onClose,
  themeStyles
}: {
  shortcutLabel: string;
  isRecordingShortcut: boolean;
  onStartShortcutRecording(): void;
  onResetShortcut(): void;
  onClose(): void;
  themeStyles: OverlayThemeStyles;
}) => (
  <div
    style={shortcutDialogOverlayStyle}
    onPointerDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}
    data-codex-grab-overlay="true"
  >
    <div
      style={{
        ...shortcutDialogStyle,
        ...themeStyles.widget,
        boxShadow: "0 24px 56px rgba(0, 0, 0, 0.24)"
      }}
      data-shortcut-dialog="true"
      data-codex-grab-overlay="true"
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: themeStyles.softText.color
            }}
          >
            Launcher
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
              fontSize: 28,
              fontWeight: 650,
              letterSpacing: "-0.03em",
              lineHeight: 1
            }}
          >
            Picker shortcut
          </div>
          <div
            style={{
              ...themeStyles.softText,
              marginTop: 10,
              maxWidth: 240,
              fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            Trigger select mode without clicking the launcher.
          </div>
        </div>
        <button
          type="button"
          style={{
            ...iconButtonStyle,
            ...themeStyles.iconButton,
            width: 40,
            height: 40,
            flexShrink: 0
          }}
          onClick={onClose}
          aria-label="Close picker shortcut dialog"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>
      <div
        style={{
          ...cardStyle,
          ...themeStyles.card,
          marginTop: 18,
          padding: "14px 16px",
          borderRadius: 18,
          fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
          fontSize: 24,
          fontWeight: 650,
          letterSpacing: "-0.03em",
          lineHeight: 1.1
        }}
      >
        {shortcutLabel}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "stretch" }}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            ...themeStyles.primaryButton,
            flex: 1,
            minHeight: 46,
            borderRadius: 999,
            fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
            fontSize: 17,
            fontWeight: 650,
            letterSpacing: "-0.02em"
          }}
          onClick={onStartShortcutRecording}
        >
          {isRecordingShortcut ? "Press keys..." : "Record shortcut"}
        </button>
        <button
          type="button"
          style={{
            ...secondaryButtonStyle,
            ...themeStyles.secondaryButton,
            minHeight: 46,
            padding: "0 22px",
            borderRadius: 999,
            fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.02em"
          }}
          onClick={onResetShortcut}
        >
          Reset
        </button>
      </div>
      <div
        style={{
          ...themeStyles.softText,
          marginTop: 14,
          ...wrapTextStyle,
          fontFamily: '"Avenir Next", "Segoe UI", ui-sans-serif, sans-serif',
          fontSize: 13,
          lineHeight: 1.5
        }}
      >
        Default: {shortcutToLabel(DEFAULT_SHORTCUT)}. Shortcut capture pauses while inputs are focused
        or text is selected.
      </div>
    </div>
  </div>
);

export const CodexGrabOverlay = () => {
  const {
    widgets,
    isSelecting,
    unsupportedMessage,
    startSelection,
    cancelSelection,
    collapseAllWidgets,
    history,
    historyStatus,
    historyError,
    isHistoryOpen,
    openHistory,
    closeHistory,
    clearHistory,
    removeHistoryEntry,
    clearPersistedWidgets
  } = useCodexGrab();
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [autoFocusWidgetId, setAutoFocusWidgetId] = useState<string | null>(null);
  const [overlayHidden, setOverlayHidden] = useState<boolean>(() => readOverlayHiddenPreference());
  const [shortcut, setShortcut] = useState<string>(() => readShortcutPreference());
  const [theme, setTheme] = useState<OverlayTheme>(() => readThemePreference());
  const [launcherCorner, setLauncherCorner] = useState<LauncherCorner>(() =>
    readLauncherCornerPreference(),
  );
  const [launcherDragPosition, setLauncherDragPosition] = useState<{ left: number; top: number } | null>(null);
  const [launcherContextMenu, setLauncherContextMenu] = useState<LauncherContextMenuState | null>(null);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [removingHistoryId, setRemovingHistoryId] = useState<string | null>(null);
  const shortcutLabel = useMemo(() => shortcutToLabel(shortcut), [shortcut]);
  const themeStyles = useMemo(() => getThemeStyles(theme), [theme]);
  const previousWidgetIdsRef = useRef<string[]>([]);
  const launcherDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    moveHandler: (event: PointerEvent) => void;
    upHandler: (event: PointerEvent) => void;
  } | null>(null);
  const suppressLauncherClickRef = useRef(false);

  useEffect(() => {
    const previousIds = previousWidgetIdsRef.current;
    previousWidgetIdsRef.current = widgets.map((widget) => widget.id);

    if (!widgets.length) {
      setActiveWidgetId(null);
      setAutoFocusWidgetId(null);
      return;
    }

    const newlyAddedWidget = widgets.find((widget) => !previousIds.includes(widget.id));
    if (newlyAddedWidget) {
      setActiveWidgetId(null);
      setAutoFocusWidgetId(newlyAddedWidget.id);
      return;
    }

    if (activeWidgetId && widgets.some((widget) => widget.id === activeWidgetId)) {
      return;
    }

    if (activeWidgetId !== null) {
      setActiveWidgetId(null);
    }
  }, [activeWidgetId, widgets]);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    if (!history.length) {
      setSelectedHistoryId(null);
      return;
    }

    if (!selectedHistoryId || !history.some((record) => record.id === selectedHistoryId)) {
      setSelectedHistoryId(history[0]?.id ?? null);
    }
  }, [history, isHistoryOpen, selectedHistoryId]);

  useEffect(() => {
    if (!isHistoryOpen || typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousDocumentOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
    };
  }, [isHistoryOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const widget = target.closest("[data-widget-id]");
      if (widget instanceof HTMLElement) {
        setActiveWidgetId(widget.dataset.widgetId ?? null);
        return;
      }

      if (!target.closest("[data-codex-grab-overlay='true']")) {
        setActiveWidgetId(null);
        setAutoFocusWidgetId(null);
        collapseAllWidgets();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [collapseAllWidgets]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isRecordingShortcut) {
        const nextShortcut = eventToShortcut(event);
        if (!nextShortcut) {
          return;
        }

        event.preventDefault();
        setShortcut(nextShortcut);
        writeShortcutPreference(nextShortcut);
        setIsRecordingShortcut(false);
        return;
      }

      if (
        isEditableTarget(event.target) ||
        (window.getSelection()?.toString().trim() ?? "").length > 0
      ) {
        return;
      }

      if (!shortcutMatches(event, shortcut) || event.repeat) {
        return;
      }

      event.preventDefault();
      if (isSelecting) {
        cancelSelection();
      } else {
        startSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelSelection, isRecordingShortcut, isSelecting, shortcut, startSelection]);

  useEffect(() => {
    if (!isShortcutDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRecordingShortcut) {
        setIsShortcutDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecordingShortcut, isShortcutDialogOpen]);

  useEffect(
    () => () => {
      const dragState = launcherDragRef.current;
      if (!dragState) {
        return;
      }

      window.removeEventListener("pointermove", dragState.moveHandler);
      window.removeEventListener("pointerup", dragState.upHandler);
      window.removeEventListener("pointercancel", dragState.upHandler);
    },
    [],
  );

  const launcherActions = useMemo(
    () => [
      {
        id: "theme",
        kind: "theme" as const,
        label: "Appearance",
        description: theme === "dark" ? "Dark mode" : "Light mode",
        icon: theme === "dark" ? <MoonIcon /> : <SunIcon />,
        onSelect: () => {
          const nextTheme = theme === "dark" ? "light" : "dark";
          setTheme(nextTheme);
          writeThemePreference(nextTheme);
        }
      },
      {
        id: "shortcut",
        kind: "button" as const,
        label: "Picker shortcut",
        meta: shortcutLabel,
        icon: <CrosshairIcon />,
        onSelect: () => {
          setIsShortcutDialogOpen(true);
          setLauncherContextMenu(null);
        }
      },
      {
        id: "history",
        kind: "button" as const,
        label: "History",
        meta: String(history.length),
        icon: <HistoryIcon />,
        onSelect: () => {
          openHistory();
          setLauncherContextMenu(null);
        }
      },
      ...(widgets.length > 0
        ? [
            {
              id: "clear",
              kind: "button" as const,
              label: "Clear saved widgets",
              meta: String(widgets.length),
              icon: <CloseIcon />,
              onSelect: async () => {
                await clearPersistedWidgets();
                setLauncherContextMenu(null);
              }
            }
          ]
        : []),
      {
        id: "hide",
        kind: "button" as const,
        label: "Hide for this session",
        meta: "Session",
        icon: <EyeOffIcon />,
        onSelect: () => {
          writeOverlayHiddenCookie(true);
          setOverlayHidden(true);
          setLauncherContextMenu(null);
        }
      }
    ],
    [clearPersistedWidgets, history.length, openHistory, shortcutLabel, theme, widgets.length],
  );

  const launcherFanoutThemeStyles = useMemo(
    () =>
      theme === "dark"
        ? {
            button: {
              border: "1px solid rgba(255,255,255,0.1)",
              background:
                "linear-gradient(180deg, rgba(20,22,30,0.98), rgba(7,9,15,0.985))",
              boxShadow: "0 18px 34px rgba(15, 23, 42, 0.18)",
              color: "#f8fafc"
            },
            icon: {
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)"
            },
            meta: {
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)"
            },
            eyebrow: {
              color: "rgba(244, 244, 245, 0.56)"
            },
            hoverShadow: "0 22px 40px rgba(15, 23, 42, 0.22)"
          }
        : {
            button: {
              border: "1px solid rgba(148,163,184,0.28)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.96))",
              boxShadow:
                "0 18px 36px rgba(148, 163, 184, 0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
              color: "#0f172a"
            },
            icon: {
              background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(226,232,240,0.9))",
              border: "1px solid rgba(148,163,184,0.22)"
            },
            meta: {
              background: "rgba(248,250,252,0.9)",
              border: "1px solid rgba(148,163,184,0.22)"
            },
            eyebrow: {
              color: "rgba(71, 85, 105, 0.82)"
            },
            hoverShadow: "0 22px 40px rgba(148, 163, 184, 0.22)"
          },
    [theme],
  );

  useEffect(() => {
    if (!launcherContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        (!target.closest("[data-codex-grab-launcher-menu='true']") &&
          !target.closest("[data-codex-grab-launcher='true']"))
      ) {
        setLauncherContextMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLauncherContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [launcherContextMenu]);

  const startLauncherDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    setLauncherContextMenu(null);
    if (event.button !== 0) {
      return;
    }

    const currentTarget = event.currentTarget.getBoundingClientRect();
    const dragState = launcherDragRef.current;
    if (dragState) {
      window.removeEventListener("pointermove", dragState.moveHandler);
      window.removeEventListener("pointerup", dragState.upHandler);
      window.removeEventListener("pointercancel", dragState.upHandler);
    }

    const moveHandler = (moveEvent: PointerEvent) => {
      const currentDrag = launcherDragRef.current;
      if (!currentDrag || moveEvent.pointerId !== currentDrag.pointerId) {
        return;
      }

      const nextLeft = moveEvent.clientX - currentDrag.offsetX;
      const nextTop = moveEvent.clientY - currentDrag.offsetY;
      const clamped = clampLauncherDockPosition(nextLeft, nextTop);
      if (
        Math.abs(moveEvent.clientX - currentDrag.startX) > 4 ||
        Math.abs(moveEvent.clientY - currentDrag.startY) > 4
      ) {
        currentDrag.moved = true;
        suppressLauncherClickRef.current = true;
      }

      moveEvent.preventDefault();
      setLauncherDragPosition(clamped);
    };

    const upHandler = (upEvent: PointerEvent) => {
      const currentDrag = launcherDragRef.current;
      if (!currentDrag || upEvent.pointerId !== currentDrag.pointerId) {
        return;
      }

      window.removeEventListener("pointermove", currentDrag.moveHandler);
      window.removeEventListener("pointerup", currentDrag.upHandler);
      window.removeEventListener("pointercancel", currentDrag.upHandler);
      launcherDragRef.current = null;

      if (currentDrag.moved) {
        const nextCorner = getClosestLauncherCorner(upEvent.clientX, upEvent.clientY);
        setLauncherCorner(nextCorner);
        writeLauncherCornerPreference(nextCorner);
      }

      setLauncherDragPosition(null);
    };

    launcherDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - currentTarget.left,
      offsetY: event.clientY - currentTarget.top,
      moved: false,
      moveHandler,
      upHandler
    };

    window.addEventListener("pointermove", moveHandler, { passive: false });
    window.addEventListener("pointerup", upHandler);
    window.addEventListener("pointercancel", upHandler);
  };

  if (overlayHidden) {
    return null;
  }

  return (
    <>
      <div
        style={{
          ...launcherDockStyle,
          ...(launcherDragPosition
            ? { top: launcherDragPosition.top, left: launcherDragPosition.left }
            : getLauncherDockPosition(launcherCorner))
        }}
        onPointerDown={startLauncherDrag}
        data-codex-grab-overlay="true"
      >
        <motion.button
          type="button"
          style={{ ...launcherStyle, ...themeStyles.launcher }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            if (suppressLauncherClickRef.current) {
              suppressLauncherClickRef.current = false;
              return;
            }

            if (isSelecting) {
              cancelSelection();
              return;
            }

            startSelection();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const launcherRect = event.currentTarget.getBoundingClientRect();
            setLauncherContextMenu((current) =>
              current
                ? null
                : getLauncherContextMenuState(launcherRect),
            );
          }}
          aria-label={isSelecting ? "Cancel selection" : "Select area for codex-grab"}
          title={isSelecting ? "Cancel pick" : `Pick area (${shortcutLabel})`}
          data-codex-grab-overlay="true"
          data-codex-grab-launcher="true"
        >
          <CrosshairIcon />
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {launcherContextMenu ? (
          <div style={launcherFanoutFieldStyle} data-codex-grab-overlay="true">
            {launcherActions.map((action, index) => {
              const verticalMultiplier = launcherContextMenu.direction === "up" ? -1 : 1;
              const step = 60;
              const top =
                launcherContextMenu.anchorY +
                verticalMultiplier * (index + 1) * step -
                24;
              const left = Math.min(
                Math.max(16, launcherContextMenu.anchorX - 112),
                window.innerWidth - 16 - 224,
              );

              return (
                <motion.button
                  key={action.id}
                  type="button"
                  style={{
                    ...launcherFanoutItemStyle,
                    ...launcherFanoutButtonStyle,
                    ...launcherFanoutThemeStyles.button,
                    left,
                    top,
                    color: themeStyles.widget.color
                  }}
                  initial={{
                    opacity: 0,
                    scale: 0.88,
                    y: launcherContextMenu.anchorY - top
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.92,
                    y: launcherContextMenu.anchorY - top
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                    mass: 0.62,
                    delay: index * 0.03
                  }}
                  whileHover={{
                    y: -1,
                    boxShadow: launcherFanoutThemeStyles.hoverShadow
                  }}
                  onClick={() => {
                    void action.onSelect();
                  }}
                  aria-label={
                    action.kind === "theme"
                      ? `${action.label}: ${action.description}`
                      : action.label
                  }
                  data-codex-grab-launcher-menu="true"
                >
                  <span
                    style={{
                      ...launcherFanoutIconWrapStyle,
                      ...launcherFanoutThemeStyles.icon
                    }}
                  >
                    {action.icon}
                  </span>
                  {action.kind === "theme" ? (
                    <>
                      <span style={launcherFanoutLabelGroupStyle}>
                        <span style={launcherFanoutLabelTextStyle}>{action.label}</span>
                        <span
                          style={{
                            ...launcherFanoutEyebrowStyle,
                            ...launcherFanoutThemeStyles.eyebrow
                          }}
                        >
                          {action.description}
                        </span>
                      </span>
                      <span
                        style={{
                          ...themeStyles.themeToggleGroup,
                          ...launcherFanoutThemeGroupStyle
                        }}
                        aria-hidden="true"
                      >
                        <motion.div
                          style={{
                            ...themeStyles.themeToggleButtonActive,
                            top: 2,
                            left: 3,
                            width: 26,
                            height: 26
                          }}
                          animate={{ x: theme === "dark" ? 29 : 0 }}
                          transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        />
                        <span
                          style={{
                            ...themeStyles.themeToggleButton,
                            position: "absolute",
                            top: "50%",
                            left: 8,
                            transform: "translateY(-50%)",
                            color: theme === "light" ? "#f8fafc" : themeStyles.softText.color
                          }}
                        >
                          <SunIcon />
                        </span>
                        <span
                          style={{
                            ...themeStyles.themeToggleButton,
                            position: "absolute",
                            top: "50%",
                            right: 8,
                            transform: "translateY(-50%)",
                            color: theme === "dark" ? "#111827" : themeStyles.softText.color
                          }}
                        >
                          <MoonIcon />
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={launcherFanoutLabelTextStyle}>{action.label}</span>
                      <span
                        style={{
                          ...launcherFanoutMetaStyle,
                          ...launcherFanoutThemeStyles.meta,
                          ...themeStyles.softText
                        }}
                      >
                        {action.meta}
                      </span>
                    </>
                  )}
                </motion.button>
              );
            })}
          </div>
        ) : null}
      </AnimatePresence>

      {isHistoryOpen ? (
        <HistoryDialog
          history={history}
          historyStatus={historyStatus}
          historyError={historyError}
          selectedHistoryId={selectedHistoryId}
          onSelectHistory={setSelectedHistoryId}
          onClose={closeHistory}
          onClear={async () => {
            setIsClearingHistory(true);
            await clearHistory();
            setSelectedHistoryId(null);
            setIsClearingHistory(false);
          }}
          isClearing={isClearingHistory}
          onRemoveEntry={async (historyId) => {
            setRemovingHistoryId(historyId);
            await removeHistoryEntry(historyId);
            setRemovingHistoryId((current) => (current === historyId ? null : current));
          }}
          removingEntryId={removingHistoryId}
          theme={theme}
          themeStyles={themeStyles}
        />
      ) : null}

      {isShortcutDialogOpen ? (
        <ShortcutDialog
          shortcutLabel={shortcutLabel}
          isRecordingShortcut={isRecordingShortcut}
          onStartShortcutRecording={() => setIsRecordingShortcut(true)}
          onResetShortcut={() => {
            setShortcut(DEFAULT_SHORTCUT);
            writeShortcutPreference(DEFAULT_SHORTCUT);
            setIsRecordingShortcut(false);
          }}
          onClose={() => {
            setIsShortcutDialogOpen(false);
            setIsRecordingShortcut(false);
          }}
          themeStyles={themeStyles}
        />
      ) : null}

      {unsupportedMessage ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 84,
            zIndex: 2_147_483_100,
            padding: "10px 12px",
            borderRadius: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            ...themeStyles.unsupportedToast
          }}
          data-codex-grab-overlay="true"
        >
          {unsupportedMessage}
        </div>
      ) : null}

      <AnimatePresence>
        {widgets.map((widget) => (
          <WidgetPanel
            key={widget.id}
            widget={widget}
            focused={activeWidgetId === widget.id}
            autoFocus={autoFocusWidgetId === widget.id}
            onFocus={setActiveWidgetId}
            onAutoFocusConsumed={(widgetId) => {
              setAutoFocusWidgetId((current) => (current === widgetId ? null : current));
            }}
            theme={theme}
            themeStyles={themeStyles}
          />
        ))}
      </AnimatePresence>
    </>
  );
};
