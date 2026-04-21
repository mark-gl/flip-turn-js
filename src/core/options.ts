import {
  finiteAtLeastOne,
  finiteFlooredWithin,
  finiteNonNegative,
} from "./math";
import type {
  CornerMode,
  FlipTurnOptions,
  PageSourceInput,
  PageTurnOptionMap,
  ResolvedFlipTurnOptions,
} from "../types/options";
import type { Corner } from "../types/primitives";
import type { PageSource } from "../types/state";

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
const DEFAULT_PAGE_WINDOW = 6;

function createDefaultOptions(): FlipTurnOptions {
  return {
    page: 1,
    display: "double",
    pageNavigationMode: "animated",
    duration: DEFAULT_DURATION_MS,
    acceleration: true,
    elevation: DEFAULT_ELEVATION_PX,
    gradients: true,
    cornerSize: DEFAULT_CORNER_SIZE_PX,
    corners: "all",
    pages: [],
    virtualPageWindow: DEFAULT_PAGE_WINDOW,
    pageTurn: {},
    when: {},
    width: null,
    height: null,
  };
}

const internalDefaultOptions = createDefaultOptions();

export function cloneApiBoundaryOptions(
  options: Partial<FlipTurnOptions>
): Partial<FlipTurnOptions> {
  return {
    ...options,
    ...(options.pageTurn !== undefined
      ? { pageTurn: structuredClone(options.pageTurn) }
      : {}),
    ...(options.when !== undefined ? { when: { ...options.when } } : {}),
    ...(options.pages !== undefined
      ? {
          pages: Array.isArray(options.pages)
            ? [...options.pages]
            : options.pages,
        }
      : {}),
  };
}

export function cloneResolvedOptionsSnapshot(
  options: ResolvedFlipTurnOptions
): ResolvedFlipTurnOptions {
  return {
    ...options,
    corners: { ...options.corners },
    pageTurn: structuredClone(options.pageTurn),
    when: { ...options.when },
    pages: Array.isArray(options.pages) ? [...options.pages] : options.pages,
  };
}

export const defaultOptions: FlipTurnOptions = {
  ...internalDefaultOptions,
  pageTurn: {},
  when: {},
  pages: [],
};

export function resolveCornerSelection(
  corners: CornerMode
): Record<"tl" | "tr" | "bl" | "br", boolean> {
  if (corners === "all") {
    return { tl: true, tr: true, bl: true, br: true };
  }

  if (corners === "forward") {
    return { tl: false, tr: true, bl: false, br: true };
  }

  if (corners === "backward") {
    return { tl: true, tr: false, bl: true, br: false };
  }

  if (typeof corners === "string") {
    throw new TypeError(`Invalid corners option '${corners}'`);
  }

  const normalized = { ...DISABLED_CORNERS };
  for (const corner of SUPPORTED_CORNERS) {
    normalized[corner] = Boolean(corners[corner]);
  }

  return normalized;
}

function normalizePageTurnOptions(
  pageTurn: PageTurnOptionMap
): PageTurnOptionMap {
  const normalizedEntries = Object.entries(pageTurn)
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
      ): entry is readonly [string, FlipTurnOptions["pageTurn"][number]] =>
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
    pageTurn: {
      ...(detachedBase.pageTurn ?? {}),
      ...(detachedPartial.pageTurn ?? {}),
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
    display: merged.display === "single" ? "single" : "double",
    duration: finiteNonNegative(merged.duration, detachedBase.duration),
    acceleration: Boolean(merged.acceleration),
    elevation: finiteNonNegative(merged.elevation, detachedBase.elevation),
    gradients: Boolean(merged.gradients),
    cornerSize: finiteAtLeastOne(merged.cornerSize, detachedBase.cornerSize),
    corners: resolveCornerSelection(merged.corners),
    virtualPageWindow: finiteFlooredWithin(
      merged.virtualPageWindow,
      detachedBase.virtualPageWindow,
      {
        minimum: 1,
      }
    ),
    pageTurn: normalizePageTurnOptions(merged.pageTurn ?? {}),
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
