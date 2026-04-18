import { emitLifecycle, emitViewEntryBoundaryEvents } from "../core/events";
import { constrainCornerSize } from "../core/math";
import { clearActiveTurnState } from "../core/state";
import type {
  Corner,
  FlipTurnEventCause,
  TurnDirection,
  ViewportBox,
} from "../core/types";
import { viewportBoxFromDomRect } from "../dom/dom";
import {
  canTurnDirection,
  cornerPoint,
  currentPublicPageNumber,
  currentTurnPosition,
  directionFromCorner,
  hasPages,
  maxTurnPosition,
  normalizePublicPageNumber,
  pageWidthForBox,
  setCurrentFromPublicPage,
  turnPositionForPublicPage,
} from "../layout/spread";
import { render } from "../render/render";
import type { FlipTurnRuntime } from "../runtime/runtime";
import { animateHoverPreview, stopAnimation } from "./animation";
import {
  createProgrammaticTurnStartOptions,
  startProgrammaticTurn,
} from "./control-lifecycle";
import { resolveTurnOptions } from "./options";

const HOVER_PREVIEW_ELEVATION = 1;
const INPUT_ACCELERATION_STEP = 1.1;
const INPUT_ACCELERATION_SAME_DIRECTION_BONUS = 0.9;
const INPUT_ACCELERATION_MAX = 12;
const KEYBOARD_CATCHUP_ACCELERATION_STEP = 2;

type KeyboardTargetUpdate = {
  targetPosition: number;
  moved: boolean;
};

function boostActiveAnimationSpeed(
  state: FlipTurnRuntime["state"],
  direction: TurnDirection
) {
  if (state.animationHandle === null || !state.activeTurn) {
    return;
  }

  const sameDirection = state.activeTurn.direction === direction;
  const accelerationDelta =
    INPUT_ACCELERATION_STEP +
    (sameDirection ? INPUT_ACCELERATION_SAME_DIRECTION_BONUS : 0);

  state.animationSpeedMultiplier = Math.min(
    INPUT_ACCELERATION_MAX,
    state.animationSpeedMultiplier + accelerationDelta
  );
}

export function stopActiveTurn(
  runtime: FlipTurnRuntime,
  cause: FlipTurnEventCause = "stop"
) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  const stoppedTurn = state.activeTurn;
  stopAnimation(state);
  releaseCapturedPointer(runtime, stoppedTurn.pointerId);

  clearActiveTurnState(state);
  emitLifecycle(state, "end", stoppedTurn.direction, cause);
  render(runtime);
}

function releaseCapturedPointer(runtime: FlipTurnRuntime, pointerId: number) {
  const viewport = runtime.viewport;

  if (pointerId < 0) {
    return;
  }

  try {
    if (viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore
  }
}

function interruptForRequest(
  runtime: FlipTurnRuntime,
  cause: FlipTurnEventCause
): boolean {
  const state = runtime.state;
  if (state.activeTurn?.pointerDown) {
    return false;
  }

  if (!state.activeTurn) {
    return true;
  }

  stopActiveTurn(runtime, cause);
  return true;
}

function queueTurnRequest(
  state: FlipTurnRuntime["state"],
  direction: TurnDirection
): boolean {
  if (state.activeTurn?.pointerDown) {
    return false;
  }

  if (!state.activeTurn) {
    return false;
  }

  boostActiveAnimationSpeed(state, direction);

  const currentPage = currentPublicPageNumber(state);
  const activeTurnStep = state.activeTurn.direction === "forward" ? 1 : -1;
  const settledPage = normalizePublicPageNumber(
    state,
    currentPage + activeTurnStep,
    state.pageCount,
    currentPage
  );
  const requestedStep = direction === "forward" ? 1 : -1;
  const pendingBasePage =
    state.pendingPageTarget === null ? settledPage : state.pendingPageTarget;
  const targetPage = normalizePublicPageNumber(
    state,
    pendingBasePage + requestedStep,
    state.pageCount,
    pendingBasePage
  );

  state.pendingPageTarget = targetPage === settledPage ? null : targetPage;
  return true;
}

function inFlightSettledTurnPosition(state: FlipTurnRuntime["state"]): number {
  const currentPosition = currentTurnPosition(state);
  const maximumPosition = maxTurnPosition(state);

  if (!state.activeTurn || state.activeTurn.pointerDown) {
    return currentPosition;
  }

  const step = state.activeTurn.direction === "forward" ? 1 : -1;
  return Math.min(maximumPosition, Math.max(0, currentPosition + step));
}

function updateKeyboardTargetPosition(
  state: FlipTurnRuntime["state"],
  direction: TurnDirection
): KeyboardTargetUpdate {
  const step = direction === "forward" ? 1 : -1;
  const basePosition =
    state.keyboardTargetPosition ?? inFlightSettledTurnPosition(state);
  const maximumPosition = maxTurnPosition(state);
  const targetPosition = Math.min(
    maximumPosition,
    Math.max(0, basePosition + step)
  );

  state.keyboardTargetPosition = targetPosition;
  return {
    targetPosition,
    moved: targetPosition !== basePosition,
  };
}

function startTurnTowardKeyboardTarget(
  runtime: FlipTurnRuntime,
  cause: FlipTurnEventCause
): boolean {
  const state = runtime.state;
  const targetPosition = state.keyboardTargetPosition;

  if (targetPosition === null) {
    return false;
  }

  if (state.activeTurn?.pointerDown) {
    return false;
  }

  const settledPosition = inFlightSettledTurnPosition(state);
  if (targetPosition === settledPosition) {
    state.keyboardTargetPosition = null;
    return true;
  }

  const desiredDirection: TurnDirection =
    targetPosition > settledPosition ? "forward" : "backward";

  if (state.activeTurn?.direction === desiredDirection) {
    const remainingDistance = Math.abs(targetPosition - settledPosition);
    if (remainingDistance > 0) {
      state.animationSpeedMultiplier = Math.min(
        INPUT_ACCELERATION_MAX,
        Math.max(
          state.animationSpeedMultiplier,
          1 + remainingDistance * KEYBOARD_CATCHUP_ACCELERATION_STEP
        )
      );
    }
    return true;
  }

  const currentPosition = currentTurnPosition(state);
  if (targetPosition === currentPosition) {
    state.keyboardTargetPosition = null;
    if (state.activeTurn) {
      stopActiveTurn(runtime, cause);
    }
    return true;
  }

  const direction: TurnDirection =
    targetPosition > currentPosition ? "forward" : "backward";

  if (state.activeTurn) {
    stopActiveTurn(runtime, cause);
  }

  const box = viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect());
  const started = startProgrammaticTurn(
    runtime,
    direction,
    box,
    createProgrammaticTurnStartOptions(runtime, direction, cause)
  );

  if (!started) {
    state.keyboardTargetPosition = null;
    return false;
  }

  const remainingDistance = Math.abs(targetPosition - currentPosition);
  if (remainingDistance > 1) {
    state.animationSpeedMultiplier = Math.min(
      INPUT_ACCELERATION_MAX,
      1 + (remainingDistance - 1) * KEYBOARD_CATCHUP_ACCELERATION_STEP
    );
  }

  return true;
}

