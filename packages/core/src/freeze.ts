const FREEZE_STYLE_ID = "codex-grab-freeze-style";
let freezeDepth = 0;

const ensureFreezeStyle = (): HTMLStyleElement => {
  const existing = document.getElementById(FREEZE_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const style = document.createElement("style");
  style.id = FREEZE_STYLE_ID;
  style.textContent = `
    html[data-codex-grab-frozen="true"] *,
    html[data-codex-grab-frozen="true"] *::before,
    html[data-codex-grab-frozen="true"] *::after {
      animation-play-state: paused !important;
      transition: none !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(style);
  return style;
};

export const freeze = (): void => {
  if (typeof document === "undefined") {
    return;
  }

  freezeDepth += 1;
  ensureFreezeStyle();
  document.documentElement.dataset.codexGrabFrozen = "true";
};

export const unfreeze = (): void => {
  if (typeof document === "undefined" || freezeDepth === 0) {
    return;
  }

  freezeDepth -= 1;
  if (freezeDepth > 0) {
    return;
  }

  delete document.documentElement.dataset.codexGrabFrozen;
};
