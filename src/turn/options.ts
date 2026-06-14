import { finiteAtLeastOne, finiteNonNegative } from "../core/math";
import { resolveCornerSelection } from "../core/options";
import { pageTurnOptionsFromDataAttributes } from "../dom/data-options";
import {
  isSingleDisplayMode,
  pageSourceAtPublicPageNumber,
} from "../layout/spread";
import { defaultBackPageIndex, turningPageIndex } from "../layout/turn-plan";
import type {
  HardOption,
  PageTurnGradientOptions,
  PageTurnOptions,
} from "../types/options";
import type { Corner, TurnDirection } from "../types/primitives";
import type { ActiveTurnResolvedOptions, FlipTurnState } from "../types/state";

type ResolvedGradientOptions = { front: boolean; back: boolean };

function spineMatePageNumber(
  pageNumber: number,
  pageCount: number
): number | null {
  if (pageNumber < 1 || pageNumber > pageCount) {
    return null;
  }

  const candidatePageNumber =
    pageNumber % 2 === 1 ? pageNumber + 1 : pageNumber - 1;

  return candidatePageNumber >= 1 && candidatePageNumber <= pageCount
    ? candidatePageNumber
    : null;
}

function mergedPageOverrides(
  state: FlipTurnState,
  pageIndex: number | null
): PageTurnOptions {
  if (pageIndex === null) {
    return {};
  }

  const fromElement = pageTurnOptionsFromDataAttributes(
    state.pages[pageIndex]?.value
  );
  const fromApi = state.options.pageOptions[pageIndex + 1] ?? {};
  return { ...fromElement, ...fromApi };
}

function pageOverridesForDirection(
  state: FlipTurnState,
  direction: TurnDirection
): PageTurnOptions {
  return mergedPageOverrides(state, turningPageIndex(state, direction));
}

function resolveGradientOptions(
  state: FlipTurnState,
  override: boolean | PageTurnGradientOptions | undefined
): ResolvedGradientOptions {
  const defaultGradients = {
    front: state.options.gradients,
    back: state.options.gradients,
  };

  if (override === undefined) {
    return defaultGradients;
  }

  if (typeof override === "boolean") {
    return {
      front: override,
      back: override,
    };
  }

  return {
    front: override.front ?? defaultGradients.front,
    back: override.back ?? defaultGradients.back,
  };
}

export function activeTurnGradientOptions(
  state: FlipTurnState
): ResolvedGradientOptions {
  return (
    state.activeTurnResolvedOptions?.gradients ??
    resolveGradientOptions(state, undefined)
  );
}

function isPageHardByOption(
  hard: HardOption,
  activePageNumber: number | null,
  pairedPageNumber: number | null,
  pageCount: number
): boolean {
  if (typeof hard === "boolean") return hard;
  if (hard === "cover") {
    return (
      activePageNumber === 1 ||
      activePageNumber === pageCount ||
      pairedPageNumber === 1 ||
      pairedPageNumber === pageCount
    );
  }
  if (activePageNumber !== null && hard.includes(activePageNumber)) return true;
  if (pairedPageNumber !== null && hard.includes(pairedPageNumber)) return true;
  return false;
}

export function resolveTurnOptions(
  state: FlipTurnState,
  direction: TurnDirection
): ActiveTurnResolvedOptions {
  const perPage = pageOverridesForDirection(state, direction);
  const activePageIndex = turningPageIndex(state, direction);
  const activePageNumber =
    activePageIndex === null ? null : activePageIndex + 1;
  const pairedPageNumber =
    activePageNumber === null
      ? null
      : spineMatePageNumber(activePageNumber, state.pageCount);
  const pairedPage = mergedPageOverrides(
    state,
    pairedPageNumber === null ? null : pairedPageNumber - 1
  );

  const hardFromActivePage = perPage.hard;
  const hardFromPairedPage = pairedPage.hard;
  const resolvedHard =
    hardFromActivePage === true || hardFromPairedPage === true
      ? true
      : hardFromActivePage === false
        ? false
        : hardFromPairedPage === false
          ? false
          : isPageHardByOption(
              state.options.hard,
              activePageNumber,
              isSingleDisplayMode(state) ? null : pairedPageNumber,
              state.pageCount
            );

  const hardThicknessFromPages =
    perPage.hardThickness ?? pairedPage.hardThickness;

  const resolvedCornerSize = finiteAtLeastOne(
    perPage.cornerSize,
    state.options.cornerSize
  );

  return {
    duration: finiteNonNegative(perPage.duration, state.options.duration),
    elevation: finiteNonNegative(perPage.elevation, state.options.elevation),
    hard: resolvedHard,
    hardThickness: finiteNonNegative(
      hardThicknessFromPages,
      state.options.hardThickness
    ),
    corners:
      perPage.corners !== undefined
        ? resolveCornerSelection(perPage.corners)
        : { ...state.options.corners },
    cornerSize: resolvedCornerSize,
    previewSize: finiteAtLeastOne(
      perPage.previewSize ?? state.options.previewSize ?? undefined,
      resolvedCornerSize
    ),
    gradients: resolveGradientOptions(state, perPage.gradients),
  };
}

export function isCornerAllowedForDirection(
  state: FlipTurnState,
  corner: Corner,
  direction: TurnDirection
): boolean {
  const runtimeOptions =
    state.activeTurnResolvedOptions ?? resolveTurnOptions(state, direction);
  return runtimeOptions.corners[corner];
}

export function resolvedBackPageSource(
  state: FlipTurnState,
  direction: TurnDirection
) {
  const override = pageOverridesForDirection(state, direction);
  if (override.backFace !== undefined) {
    if (override.backFace === null) {
      return null;
    }

    return pageSourceAtPublicPageNumber(state, override.backFace);
  }

  if (isSingleDisplayMode(state)) {
    const turningIndex = turningPageIndex(state, direction);
    return turningIndex === null ? null : (state.pages[turningIndex] ?? null);
  }

  const fallbackBackPage = defaultBackPageIndex(state, direction);
  if (fallbackBackPage === null) {
    return null;
  }

  return state.pages[fallbackBackPage] ?? null;
}

export function shouldRenderBackGradient(
  state: FlipTurnState,
  direction: TurnDirection
): boolean {
  const runtimeOptions =
    state.activeTurnResolvedOptions ?? resolveTurnOptions(state, direction);

  if (!runtimeOptions.gradients.back) {
    return false;
  }

  if (isSingleDisplayMode(state)) {
    return true;
  }

  const activePageIndex = turningPageIndex(state, direction);
  if (activePageIndex === null) {
    return false;
  }

  const activePageNumber = activePageIndex + 1;
  return activePageNumber !== 2 && activePageNumber !== state.pageCount - 1;
}
