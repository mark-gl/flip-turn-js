import { emitLifecycle, emitViewEntryBoundaryEvents } from "../core/events";
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
  currentPublicPageNumber,
  currentTurnPosition,
  maxTurnPosition,
  pageWidthForBox,
  sideForCorner,
  turnPositionForPublicPage,
} from "../layout/spread";
import { commitTurn } from "../layout/turn-plan";
import { render } from "../render/render";
import type { FlipTurnRuntime, PointerLike } from "../runtime/runtime";
import { animateTurnCommit, animateTurnRestore } from "./animation";
import {
  cornerForDirection,
  localTurnPointFromClient,
  syncActiveTurnProgress,
  syntheticPointerAtCorner,
} from "./geometry";
import { isCornerAllowedForDirection, resolveTurnOptions } from "./options";

const TURN_RELEASE_THRESHOLD_MS = 200;
const TURN_COMMIT_THRESHOLD = 0.5;
const KEYBOARD_CATCHUP_ACCELERATION_STEP = 2;
const KEYBOARD_CATCHUP_ACCELERATION_MAX = 10;

export type ProgrammaticTurnStartOptions = {
  cause: FlipTurnEventCause;
  elevation: number;
  pointerId: number;
  isPreview: boolean;
  commit: boolean;
  corner?: Corner;
};

export function createProgrammaticTurnStartOptions(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  cause: FlipTurnEventCause,
  overrides: Partial<Omit<ProgrammaticTurnStartOptions, "cause">> = {}
): ProgrammaticTurnStartOptions {
  const defaultPointerId = cause === "hover" ? -2 : -1;

  return {
    cause,
    elevation: resolveTurnOptions(runtime.state, direction).elevation,
    pointerId: defaultPointerId,
    isPreview: cause === "hover",
    commit: cause !== "hover",
    ...overrides,
  };
}

export function beginTurn(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  corner: Corner,
  pointerLike: PointerLike,
  box: ViewportBox,
  options?: {
    pointerDown?: boolean;
    isPreview?: boolean;
    pressedAt?: number;
    cause?: FlipTurnEventCause;
  }
): boolean {
  const state = runtime.state;

  if (!isCornerAllowedForDirection(state, corner, direction)) {
    return false;
  }

  if (!canTurnDirection(state, direction)) {
    return false;
  }

  const pageWidth = pageWidthForBox(state, box);
  const side = sideForCorner(corner);
  const localPoint = localTurnPointFromClient(
    pointerLike.clientX,
    pointerLike.clientY,
    box,
    pageWidth,
    box.height,
    side,
    state.displayMode
  );

  state.activeTurn = {
    direction,
    corner,
    pageWidth,
    pageHeight: box.height,
    pointerId: pointerLike.pointerId,
    pointerDown: options?.pointerDown ?? true,
    isPreview: options?.isPreview ?? false,
    cause: options?.cause ?? "pointer",
    phase: options?.isPreview ? "previewing" : "idle",
    pressedAt: options?.pressedAt ?? performance.now(),
    point: localPoint,
    progress: 0,
    side,
  };
  state.activeTurnResolvedOptions = resolveTurnOptions(state, direction);

  const startAllowed = emitLifecycle(
    state,
    "start",
    direction,
    state.activeTurn.cause
  );
  if (!startAllowed) {
    clearActiveTurnState(state);
    render(runtime);
    return false;
  }

  render(runtime);
  return true;
}

export function updateTurnPoint(
  runtime: FlipTurnRuntime,
  pointerEvent: PointerLike,
  box: ViewportBox
) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  const localPoint = localTurnPointFromClient(
    pointerEvent.clientX,
    pointerEvent.clientY,
    box,
    state.activeTurn.pageWidth,
    state.activeTurn.pageHeight,
    state.activeTurn.side,
    state.displayMode
  );
  state.activeTurn.point = localPoint;
  syncActiveTurnProgress(state);

  emitLifecycle(
    state,
    "turning",
    state.activeTurn.direction,
    state.activeTurn.cause
  );
  render(runtime);
}

export function shouldTurnOnRelease(
  state: FlipTurnRuntime["state"],
  now: number
): boolean {
  if (!state.activeTurn) {
    return false;
  }

  const elapsed = now - state.activeTurn.pressedAt;
  if (
    state.activeTurn.point.x < 0 ||
    state.activeTurn.point.x > state.activeTurn.pageWidth
  ) {
    return true;
  }

  if (elapsed < TURN_RELEASE_THRESHOLD_MS) {
    return true;
  }

  return state.activeTurn.progress >= TURN_COMMIT_THRESHOLD;
}

