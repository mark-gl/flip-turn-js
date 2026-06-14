import { defaultOptions } from "../core/options";
import type {
  CornerMask,
  FlipTurnOptions,
  HardOption,
  PageTurnGradientOptions,
  PageTurnOptions,
} from "../types/options";
import type { Corner } from "../types/primitives";

type Coercer<TValue> = (value: string | undefined) => TValue | undefined;
type RawCoercer = Coercer<unknown>;

const CORNER_KEYS: Corner[] = ["tl", "tr", "bl", "br"];
const CORNER_KEY_SET = new Set<string>(CORNER_KEYS);

const CORNER_PRESETS: Record<string, Corner[]> = {
  all: CORNER_KEYS,
  none: [],
  forward: ["tr", "br"],
  backward: ["tl", "bl"],
};

const datasetAliases: Record<string, string[]> = {
  duration: ["animationDuration"],
};

function readRaw(dataset: DOMStringMap, key: string): string | undefined {
  const direct = dataset[key];
  if (direct !== undefined) return direct;
  for (const alias of datasetAliases[key] ?? []) {
    const value = dataset[alias];
    if (value !== undefined) return value;
  }
  return undefined;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseFiniteNumber(
  value: string | undefined,
  minimum?: number
): number | undefined {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return undefined;
  if (minimum !== undefined && parsed < minimum) return undefined;
  return parsed;
}

const coerceBoolean: Coercer<boolean> = (value) => {
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
};

const coerceNumber: Coercer<number> = (value) => parseFiniteNumber(value);

const coerceDimension: Coercer<number> = (value) => parseFiniteNumber(value, 1);

const coerceString: Coercer<string> = (value) => value;

const coerceHard: Coercer<HardOption> = (value) => {
  if (value === undefined) return undefined;
  const asBoolean = coerceBoolean(value);
  if (asBoolean !== undefined) return asBoolean;
  if (value === "cover") return "cover";
  const pages = splitList(value).map((token) => Number.parseInt(token, 10));
  if (
    pages.length > 0 &&
    pages.every((page) => Number.isFinite(page) && page > 0)
  ) {
    return pages;
  }
  return undefined;
};

const coerceCornerMask: Coercer<CornerMask> = (value) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const preset = CORNER_PRESETS[trimmed];
  const tokens = preset ?? splitList(trimmed);
  const selected = tokens.filter((token): token is Corner =>
    CORNER_KEY_SET.has(token)
  );

  if (preset === undefined && selected.length === 0) return undefined;

  const mask: CornerMask = {};
  for (const corner of selected) {
    mask[corner] = true;
  }
  return mask;
};

const coerceGradients: Coercer<boolean | PageTurnGradientOptions> = (value) => {
  if (value === undefined) return undefined;
  const asBoolean = coerceBoolean(value);
  if (asBoolean !== undefined) return asBoolean;

  const faces = splitList(value);
  const front = faces.includes("front");
  const back = faces.includes("back");
  if (!front && !back) return undefined;
  return { front, back };
};

const coerceBackFace: Coercer<number | null> = (value) => {
  if (value === undefined) return undefined;
  if (value === "none" || value === "null") return null;
  const parsed = parseFiniteNumber(value, 1);
  return parsed === undefined ? undefined : Math.floor(parsed);
};

function buildPartial(
  dataset: DOMStringMap,
  coercers: Record<string, RawCoercer | null | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(coercers)) {
    const coercer = coercers[key];
    if (coercer == null) continue;
    const parsed = coercer(readRaw(dataset, key));
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }
  return result;
}

type AutoInferable = number | boolean | string;

type NeedsOverride = {
  [Key in keyof FlipTurnOptions]: FlipTurnOptions[Key] extends AutoInferable
    ? never
    : Key;
}[keyof FlipTurnOptions];

const structuredCoercers: {
  [Key in NeedsOverride]: Coercer<FlipTurnOptions[Key]> | null;
} = {
  corners: coerceCornerMask,
  hard: coerceHard,
  width: coerceDimension,
  height: coerceDimension,
  cornerOutset: coerceNumber,
  pages: null,
  pageOptions: null,
  when: null,
};

function inferCoercer(defaultValue: unknown): RawCoercer | null {
  if (typeof defaultValue === "boolean") return coerceBoolean;
  if (typeof defaultValue === "number") return coerceNumber;
  if (typeof defaultValue === "string") return coerceString;
  return null;
}

const overrideKeys = new Set<string>(Object.keys(structuredCoercers));

const topLevelCoercers: Record<string, RawCoercer | null | undefined> =
  Object.fromEntries(
    Object.keys(defaultOptions).map((key) => [
      key,
      overrideKeys.has(key)
        ? (structuredCoercers as Record<string, RawCoercer | null>)[key]
        : inferCoercer(defaultOptions[key as keyof FlipTurnOptions]),
    ])
  );

const pageTurnCoercers: {
  [Key in keyof Required<PageTurnOptions>]: Coercer<
    Required<PageTurnOptions>[Key]
  >;
} = {
  duration: coerceNumber,
  corners: coerceCornerMask,
  cornerSize: coerceNumber,
  elevation: coerceNumber,
  gradients: coerceGradients,
  hard: coerceBoolean,
  hardThickness: coerceNumber,
  backFace: coerceBackFace,
};

export function optionsFromDataAttributes(
  element: HTMLElement
): Partial<FlipTurnOptions> {
  return buildPartial(
    element.dataset,
    topLevelCoercers
  ) as Partial<FlipTurnOptions>;
}

export function pageTurnOptionsFromDataAttributes(
  element: HTMLElement | undefined
): PageTurnOptions {
  if (element === undefined) return {};
  return buildPartial(
    element.dataset,
    pageTurnCoercers as Record<string, RawCoercer>
  ) as PageTurnOptions;
}
