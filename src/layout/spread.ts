import { clamp, point } from "../core/math";
import type {
  Corner,
  DisplayMode,
  FlipTurnState,
  PageSource,
  Point,
  TurnDirection,
  ViewportBox,
} from "../core/types";

const FIRST_PAGE_NUMBER = 1;
const FIRST_SPREAD_INDEX = 0;
const PAGES_PER_SPREAD = 2;

const cornerMetadata: Record<Corner, { isRight: boolean; isBottom: boolean }> =
  {
    tl: { isRight: false, isBottom: false },
    tr: { isRight: true, isBottom: false },
    bl: { isRight: false, isBottom: true },
    br: { isRight: true, isBottom: true },
  };

export function isSingleDisplayMode(
  state: FlipTurnState,
  displayMode: DisplayMode = state.displayMode
): boolean {
  return displayMode === "single";
}

export function isDoubleDisplayMode(
  state: FlipTurnState,
  displayMode: DisplayMode = state.displayMode
): boolean {
  return displayMode === "double";
}

export function pageIndexFromPublicPageNumber(pageNumber: number): number {
  return Math.floor(pageNumber) - FIRST_PAGE_NUMBER;
}

export function normalizePublicPageNumber(
  state: FlipTurnState,
  pageNumber: number,
  pageCount = state.pageCount,
  fallback = FIRST_PAGE_NUMBER
): number {
  const maximumPage = Math.max(FIRST_PAGE_NUMBER, pageCount);
  if (!Number.isFinite(pageNumber)) {
    return clamp(fallback, FIRST_PAGE_NUMBER, maximumPage);
  }

  return clamp(Math.floor(pageNumber), FIRST_PAGE_NUMBER, maximumPage);
}

export function normalizePageIndex(
  pageNumber: number,
  pageCount: number,
  fallback: number
): number {
  if (!Number.isFinite(pageNumber)) {
    return fallback;
  }

  return clamp(
    Math.floor(pageNumber) - FIRST_PAGE_NUMBER,
    FIRST_SPREAD_INDEX,
    pageCount
  );
}

export function hasPages(pageCount: number): boolean {
  return pageCount > 0;
}

export function hasMultiplePages(pageCount: number): boolean {
  return pageCount > FIRST_PAGE_NUMBER;
}

export function directionStep(direction: TurnDirection): 1 | -1 {
  return direction === "forward" ? 1 : -1;
}

export function isValidPageIndex(
  state: FlipTurnState,
  pageIndex: number | null
): boolean {
  return pageIndex !== null && pageIndex >= 0 && pageIndex < state.pageCount;
}

export function pageSourceAtIndex(
  state: FlipTurnState,
  pageIndex: number | null
): PageSource | null {
  if (pageIndex === null || !isValidPageIndex(state, pageIndex)) {
    return null;
  }

  return state.pages[pageIndex] ?? null;
}

export function pageSourceAtPublicPageNumber(
  state: FlipTurnState,
  pageNumber: number
): PageSource | null {
  const pageIndex = pageIndexFromPublicPageNumber(pageNumber);
  return pageSourceAtIndex(state, pageIndex);
}

export function publicPageNumberFromPageIndex(
  pageIndex: number | null
): number | null {
  if (pageIndex === null || pageIndex < FIRST_SPREAD_INDEX) {
    return null;
  }

  return pageIndex + FIRST_PAGE_NUMBER;
}

export function setCurrentFromPublicPage(
  state: FlipTurnState,
  pageNumber: number
) {
  if (!hasPages(state.pageCount)) {
    state.currentPageIndex = FIRST_SPREAD_INDEX;
    state.currentSpreadIndex = FIRST_SPREAD_INDEX;
    return;
  }

  const clampedPageNumber = normalizePublicPageNumber(state, pageNumber);
  state.currentPageIndex = pageIndexFromPublicPageNumber(clampedPageNumber);

  if (isSingleDisplayMode(state)) {
    return;
  }

  state.currentSpreadIndex =
    clampedPageNumber <= FIRST_PAGE_NUMBER
      ? FIRST_SPREAD_INDEX
      : Math.floor(clampedPageNumber / PAGES_PER_SPREAD);
}

