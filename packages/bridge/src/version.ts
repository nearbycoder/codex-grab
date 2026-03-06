export const BRIDGE_VERSION = "0.1.0";
export const MIN_CODEX_VERSION = "0.108.0";

const parseVersion = (value: string): number[] =>
  value
    .replace(/^[^\d]*/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

export const isSupportedCodexVersion = (version: string): boolean => {
  const actual = parseVersion(version);
  const minimum = parseVersion(MIN_CODEX_VERSION);

  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (actualPart > minimumPart) {
      return true;
    }

    if (actualPart < minimumPart) {
      return false;
    }
  }

  return true;
};
