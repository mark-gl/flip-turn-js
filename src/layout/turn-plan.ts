import type { TurnDirection } from "../types/primitives";
import type { FlipTurnState } from "../types/state";
import {
  directionStep,
  hasPages,
  isSingleDisplayMode,
  spreadPageIndicesAt,
} from "./spread";

export type TurnRenderPlan = {
  baseLeftPage: number | null;
  baseRightPage: number | null;
  baseSinglePage: number | null;
  frontPage: number | null;
  side: "left" | "right";
};

function isForwardDirection(direction: TurnDirection): boolean {
  return direction === "forward";
}

function sideForDirection(direction: TurnDirection): "left" | "right" {
  return isForwardDirection(direction) ? "right" : "left";
}

function spreadForDirection(
  state: FlipTurnState,
  direction: TurnDirection,
  offset = 0
) {
  const spreadIndexDelta = isForwardDirection(direction) ? 1 : -1;
  return spreadPageIndicesAt(
    state,
    state.currentSpreadIndex + spreadIndexDelta + offset
  );
}

function pageIndexStepForDirection(direction: TurnDirection): 1 | -1 {
  return isForwardDirection(direction) ? 1 : -1;
}

function destinationPageIndexForDirection(
  state: FlipTurnState,
  direction: TurnDirection
): number {
  return state.currentPageIndex + pageIndexStepForDirection(direction);
}

function destinationIndexForDirection(
  state: FlipTurnState,
  direction: TurnDirection
): number {
  return direction === "forward"
    ? Math.min(state.pageCount - 1, state.currentPageIndex + 1)
    : Math.max(0, state.currentPageIndex - 1);
}

export function turningPageIndex(
  state: FlipTurnState,
  direction: TurnDirection
): number | null {
  if (!hasPages(state.pageCount)) {
    return null;
  }

  if (isSingleDisplayMode(state)) {
    return state.currentPageIndex;
  }

  const spread = spreadPageIndicesAt(state, state.currentSpreadIndex);
  return isForwardDirection(direction) ? spread.right : spread.left;
}

export function defaultBackPageIndex(
  state: FlipTurnState,
  direction: TurnDirection
): number | null {
  if (!hasPages(state.pageCount)) {
    return null;
  }

  if (isSingleDisplayMode(state)) {
    const destination = destinationPageIndexForDirection(state, direction);
    return destination >= 0 && destination < state.pageCount
      ? destination
      : null;
  }

  const destination = spreadForDirection(state, direction);
  return isForwardDirection(direction) ? destination.left : destination.right;
}

export function commitTurn(state: FlipTurnState, direction: TurnDirection) {
  const delta = directionStep(direction);

  if (isSingleDisplayMode(state)) {
    state.currentPageIndex = Math.max(
      0,
      Math.min(state.pageCount - 1, state.currentPageIndex + delta)
    );
    return;
  }

  const maximumSpread = Math.max(0, Math.ceil((state.pageCount - 1) / 2));
  state.currentSpreadIndex = Math.max(
    0,
    Math.min(maximumSpread, state.currentSpreadIndex + delta)
  );
}

export function buildDoubleTurnPages(
  state: FlipTurnState,
  direction: TurnDirection
) {
  const current = spreadPageIndicesAt(state, state.currentSpreadIndex);
  const destination = spreadForDirection(state, direction);

  if (isForwardDirection(direction)) {
    return {
      baseLeftPage: current.left,
      baseRightPage: destination.right,
      frontPage: current.right,
      backPage: destination.left,
      side: "right" as const,
    };
  }

  return {
    baseLeftPage: destination.left,
    baseRightPage: current.right,
    frontPage: current.left,
    backPage: destination.right,
    side: "left" as const,
  };
}

export function buildSingleTurnPages(
  state: FlipTurnState,
  direction: TurnDirection
) {
  const destinationIndex = destinationIndexForDirection(state, direction);
  return {
    basePage: destinationIndex,
    frontPage: state.currentPageIndex,
    backPage: null,
    side: sideForDirection(direction),
  };
}

export function buildTurnRenderPlan(
  state: FlipTurnState,
  direction: TurnDirection
): TurnRenderPlan {
  if (isSingleDisplayMode(state)) {
    const turnPages = buildSingleTurnPages(state, direction);
    return {
      baseLeftPage: null,
      baseRightPage: null,
      baseSinglePage: turnPages.basePage,
      frontPage: turnPages.frontPage,
      side: turnPages.side,
    };
  }

  const turnPages = buildDoubleTurnPages(state, direction);
  return {
    baseLeftPage: turnPages.baseLeftPage,
    baseRightPage: turnPages.baseRightPage,
    baseSinglePage: null,
    frontPage: turnPages.frontPage,
    side: turnPages.side,
  };
}
