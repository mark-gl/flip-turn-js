import { bezier, point } from "../core/math";
import type { Point } from "../types/primitives";
import type { FlipTurnState } from "../types/state";
import { cornerPoint, farCornerPoint, isTopCorner } from "../layout/spread";
import { render } from "../render/render";
import type { FlipTurnRuntime } from "../types/renderer";
import { syncActiveTurnProgress } from "./geometry";

export function stopAnimation(state: FlipTurnState) {
  if (state.animationHandle !== null) {
    cancelAnimationFrame(state.animationHandle);
    state.animationHandle = null;
  }

  state.hoverAnimationTarget = null;
  state.animationSpeedMultiplier = 1;
}

export function isAnimating(state: FlipTurnState): boolean {
  return state.animationHandle !== null;
}

function easeOutCircular(
  elapsed: number,
  startValue: number,
  delta: number,
  duration: number
): number {
  if (duration <= 0) {
    return startValue + delta;
  }

  const normalized = elapsed / duration - 1;
  return delta * Math.sqrt(1 - normalized * normalized) + startValue;
}

export function animateScalar(
  runtime: FlipTurnRuntime,
  from: number,
  to: number,
  duration: number,
  frame: (value: number) => void,
  onDone: () => void,
  easing: (
    elapsed: number,
    startValue: number,
    delta: number,
    duration: number
  ) => number = easeOutCircular
) {
  const state = runtime.state;
  stopAnimation(state);

  if (duration <= 0) {
    frame(to);
    onDone();
    return;
  }

  const delta = to - from;
  let animationStart: number | null = null;

  const step = (timestamp: number) => {
    if (!state.activeTurn) {
      state.animationHandle = null;
      return;
    }

    if (animationStart === null) {
      animationStart = timestamp;
    }

    const animationSpeedMultiplier = Math.max(
      1,
      state.animationSpeedMultiplier
    );
    const elapsed = Math.min(
      duration,
      (timestamp - animationStart) * animationSpeedMultiplier
    );

    const easedValue = easing(elapsed, from, delta, duration);
    frame(easedValue);

    if (elapsed < duration) {
      render(runtime);
      state.animationHandle = requestAnimationFrame(step);
      return;
    }

    state.animationHandle = null;
    onDone();

    if (state.activeTurn) {
      render(runtime);
    }
  };

  state.animationHandle = requestAnimationFrame(step);
}

const PREVIEW_POINT_DELTA_THRESHOLD = 2;
const PREVIEW_ENTRY_DURATION_RATIO = 0.35;
const PREVIEW_ENTRY_DURATION_MIN_MS = 100;
const PREVIEW_ENTRY_DURATION_MAX_MS = 200;
const RELEASE_ANIMATION_DURATION_MIN_MS = 200;

type HoverPreviewMode = "instant" | "animate";

function easeInOutSine(
  elapsed: number,
  startValue: number,
  delta: number,
  duration: number
): number {
  if (duration <= 0) {
    return startValue + delta;
  }

  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const easedProgress = -(Math.cos(Math.PI * progress) - 1) / 2;
  return startValue + delta * easedProgress;
}

function animateActiveTurnBezier(
  runtime: FlipTurnRuntime,
  startPoint: Point,
  controlPointA: Point,
  controlPointB: Point,
  endPoint: Point,
  onDone: () => void,
  durationOverrideMs?: number
) {
  const state = runtime.state;
  animateScalar(
    runtime,
    0,
    1,
    durationOverrideMs ??
      state.activeTurnResolvedOptions?.duration ??
      state.options.duration,
    (value) => {
      if (!state.activeTurn) {
        return;
      }

      state.activeTurn.point = bezier(
        startPoint,
        controlPointA,
        controlPointB,
        endPoint,
        value
      );
      syncActiveTurnProgress(state);
    },
    onDone
  );
}

function releaseAnimationDuration(
  state: FlipTurnState,
  remainingProgress: number
): number {
  const baseDuration =
    state.activeTurnResolvedOptions?.duration ?? state.options.duration;
  const clampedRemainingProgress = Math.max(0, Math.min(1, remainingProgress));
  const scaledDuration = Math.round(baseDuration * clampedRemainingProgress);
  return Math.max(RELEASE_ANIMATION_DURATION_MIN_MS, scaledDuration);
}

