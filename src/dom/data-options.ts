import { defaultOptions } from "../core/options";
import type { FlipTurnOptions } from "../types/options";

function parseBooleanWithFallback(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
  minimum = 0
): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function parseDimension(value: string | undefined): number | null {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function parseDisplay(
  value: string | undefined,
  fallback: FlipTurnOptions["display"]
): FlipTurnOptions["display"] {
  return value === "single" || value === "double" ? value : fallback;
}

function parseCornerMode(
  value: string | undefined
): FlipTurnOptions["corners"] | undefined {
  if (value === "all" || value === "forward" || value === "backward") {
    return value;
  }

  return undefined;
}

function parsePositiveNumberAttribute(
  dataset: DOMStringMap,
  keys: string[],
  fallback: number,
  minimum = 0
): number {
  for (const key of keys) {
    const value = dataset[key];
    if (value !== undefined) {
      return parsePositiveNumber(value, fallback, minimum);
    }
  }

  return fallback;
}

function parseBooleanAttribute(
  dataset: DOMStringMap,
  key: string,
  fallback: boolean
): boolean {
  return parseBooleanWithFallback(dataset[key], fallback);
}

export function optionsFromDataAttributes(
  element: HTMLElement
): Partial<FlipTurnOptions> {
  const dataset = element.dataset;
  const corners = parseCornerMode(dataset.corners);

  return {
    display: parseDisplay(dataset.display, defaultOptions.display),
    duration: parsePositiveNumberAttribute(
      dataset,
      ["duration", "animationDuration"],
      defaultOptions.duration,
      0
    ),
    page: parsePositiveNumberAttribute(
      dataset,
      ["page"],
      defaultOptions.page,
      1
    ),
    acceleration: parseBooleanAttribute(
      dataset,
      "acceleration",
      defaultOptions.acceleration
    ),
    elevation: parsePositiveNumberAttribute(
      dataset,
      ["elevation"],
      defaultOptions.elevation,
      0
    ),
    gradients: parseBooleanAttribute(
      dataset,
      "gradients",
      defaultOptions.gradients
    ),
    cornerSize: parsePositiveNumberAttribute(
      dataset,
      ["cornerSize"],
      defaultOptions.cornerSize,
      1
    ),
    ...(corners !== undefined ? { corners } : {}),
    virtualPageWindow: parsePositiveNumberAttribute(
      dataset,
      ["virtualPageWindow", "pageWindow"],
      defaultOptions.virtualPageWindow,
      1
    ),
    width: parseDimension(dataset.width),
    height: parseDimension(dataset.height),
  };
}