export function requestTurn(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  cause: FlipTurnEventCause = "api"
): boolean {
  const state = runtime.state;
  if (!state.interactionEnabled) {
    return false;
  }

  if (cause === "keyboard") {
    state.pendingPageTarget = null;
    const { moved } = updateKeyboardTargetPosition(state, direction);

    if (!moved) {
      emitBoundaryEvent(state, direction, "boundary");
      return false;
    }

    return startTurnTowardKeyboardTarget(runtime, cause);
  }

  if (queueTurnRequest(state, direction)) {
    return true;
  }

  if (!interruptForRequest(runtime, cause)) {
    return false;
  }

  const box = viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect());

  if (
    !startProgrammaticTurn(
      runtime,
      direction,
      box,
      createProgrammaticTurnStartOptions(runtime, direction, cause)
    )
  ) {
    emitBoundaryEvent(state, direction, "boundary");
    return false;
  }

  return true;
}

export function requestPageSet(
  runtime: FlipTurnRuntime,
  targetPage: number,
  snap = false
): boolean {
  const state = runtime.state;
  if (!hasPages(state.pageCount)) {
    return false;
  }

  state.keyboardTargetPosition = null;

  const clampedTargetPage = normalizePublicPageNumber(state, targetPage);
  const currentPage = currentPublicPageNumber(state);
  const currentPosition = currentTurnPosition(state);
  const targetPosition = turnPositionForPublicPage(state, clampedTargetPage);

  if (currentPosition === targetPosition) {
    state.pendingPageTarget = null;
    return true;
  }

  const direction: TurnDirection =
    targetPosition > currentPosition ? "forward" : "backward";

  if (snap) {
    state.pendingPageTarget = null;
    if (state.activeTurn) {
      stopActiveTurn(runtime, "api");
    }

    if (!emitLifecycle(state, "start", direction, "api")) {
      return false;
    }

    emitLifecycle(state, "turn", direction, "api");
    setCurrentFromPublicPage(state, clampedTargetPage);
    emitLifecycle(state, "turned", direction, "api");
    emitViewEntryBoundaryEvents(state, currentPage, direction, "api");
    emitLifecycle(state, "end", direction, "api");
    render(runtime);
    return true;
  }

  if (state.activeTurn?.pointerDown) {
    return false;
  }

  if (state.activeTurn) {
    stopActiveTurn(runtime, "api");
  }

  state.pendingPageTarget = clampedTargetPage;
  const started = requestTurn(runtime, direction, "api");
  if (!started) {
    state.pendingPageTarget = null;
  }
  return started;
}

export function canRequestTurnDirection(
  state: FlipTurnRuntime["state"],
  direction: TurnDirection
): boolean {
  if (!state.interactionEnabled) {
    return false;
  }

  return canTurnDirection(state, direction);
}

export function emitBoundaryEvent(
  state: FlipTurnRuntime["state"],
  direction: TurnDirection,
  cause: FlipTurnEventCause
) {
  emitLifecycle(
    state,
    direction === "forward" ? "last" : "first",
    direction,
    cause
  );
}

export function startHoverPreview(
  runtime: FlipTurnRuntime,
  corner: Corner,
  box: ViewportBox
) {
  const state = runtime.state;
  const direction = directionFromCorner(corner);
  if (!canRequestTurnDirection(state, direction)) {
    emitBoundaryEvent(state, direction, "boundary");
    return;
  }

  const pageWidth = pageWidthForBox(state, box);
  const started = startProgrammaticTurn(
    runtime,
    direction,
    box,
    createProgrammaticTurnStartOptions(runtime, direction, "hover", {
      elevation: HOVER_PREVIEW_ELEVATION,
      corner,
    })
  );

  if (!started || !state.activeTurn) {
    return;
  }

  const activeCornerSize =
    state.activeTurnResolvedOptions?.cornerSize ??
    resolveTurnOptions(state, direction).cornerSize;

  const previewPoint = cornerPoint(
    corner,
    pageWidth,
    box.height,
    constrainCornerSize(activeCornerSize, pageWidth, box.height) / 2
  );
  animateHoverPreview(runtime, previewPoint, undefined, "animate");
}