export function sideForCorner(corner: Corner): "left" | "right" {
  return cornerMetadata[corner].isRight ? "right" : "left";
}

export function isTopCorner(corner: Corner): boolean {
  return !cornerMetadata[corner].isBottom;
}

export function isLeftCorner(corner: Corner): boolean {
  return !cornerMetadata[corner].isRight;
}

export function pageWidthForBox(
  state: FlipTurnState,
  box: ViewportBox
): number {
  return isSingleDisplayMode(state) ? box.width : box.width / 2;
}

export function directionFromCorner(corner: Corner): TurnDirection {
  return sideForCorner(corner) === "right" ? "forward" : "backward";
}

export function sideForClientX(
  state: FlipTurnState,
  clientX: number,
  box: ViewportBox
): "left" | "right" {
  if (isSingleDisplayMode(state)) {
    return "right";
  }

  return clientX - box.left >= box.width / 2 ? "right" : "left";
}

export function cornerPoint(
  corner: Corner,
  width: number,
  height: number,
  offset = 0
): Point {
  const metadata = cornerMetadata[corner];
  const x = metadata.isRight ? width - offset : offset;
  const y = metadata.isBottom ? height - offset : offset;
  return point(x, y);
}

export function farCornerPoint(
  corner: Corner,
  width: number,
  height: number
): Point {
  const metadata = cornerMetadata[corner];
  const x = metadata.isRight ? -width : width * 2;
  const y = metadata.isBottom ? height : 0;
  return point(x, y);
}

function maxSpreadIndex(state: FlipTurnState) {
  if (!hasMultiplePages(state.pageCount)) {
    return FIRST_SPREAD_INDEX;
  }

  return Math.ceil((state.pageCount - FIRST_PAGE_NUMBER) / PAGES_PER_SPREAD);
}

export function spreadPageIndicesAt(
  state: FlipTurnState,
  spreadIndex: number
): {
  left: number | null;
  right: number | null;
} {
  const normalizedSpread = clamp(
    Math.round(spreadIndex),
    FIRST_SPREAD_INDEX,
    maxSpreadIndex(state)
  );

  const leftPageNumber =
    normalizedSpread === FIRST_SPREAD_INDEX
      ? FIRST_SPREAD_INDEX
      : normalizedSpread * PAGES_PER_SPREAD;
  const rightPageNumber =
    normalizedSpread === FIRST_SPREAD_INDEX
      ? FIRST_PAGE_NUMBER
      : normalizedSpread * PAGES_PER_SPREAD + FIRST_PAGE_NUMBER;

  const leftIndex =
    leftPageNumber >= FIRST_PAGE_NUMBER && leftPageNumber <= state.pageCount
      ? leftPageNumber - FIRST_PAGE_NUMBER
      : null;
  const rightIndex =
    rightPageNumber >= FIRST_PAGE_NUMBER && rightPageNumber <= state.pageCount
      ? rightPageNumber - FIRST_PAGE_NUMBER
      : null;

  return { left: leftIndex, right: rightIndex };
}

export function canTurnForward(state: FlipTurnState): boolean {
  if (!hasMultiplePages(state.pageCount)) {
    return false;
  }

  if (isSingleDisplayMode(state)) {
    return state.currentPageIndex < state.pageCount - FIRST_PAGE_NUMBER;
  }

  return state.currentSpreadIndex < maxSpreadIndex(state);
}

export function canTurnBackward(state: FlipTurnState): boolean {
  if (!hasMultiplePages(state.pageCount)) {
    return false;
  }

  if (isSingleDisplayMode(state)) {
    return state.currentPageIndex > FIRST_SPREAD_INDEX;
  }

  return state.currentSpreadIndex > FIRST_SPREAD_INDEX;
}

export function canTurnDirection(
  state: FlipTurnState,
  direction: TurnDirection
): boolean {
  return direction === "forward"
    ? canTurnForward(state)
    : canTurnBackward(state);
}

export function currentPublicPageNumber(state: FlipTurnState): number {
  if (!hasPages(state.pageCount)) {
    return FIRST_PAGE_NUMBER;
  }

  if (isSingleDisplayMode(state)) {
    return state.currentPageIndex + FIRST_PAGE_NUMBER;
  }

  const spread = spreadPageIndicesAt(state, state.currentSpreadIndex);
  const preferredPage = spread.right ?? spread.left ?? FIRST_SPREAD_INDEX;
  return preferredPage + FIRST_PAGE_NUMBER;
}

