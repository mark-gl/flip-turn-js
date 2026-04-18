import { finiteAtLeastOne, finiteNonNegative } from "../core/math";
import { resolveCornerSelection } from "../core/options";
import type {
  ActiveTurnResolvedOptions,
  Corner,
  FlipTurnState,
  PageTurnGradientOptions,
  PageTurnOptions,
  TurnDirection,
} from "../core/types";
import {
  isSingleDisplayMode,
  pageSourceAtPublicPageNumber,
} from "../layout/spread";
import { defaultBackPageIndex, turningPageIndex } from "../layout/turn-plan";

type ResolvedGradientOptions = { front: boolean; back: boolean };

function pageOverridesForDirection(
  state: FlipTurnState,
  direction: TurnDirection
): PageTurnOptions {
  const pageIndex = turningPageIndex(state, direction);
  if (pageIndex === null) {
    return {};
  }

  const pageNumber = pageIndex + 1;
  const pageScoped = state.options.pageTurn[pageNumber] ?? {};
  return pageScoped;
}

export function resolveGradientOptions(
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

export function resolveTurnOptions(
  state: FlipTurnState,
  direction: TurnDirection
): ActiveTurnResolvedOptions {
  const perPage = pageOverridesForDirection(state, direction);

  return {
    duration: finiteNonNegative(perPage.duration, state.options.duration),
    acceleration: perPage.acceleration ?? state.options.acceleration,
    elevation: finiteNonNegative(perPage.elevation, state.options.elevation),
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
  if (override.backPage !== undefined) {
    if (override.backPage === null) {
      return null;
    }

    return pageSourceAtPublicPageNumber(state, override.backPage);
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
