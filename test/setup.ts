const noop = () => {};

Object.defineProperty(globalThis, "scrollTo", {
  configurable: true,
  writable: true,
  value: noop
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: noop
  });
}
