import { createElementSelector } from "./selector.js";
import { freeze, unfreeze } from "./freeze.js";

describe("createElementSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="target">Target</div>
      <div data-codex-grab-overlay="true" id="ignore-me">Overlay</div>
    `;
  });

  it("starts and stops selection lifecycle", () => {
    const controller = createElementSelector({
      onSelect: () => undefined
    });

    controller.start();
    expect(controller.isActive()).toBe(true);
    controller.stop();
    expect(controller.isActive()).toBe(false);
  });

  it("cancels on escape", () => {
    const onCancel = vi.fn();
    const controller = createElementSelector({
      onSelect: () => undefined,
      onCancel
    });

    controller.start();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });

  it("freezes and unfreezes document state", () => {
    freeze();
    expect(document.documentElement.dataset.codexGrabFrozen).toBe("true");
    unfreeze();
    expect(document.documentElement.dataset.codexGrabFrozen).toBeUndefined();
  });
});
