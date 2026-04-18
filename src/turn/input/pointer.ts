import type { Corner, ViewportBox } from "../../core/types";
import { viewportBoxFromDomRect } from "../../dom/dom";
import { directionFromCorner } from "../../layout/spread";
import { render } from "../../render/render";
import type { FlipTurnRuntime } from "../../runtime/runtime";
import { animateHoverPreview, stopAnimation } from "../animation";
import {
  canRequestTurnDirection,
  emitBoundaryEvent,
  startHoverPreview,
  stopActiveTurn,
} from "../commands";
import {
  beginTurn,
  finishTurn,
  isActivePointer,
  shouldTurnOnRelease,
  updateTurnPoint,
} from "../control-lifecycle";
import { cornerAtPoint } from "../geometry";

const PREVIEW_POINT_DELTA_THRESHOLD = 2;

type BindEventFn = <T extends Event>(
  target: EventTarget,
  eventName: string,
  listener: (event: T) => void
) => void;

function cornerFromPointer(
  runtime: FlipTurnRuntime,
  event: Pick<PointerEvent, "clientX" | "clientY">
): { box: ViewportBox; corner: Corner } | null {
  const box = viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect());
  const corner = cornerAtPoint(
    runtime.state,
    event.clientX,
    event.clientY,
    box
  );
  if (!corner) {
    return null;
  }

  return { box, corner };
}

function shouldCancelPreviewTurn(runtime: FlipTurnRuntime): boolean {
  return runtime.state.activeTurn?.phase !== "restoring";
}

function handlePreviewPointerMove(
  runtime: FlipTurnRuntime,
  event: Pick<PointerEvent, "clientX" | "clientY">
): boolean {
  const state = runtime.state;
  if (!state.activeTurn?.isPreview) {
    return false;
  }

  const previewBox = viewportBoxFromDomRect(
    runtime.viewport.getBoundingClientRect()
  );
  const corner = cornerAtPoint(state, event.clientX, event.clientY, previewBox);
  if (!corner) {
    if (shouldCancelPreviewTurn(runtime)) {
      finishTurn(runtime, false);
    }
    return true;
  }

  const direction = directionFromCorner(corner);
  if (!canRequestTurnDirection(state, direction)) {
    if (shouldCancelPreviewTurn(runtime)) {
      finishTurn(runtime, false);
    }
    return true;
  }

  if (state.activeTurn.corner !== corner) {
    stopAnimation(state);
    state.activeTurn = null;
    render(runtime);
    startHoverPreview(runtime, corner, previewBox);
    return true;
  }

  const pageWidth = state.activeTurn.pageWidth;
  const pageHeight = state.activeTurn.pageHeight;
  const previewInset = state.options.cornerSize / 2;
  const previewPoint =
    corner === "tl"
      ? { x: previewInset, y: previewInset }
      : corner === "tr"
        ? { x: pageWidth - previewInset, y: previewInset }
        : corner === "bl"
          ? { x: previewInset, y: pageHeight - previewInset }
          : { x: pageWidth - previewInset, y: pageHeight - previewInset };
  const deltaX = Math.abs(state.activeTurn.point.x - previewPoint.x);
  const deltaY = Math.abs(state.activeTurn.point.y - previewPoint.y);

  if (
    state.activeTurn.phase === "restoring" ||
    ((deltaX > PREVIEW_POINT_DELTA_THRESHOLD ||
      deltaY > PREVIEW_POINT_DELTA_THRESHOLD) &&
      state.animationHandle === null)
  ) {
    animateHoverPreview(runtime, previewPoint, undefined, "instant");
  }

  return true;
}

export function bindPointerEvents(
  runtime: FlipTurnRuntime,
  viewport: HTMLElement,
  bind: BindEventFn
) {
  const state = runtime.state;

  const bindPointerRelease = (
    eventName: "pointerup" | "pointercancel",
    shouldCommit: (event: PointerEvent) => boolean
  ) => {
    bind<PointerEvent>(viewport, eventName, (event) => {
      if (!state.interactionEnabled) {
        return;
      }

      if (!isActivePointer(state, event) || !state.activeTurn) {
        return;
      }

      state.activeTurn.pointerDown = false;
      finishTurn(runtime, shouldCommit(event));
      event.preventDefault();
    });
  };

  bind<PointerEvent>(viewport, "pointerdown", (event) => {
    if (!state.interactionEnabled) {
      return;
    }

    viewport.focus({ preventScroll: true });

    if (state.activeTurn && !state.activeTurn.isPreview) {
      if (state.activeTurn.phase === "committing") {
        stopActiveTurn(runtime, "pointer");
      }
      return;
    }

    if (state.activeTurn?.isPreview) {
      stopActiveTurn(runtime, "pointer");
    }

    const pointerCorner = cornerFromPointer(runtime, event);
    if (!pointerCorner) {
      return;
    }

    const { box, corner } = pointerCorner;
    const direction = directionFromCorner(corner);
    if (
      !beginTurn(runtime, direction, corner, event, box, {
        pointerDown: true,
        isPreview: false,
        pressedAt: performance.now(),
        cause: "pointer",
      })
    ) {
      emitBoundaryEvent(state, direction, "boundary");
      return;
    }

    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  bind<PointerEvent>(viewport, "pointermove", (event) => {
    if (!state.interactionEnabled) {
      return;
    }

    if (isActivePointer(state, event)) {
      updateTurnPoint(
        runtime,
        event,
        viewportBoxFromDomRect(runtime.viewport.getBoundingClientRect())
      );
      event.preventDefault();
      return;
    }

    if (handlePreviewPointerMove(runtime, event)) {
      return;
    }

    if (event.buttons !== 0 || state.activeTurn) {
      return;
    }

    const pointerCorner = cornerFromPointer(runtime, event);
    if (!pointerCorner) {
      return;
    }

    startHoverPreview(runtime, pointerCorner.corner, pointerCorner.box);
  });

  bindPointerRelease("pointerup", () =>
    shouldTurnOnRelease(state, performance.now())
  );
  bindPointerRelease("pointercancel", () => false);
}