export function isActivePointer(
  state: FlipTurnRuntime["state"],
  pointerEvent: PointerLike
): boolean {
  if (!state.activeTurn) {
    return false;
  }

  return (
    state.activeTurn.pointerDown &&
    state.activeTurn.pointerId === pointerEvent.pointerId
  );
}

export function createProgrammaticPointer(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  box: ViewportBox,
  options: ProgrammaticTurnStartOptions
) {
  const corner: Corner = options.corner ?? cornerForDirection(direction);
  return {
    corner,
    pointerLike: syntheticPointerAtCorner(
      runtime.state,
      corner,
      box,
      options.elevation,
      options.pointerId,
      runtime.state.displayMode
    ),
  };
}

export function finishTurn(runtime: FlipTurnRuntime, shouldCommit: boolean) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  const direction = state.activeTurn.direction;
  const cause = state.activeTurn.cause;

  if (shouldCommit) {
    emitLifecycle(state, "turn", direction, cause);
    animateTurnCommit(runtime, () => {
      const previousPage = currentPublicPageNumber(state);
      commitTurn(state, direction);
      emitLifecycle(state, "turned", direction, cause);
      emitViewEntryBoundaryEvents(state, previousPage, direction, cause);
      finalizeTurn(runtime, direction, cause);
    });
    return;
  }

  animateTurnRestore(runtime, () => {
    finalizeTurn(runtime, direction, cause);
  });
}

function finalizeTurn(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  cause: FlipTurnEventCause
) {
  clearActiveTurnState(runtime.state);
  emitLifecycle(runtime.state, "end", direction, cause);
  render(runtime);
  continuePendingPageTarget(runtime);
}

export function startProgrammaticTurn(
  runtime: FlipTurnRuntime,
  direction: TurnDirection,
  box: ViewportBox,
  options: ProgrammaticTurnStartOptions
): boolean {
  const { corner, pointerLike } = createProgrammaticPointer(
    runtime,
    direction,
    box,
    options
  );

  const started = beginTurn(runtime, direction, corner, pointerLike, box, {
    pointerDown: false,
    isPreview: options.isPreview,
    pressedAt: performance.now(),
    cause: options.cause,
  });

  if (!started) {
    return false;
  }

  if (options.commit) {
    finishTurn(runtime, true);
  }

  return true;
}

function continuePendingPageTarget(runtime: FlipTurnRuntime) {
  const state = runtime.state;
  if (state.activeTurn) {
    return;
  }

  if (continueKeyboardTargetPosition(runtime)) {
    return;
  }

  if (state.pendingPageTarget === null) {
    return;
  }

  const targetPage = state.pendingPageTarget;
  const currentPosition = currentTurnPosition(state);
  const targetPosition = turnPositionForPublicPage(state, targetPage);
  if (currentPosition === targetPosition) {
    state.pendingPageTarget = null;
    return;
  }

  const direction: TurnDirection =
    targetPosition > currentPosition ? "forward" : "backward";
  const box = viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect());
  const started = startProgrammaticTurn(
    runtime,
    direction,
    box,
    createProgrammaticTurnStartOptions(runtime, direction, "api", {
      pointerId: -3,
    })
  );

  if (!started) {
    state.pendingPageTarget = null;
  }
}

function continueKeyboardTargetPosition(runtime: FlipTurnRuntime): boolean {
  const state = runtime.state;
  const targetPosition = state.keyboardTargetPosition;
  if (targetPosition === null) {
    return false;
  }

  const maximumPosition = maxTurnPosition(state);
  const normalizedTarget = Math.min(
    maximumPosition,
    Math.max(0, targetPosition)
  );
  state.keyboardTargetPosition = normalizedTarget;

  const currentPosition = currentTurnPosition(state);
  if (normalizedTarget === currentPosition) {
    state.keyboardTargetPosition = null;
    return false;
  }

  const direction: TurnDirection =
    normalizedTarget > currentPosition ? "forward" : "backward";
  const remainingDistance = Math.abs(normalizedTarget - currentPosition);
  const box = viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect());
  const started = startProgrammaticTurn(
    runtime,
    direction,
    box,
    createProgrammaticTurnStartOptions(runtime, direction, "keyboard", {
      pointerId: -4,
    })
  );

  if (!started) {
    state.keyboardTargetPosition = null;
    return false;
  }

  if (remainingDistance > 1) {
    state.animationSpeedMultiplier = Math.min(
      KEYBOARD_CATCHUP_ACCELERATION_MAX,
      1 + (remainingDistance - 1) * KEYBOARD_CATCHUP_ACCELERATION_STEP
    );
  }

  return true;
}
