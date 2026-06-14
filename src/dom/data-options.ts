import { defaultOptions } from "../core/options";
import type { CornerMask, FlipTurnOptions } from "../types/options";

function parseBooleanWithFallback(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function parseHardAttribute(
  dataset: DOMStringMap,
  fallback: FlipTurnOptions["hard"]
): FlipTurnOptions["hard"] {
  const value = dataset.hard;
  if (value === undefined) return fallback;
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  if (value === "cover") return "cover";
  const parts = value.split(",").map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length > 0 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return parts;
  }
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
  return value === "single" || value === "double" || value === "auto"
    ? value
    : fallback;
}

function parseCornerMask(value: string | undefined): CornerMask | undefined {
  if (value === "all") return { tl: true, tr: true, bl: true, br: true };
  if (value === "forward") return { tr: true, br: true };
  if (value === "backward") return { tl: true, bl: true };
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
  const corners = parseCornerMask(dataset.corners);

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
    hard: parseHardAttribute(dataset, defaultOptions.hard),
    hardThickness: parsePositiveNumberAttribute(
      dataset,
      ["hardThickness"],
      defaultOptions.hardThickness,
      0
    ),
    cornerSize: parsePositiveNumberAttribute(
      dataset,
      ["cornerSize"],
      defaultOptions.cornerSize,
      1
    ),
    ...(corners !== undefined ? { corners } : {}),
    pageBuffer: parsePositiveNumberAttribute(
      dataset,
      ["pageBuffer"],
      defaultOptions.pageBuffer,
      1
    ),
    width: parseDimension(dataset.width),
    height: parseDimension(dataset.height),
  };
}