export function animateTurnCommit(
  runtime: FlipTurnRuntime,
  onDone: () => void
) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  state.activeTurn.phase = "committing";

  const startPoint = point(state.activeTurn.point.x, state.activeTurn.point.y);
  const endPoint = farCornerPoint(
    state.activeTurn.corner,
    state.activeTurn.pageWidth,
    state.activeTurn.pageHeight
  );
  const duration = releaseAnimationDuration(
    state,
    1 - state.activeTurn.progress
  );

  animateActiveTurnBezier(
    runtime,
    startPoint,
    startPoint,
    endPoint,
    endPoint,
    onDone,
    duration
  );
}

export function animateTurnRestore(
  runtime: FlipTurnRuntime,
  onDone: () => void
) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  state.activeTurn.phase = "restoring";

  const startPoint = point(state.activeTurn.point.x, state.activeTurn.point.y);
  const endPoint = cornerPoint(
    state.activeTurn.corner,
    state.activeTurn.pageWidth,
    state.activeTurn.pageHeight,
    0
  );
  const topCorner = isTopCorner(state.activeTurn.corner);
  const delta = topCorner
    ? Math.min(0, startPoint.y - endPoint.y) / 2
    : Math.max(0, startPoint.y - endPoint.y) / 2;
  const controlPointA = point(startPoint.x, startPoint.y + delta);
  const controlPointB = point(endPoint.x, endPoint.y - delta);
  const duration = releaseAnimationDuration(state, state.activeTurn.progress);

  animateActiveTurnBezier(
    runtime,
    startPoint,
    controlPointA,
    controlPointB,
    endPoint,
    onDone,
    duration
  );
}

export function animateHoverPreview(
  runtime: FlipTurnRuntime,
  targetPoint: Point,
  onDone?: () => void,
  mode: HoverPreviewMode = "instant"
) {
  const state = runtime.state;
  if (!state.activeTurn) {
    return;
  }

  const deltaX = Math.abs(state.activeTurn.point.x - targetPoint.x);
  const deltaY = Math.abs(state.activeTurn.point.y - targetPoint.y);
  const shouldUpdatePoint =
    state.activeTurn.phase === "restoring" ||
    deltaX > PREVIEW_POINT_DELTA_THRESHOLD ||
    deltaY > PREVIEW_POINT_DELTA_THRESHOLD;

  if (!shouldUpdatePoint) {
    return;
  }

  if (mode === "animate") {
    const hasSameTarget =
      state.hoverAnimationTarget !== null &&
      Math.abs(state.hoverAnimationTarget.x - targetPoint.x) <=
        PREVIEW_POINT_DELTA_THRESHOLD &&
      Math.abs(state.hoverAnimationTarget.y - targetPoint.y) <=
        PREVIEW_POINT_DELTA_THRESHOLD;

    if (
      state.activeTurn.phase === "previewing" &&
      state.animationHandle !== null &&
      hasSameTarget
    ) {
      return;
    }

    state.activeTurn.phase = "previewing";
    state.hoverAnimationTarget = point(targetPoint.x, targetPoint.y);

    const startPoint = point(
      state.activeTurn.point.x,
      state.activeTurn.point.y
    );
    const previewDuration = Math.min(
      PREVIEW_ENTRY_DURATION_MAX_MS,
      Math.max(
        PREVIEW_ENTRY_DURATION_MIN_MS,
        Math.round(
          (state.activeTurnResolvedOptions?.duration ??
            state.options.duration) * PREVIEW_ENTRY_DURATION_RATIO
        )
      )
    );

    animateScalar(
      runtime,
      0,
      1,
      previewDuration,
      (value) => {
        if (!state.activeTurn) {
          return;
        }

        state.activeTurn.point = point(
          Math.round(startPoint.x + (targetPoint.x - startPoint.x) * value),
          Math.round(startPoint.y + (targetPoint.y - startPoint.y) * value)
        );
        syncActiveTurnProgress(state);
      },
      () => {
        state.hoverAnimationTarget = null;
        onDone?.();
      },
      easeInOutSine
    );
    return;
  }

  stopAnimation(state);
  state.activeTurn.phase = "previewing";
  state.activeTurn.point = point(
    Math.round(targetPoint.x),
    Math.round(targetPoint.y)
  );
  syncActiveTurnProgress(state);
  render(runtime);
  onDone?.();
}
