import type {
  FlipTurnOptions,
  CornerMask,
  HardOption,
  PageSourceInput,
  PageTurnOptionMap,
  ResolvedFlipTurnOptions,
} from "../types/options";
import type { Corner } from "../types/primitives";
import type { PageSource } from "../types/state";
import {
  finiteAtLeastOne,
  finiteFlooredWithin,
  finiteNonNegative,
} from "./math";

const SUPPORTED_CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

const DISABLED_CORNERS: Record<Corner, boolean> = {
  tl: false,
  tr: false,
  bl: false,
  br: false,
};

const DEFAULT_DURATION_MS = 600;
const DEFAULT_ELEVATION_PX = 50;
const DEFAULT_CORNER_SIZE_PX = 100;
const DEFAULT_HARD_THICKNESS_PX = 0;
const DEFAULT_PAGE_BUFFER = 6;

function createDefaultOptions(): FlipTurnOptions {
  return {
    page: 1,
    display: "double",
    duration: DEFAULT_DURATION_MS,
    elevation: DEFAULT_ELEVATION_PX,
    gradients: true,
    hard: false,
    hardThickness: DEFAULT_HARD_THICKNESS_PX,
    cornerSize: DEFAULT_CORNER_SIZE_PX,
    cornerOutset: null,
    corners: { tl: true, tr: true, bl: true, br: true },
    pages: [],
    pageBuffer: DEFAULT_PAGE_BUFFER,
    pageOptions: {},
    when: {},
    width: null,
    height: null,
  };
}

const internalDefaultOptions = createDefaultOptions();

function normalizeHardOption(hard: HardOption): HardOption {
  if (typeof hard === "boolean" || hard === "cover") return hard;
  const normalized = [...new Set(hard)]
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
  return normalized.length > 0 ? normalized : false;
}

export function cloneApiBoundaryOptions(
  options: Partial<FlipTurnOptions>
): Partial<FlipTurnOptions> {
  return {
    ...options,
    ...(options.pageOptions !== undefined
      ? { pageOptions: structuredClone(options.pageOptions) }
      : {}),
    ...(options.when !== undefined ? { when: { ...options.when } } : {}),
    ...(options.pages !== undefined
      ? {
          pages: Array.isArray(options.pages)
            ? [...options.pages]
            : options.pages,
        }
      : {}),
    ...(Array.isArray(options.hard) ? { hard: [...options.hard] } : {}),
  };
}

export function cloneResolvedOptionsSnapshot(
  options: ResolvedFlipTurnOptions
): ResolvedFlipTurnOptions {
  return {
    ...options,
    corners: { ...options.corners },
    pageOptions: structuredClone(options.pageOptions),
    when: { ...options.when },
    pages: Array.isArray(options.pages) ? [...options.pages] : options.pages,
    hard: Array.isArray(options.hard) ? [...options.hard] : options.hard,
  };
}

export const defaultOptions: FlipTurnOptions = {
  ...internalDefaultOptions,
  pageOptions: {},
  when: {},
  pages: [],
};

export function resolveCornerSelection(
  corners: CornerMask
): Record<Corner, boolean> {
  const normalized = { ...DISABLED_CORNERS };
  for (const corner of SUPPORTED_CORNERS) {
    normalized[corner] = Boolean(corners[corner]);
  }
  return normalized;
}

function normalizePageTurnOptions(
  pageOptions: PageTurnOptionMap
): PageTurnOptionMap {
  const normalizedEntries = Object.entries(pageOptions)
    .map(([rawPage, config]) => {
      const pageNumber = Number.parseInt(rawPage, 10);
      if (!Number.isFinite(pageNumber) || pageNumber < 1) {
        return null;
      }

      return [String(pageNumber), structuredClone(config ?? {})] as const;
    })
    .filter(
      (
        entry
      ): entry is readonly [string, FlipTurnOptions["pageOptions"][number]] =>
        entry !== null
    );

  return Object.fromEntries(normalizedEntries);
}

function normalizePageCount(pageOption: number | PageSourceInput[]): number {
  if (Array.isArray(pageOption)) {
    return pageOption.length;
  }

  return Number.isFinite(pageOption) ? Math.max(0, Math.floor(pageOption)) : 0;
}

export function resolveOptions(
  base: FlipTurnOptions,
  partial: Partial<FlipTurnOptions>
): ResolvedFlipTurnOptions {
  const detachedBase = cloneApiBoundaryOptions(base) as FlipTurnOptions;
  const detachedPartial = cloneApiBoundaryOptions(partial);

  const merged: FlipTurnOptions = {
    ...detachedBase,
    ...detachedPartial,
    pageOptions: {
      ...(detachedBase.pageOptions ?? {}),
      ...(detachedPartial.pageOptions ?? {}),
    },
    when: { ...(detachedPartial.when ?? detachedBase.when) },
  };

  const pageCount = normalizePageCount(merged.pages);
  const normalizedPageValue =
    merged.page === undefined || merged.page === null
      ? 1
      : Number(merged.page) || 1;

  return {
    ...merged,
    page: finiteFlooredWithin(normalizedPageValue, 1, { minimum: 1 }),
    display:
      merged.display === "single" || merged.display === "auto"
        ? merged.display
        : "double",
    duration: finiteNonNegative(merged.duration, detachedBase.duration),
    elevation: finiteNonNegative(merged.elevation, detachedBase.elevation),
    gradients: Boolean(merged.gradients),
    hard: normalizeHardOption(merged.hard),
    hardThickness: finiteNonNegative(
      merged.hardThickness,
      detachedBase.hardThickness
    ),
    cornerSize: finiteAtLeastOne(merged.cornerSize, detachedBase.cornerSize),
    cornerOutset:
      merged.cornerOutset === null || merged.cornerOutset === undefined
        ? finiteAtLeastOne(merged.cornerSize, detachedBase.cornerSize)
        : finiteNonNegative(merged.cornerOutset, 0),
    corners: resolveCornerSelection(merged.corners),
    pageBuffer: finiteFlooredWithin(
      merged.pageBuffer,
      detachedBase.pageBuffer,
      { minimum: 1 }
    ),
    pageOptions: normalizePageTurnOptions(merged.pageOptions ?? {}),
    pageCount,
    width:
      merged.width === null || Number.isFinite(merged.width)
        ? merged.width
        : detachedBase.width,
    height:
      merged.height === null || Number.isFinite(merged.height)
        ? merged.height
        : detachedBase.height,
  };
}

export function pageListFromOptions(
  options: ResolvedFlipTurnOptions
): PageSource[] {
  if (Array.isArray(options.pages)) {
    const slicedPages = options.pages.slice(0, options.pageCount);
    return slicedPages.map((source, index) => {
      if (!(source instanceof HTMLElement)) {
        throw new TypeError("Invalid page source");
      }

      return {
        key: `page-${index + 1}`,
        value: source,
      };
    });
  }

  if (typeof document === "undefined") {
    return [];
  }

  return Array.from({ length: options.pageCount }, (_, index) => ({
    key: `page-${index + 1}`,
    value: document.createElement("div"),
  }));
}
