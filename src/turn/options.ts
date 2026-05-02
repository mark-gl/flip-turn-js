import { finiteAtLeastOne, finiteNonNegative } from "../core/math";
import { resolveCornerSelection } from "../core/options";
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

function pageOverridesForDirection(
  state: FlipTurnState,
  direction: TurnDirection
): PageTurnOptions {
  const pageIndex = turningPageIndex(state, direction);
  if (pageIndex === null) {
    return {};
  }

  const pageNumber = pageIndex + 1;
  const pageScoped = state.options.pageOptions[pageNumber] ?? {};
  return pageScoped;
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

function pageElementHardOverride(
  state: FlipTurnState,
  pageIndex: number | null
): boolean | undefined {
  if (pageIndex === null) return undefined;
  const value = state.pages[pageIndex]?.value.dataset.hard;
  if (value === undefined) return undefined;
  if (value === "true" || value === "1" || value === "") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
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
  const pairedPage =
    pairedPageNumber === null
      ? {}
      : (state.options.pageOptions[pairedPageNumber] ?? {});

  const hardFromActivePage =
    perPage.hard ?? pageElementHardOverride(state, activePageIndex);
  const hardFromPairedPage =
    pairedPage.hard ??
    pageElementHardOverride(
      state,
      pairedPageNumber !== null ? pairedPageNumber - 1 : null
    );
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
              pairedPageNumber,
              state.pageCount
            );

  const hardThicknessFromPages =
    perPage.hardThickness ?? pairedPage.hardThickness;

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
    cornerSize: finiteAtLeastOne(perPage.cornerSize, state.options.cornerSize),
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
    return null;
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
