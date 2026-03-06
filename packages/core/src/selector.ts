import { getElementContext } from "./context.js";
import { freeze, unfreeze } from "./freeze.js";
import type {
  CreateElementSelectorOptions,
  GrabElementContext,
  SelectionController
} from "./types.js";

const OVERLAY_ATTRIBUTE = "data-codex-grab-overlay";

const isIgnoredByDefault = (element: Element): boolean =>
  Boolean(element.closest(`[${OVERLAY_ATTRIBUTE}="true"]`));

export const createElementSelector = (
  options: CreateElementSelectorOptions,
): SelectionController => {
  let active = false;
  let overlay: HTMLDivElement | null = null;

  const teardown = (cancelled = false): void => {
    if (!active) {
      return;
    }

    active = false;
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    overlay?.remove();
    overlay = null;

    if (cancelled) {
      options.onCancel?.();
    }
  };

  const findSelectableElement = (x: number, y: number): Element | null => {
    const previousPointerEvents = overlay?.style.pointerEvents;
    if (overlay) {
      overlay.style.pointerEvents = "none";
      overlay.style.display = "none";
    }

    const target = document.elementFromPoint(x, y);

    if (overlay) {
      overlay.style.pointerEvents = previousPointerEvents ?? "none";
      overlay.style.display = "block";
    }

    if (!target) {
      return null;
    }

    if (isIgnoredByDefault(target) || options.isIgnoredElement?.(target)) {
      return null;
    }

    return target;
  };

  const updateOverlay = (target: Element): void => {
    if (!overlay) {
      return;
    }

    const rect = target.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  };

  const handleMouseMove = (event: MouseEvent): void => {
    const target = findSelectableElement(event.clientX, event.clientY);
    if (!target) {
      if (overlay) {
        overlay.style.display = "none";
      }
      return;
    }

    updateOverlay(target);
  };

  const handleClick = async (event: MouseEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    const target = findSelectableElement(event.clientX, event.clientY);
    teardown(false);

    if (!target) {
      return;
    }

    try {
      if (options.freezeDuringCapture !== false) {
        freeze();
      }
      const context = await getElementContext(target);
      if (!context.isReactComponent) {
        options.onUnsupported?.(target);
        return;
      }
      await options.onSelect(context);
    } finally {
      unfreeze();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      teardown(true);
    }
  };

  const ensureOverlay = (): HTMLDivElement => {
    const element = document.createElement("div");
    element.className = options.overlayClassName ?? "";
    element.setAttribute(OVERLAY_ATTRIBUTE, "true");
    Object.assign(element.style, {
      position: "fixed",
      display: "none",
      pointerEvents: "none",
      border: "2px solid rgba(51, 65, 85, 0.82)",
      boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.06)",
      background: "rgba(148, 163, 184, 0.08)",
      borderRadius: "8px",
      zIndex: String(options.zIndex ?? 2_147_483_000)
    });
    document.body.appendChild(element);
    return element;
  };

  return {
    start() {
      if (active) {
        return;
      }

      active = true;
      overlay = ensureOverlay();
      document.addEventListener("mousemove", handleMouseMove, true);
      document.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleKeyDown, true);
    },
    stop() {
      teardown(true);
    },
    destroy() {
      teardown(false);
    },
    isActive() {
      return active;
    }
  };
};