export function currentTurnPosition(state: FlipTurnState): number {
  return isSingleDisplayMode(state)
    ? state.currentPageIndex
    : state.currentSpreadIndex;
}

export function turnPositionForPublicPage(
  state: FlipTurnState,
  pageNumber: number
): number {
  const normalizedPage = normalizePublicPageNumber(state, pageNumber);

  if (isSingleDisplayMode(state)) {
    return pageIndexFromPublicPageNumber(normalizedPage);
  }

  return normalizedPage <= FIRST_PAGE_NUMBER
    ? FIRST_SPREAD_INDEX
    : Math.floor(normalizedPage / PAGES_PER_SPREAD);
}

export function maxTurnPosition(state: FlipTurnState): number {
  if (!hasPages(state.pageCount)) {
    return FIRST_SPREAD_INDEX;
  }

  if (isSingleDisplayMode(state)) {
    return Math.max(FIRST_SPREAD_INDEX, state.pageCount - FIRST_PAGE_NUMBER);
  }

  return Math.max(
    FIRST_SPREAD_INDEX,
    Math.ceil((state.pageCount - FIRST_PAGE_NUMBER) / PAGES_PER_SPREAD)
  );
}

export function virtualPageWindowRange(state: FlipTurnState): {
  start: number;
  end: number;
} {
  if (!hasPages(state.pageCount)) {
    return { start: FIRST_SPREAD_INDEX, end: FIRST_SPREAD_INDEX };
  }

  const windowSize = Math.max(
    FIRST_PAGE_NUMBER,
    Math.floor(state.options.virtualPageWindow)
  );

  if (isSingleDisplayMode(state)) {
    const currentPage = currentPublicPageNumber(state);
    const halfWindow = Math.floor(
      (windowSize - FIRST_PAGE_NUMBER) / PAGES_PER_SPREAD
    );
    let start = currentPage - halfWindow;
    let end = start + windowSize - FIRST_PAGE_NUMBER;

    if (start < FIRST_PAGE_NUMBER) {
      start = FIRST_PAGE_NUMBER;
      end = Math.min(state.pageCount, start + windowSize - FIRST_PAGE_NUMBER);
    }

    if (end > state.pageCount) {
      end = state.pageCount;
      start = Math.max(FIRST_PAGE_NUMBER, end - windowSize + FIRST_PAGE_NUMBER);
    }

    return { start, end };
  }

  const spreadCount = maxSpreadIndex(state) + FIRST_PAGE_NUMBER;
  const visibleSpreadCount = Math.max(
    FIRST_PAGE_NUMBER,
    Math.ceil(windowSize / PAGES_PER_SPREAD)
  );
  const spreadHalfWindow = Math.floor(
    (visibleSpreadCount - FIRST_PAGE_NUMBER) / PAGES_PER_SPREAD
  );
  let startSpread = state.currentSpreadIndex - spreadHalfWindow;

  if (startSpread < FIRST_SPREAD_INDEX) {
    startSpread = FIRST_SPREAD_INDEX;
  }

  const maxStartSpread = Math.max(
    FIRST_SPREAD_INDEX,
    spreadCount - visibleSpreadCount
  );
  if (startSpread > maxStartSpread) {
    startSpread = maxStartSpread;
  }

  const endSpread = Math.min(
    spreadCount - FIRST_PAGE_NUMBER,
    startSpread + visibleSpreadCount - FIRST_PAGE_NUMBER
  );
  const startPage =
    startSpread === FIRST_SPREAD_INDEX
      ? FIRST_PAGE_NUMBER
      : startSpread * PAGES_PER_SPREAD;
  const endingSpread = spreadPageIndicesAt(state, endSpread);
  const endIndex =
    endingSpread.right ?? endingSpread.left ?? FIRST_SPREAD_INDEX;
  const endPage = endIndex + FIRST_PAGE_NUMBER;

  return {
    start: Math.max(FIRST_PAGE_NUMBER, startPage),
    end: Math.min(state.pageCount, endPage),
  };
}
