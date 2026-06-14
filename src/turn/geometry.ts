import { clamp, constrainCornerSize, point } from "../core/math";
import { pageOffsetXForSide } from "../core/state";
import {
  canTurnDirection,
  cornerPoint,
  directionFromCorner,
  isReversedSingleTurn,
  isSingleDisplayMode,
  isTopCorner,
  pageWidthForBox,
  sideForClientX,
  sideForCorner,
} from "../layout/spread";
import type {
  Corner,
  DisplayMode,
  Point,
  TurnDirection,
} from "../types/primitives";
import type { ViewportBox } from "../types/renderer";
import type { ActiveTurn, FlipTurnState } from "../types/state";
import { isCornerAllowedForDirection, resolveTurnOptions } from "./options";

const REVERSED_PREVIEW_FILL = 0.16;

function reversedDragFoldPointX(fingerX: number, pageWidth: number): number {
  return (-fingerX * fingerX) / pageWidth + 3 * fingerX - pageWidth;
}

function reversedDragFingerForFill(
  fillFraction: number,
  pageWidth: number
): number {
  return (pageWidth * (3 - Math.sqrt(9 - 8 * fillFraction))) / 2;
}

function pageOffsetFor(
  box: ViewportBox,
  displayMode: DisplayMode,
  side: "left" | "right"
): number {
  return pageOffsetXForSide(box.width, displayMode, side);
}

function clampTurnPointX(
  rawX: number,
  pageWidth: number,
  side: "left" | "right"
): number {
  if (side === "right") {
    return clamp(rawX, -pageWidth, pageWidth);
  }

  return clamp(rawX, 0, pageWidth * 2);
}

export function localTurnPointFromClient(
  clientX: number,
  clientY: number,
  box: ViewportBox,
  pageWidth: number,
  pageHeight: number,
  side: "left" | "right",
  displayMode: DisplayMode
): Point {
  const pageOffsetX = pageOffsetFor(box, displayMode, side);
  const localX = clampTurnPointX(
    clientX - box.left - pageOffsetX,
    pageWidth,
    side
  );
  const localY = clamp(clientY - box.top, 0, pageHeight);

  return point(localX, localY);
}

function localPagePointFromClient(
  clientX: number,
  clientY: number,
  box: ViewportBox,
  pageWidth: number,
  pageHeight: number,
  side: "left" | "right",
  displayMode: DisplayMode
): Point {
  const pageOffsetX = pageOffsetFor(box, displayMode, side);
  return point(
    clamp(clientX - box.left - pageOffsetX, 0, pageWidth),
    clamp(clientY - box.top, 0, pageHeight)
  );
}

function clientPointFromLocal(
  localX: number,
  localY: number,
  box: ViewportBox,
  side: "left" | "right",
  displayMode: DisplayMode
): Point {
  const pageOffsetX = pageOffsetFor(box, displayMode, side);
  return point(box.left + pageOffsetX + localX, box.top + localY);
}

function progressFromTurnPoint(
  pointX: number,
  pageWidth: number,
  side: "left" | "right"
): number {
  if (side === "right") {
    return clamp((pageWidth - pointX) / pageWidth, 0, 1);
  }

  return clamp(pointX / pageWidth, 0, 1);
}

export function foldPointForActiveTurn(
  state: FlipTurnState,
  activeTurn: ActiveTurn
): Point {
  if (!isReversedSingleTurn(state, activeTurn.direction)) {
    return activeTurn.point;
  }

  const foldPointX = reversedDragFoldPointX(
    activeTurn.point.x,
    activeTurn.pageWidth
  );

  return point(
    clamp(foldPointX, -activeTurn.pageWidth, activeTurn.pageWidth),
    activeTurn.point.y
  );
}

export function syncActiveTurnProgress(state: FlipTurnState) {
  if (!state.activeTurn) {
    return;
  }

  const geometricProgress = progressFromTurnPoint(
    state.activeTurn.point.x,
    state.activeTurn.pageWidth,
    state.activeTurn.side
  );

  state.activeTurn.progress = isReversedSingleTurn(
    state,
    state.activeTurn.direction
  )
    ? 1 - geometricProgress
    : geometricProgress;
}

function cornerSizeForDirection(
  state: FlipTurnState,
  direction: TurnDirection,
  box: ViewportBox
): number {
  const pageWidth = pageWidthForBox(state, box);
  return constrainCornerSize(
    resolveTurnOptions(state, direction).cornerSize,
    pageWidth,
    box.height
  );
}

export function cornerAtPoint(
  state: FlipTurnState,
  clientX: number,
  clientY: number,
  box: ViewportBox
): Corner | null {
  const pageWidth = pageWidthForBox(state, box);
  const backwardCornerSize = cornerSizeForDirection(state, "backward", box);
  const forwardCornerSize = cornerSizeForDirection(state, "forward", box);

  const side = sideForClientX(state, clientX, box);
  const isRightPage = side === "right";
  const single = isSingleDisplayMode(state);
  const displayMode = single ? "single" : "double";
  const localPoint = localPagePointFromClient(
    clientX,
    clientY,
    box,
    pageWidth,
    box.height,
    side,
    displayMode
  );

  const onLeftEdge = localPoint.x <= backwardCornerSize;
  const onRightEdge = localPoint.x >= pageWidth - forwardCornerSize;

  const innerSpineCorner =
    !single && ((isRightPage && onLeftEdge) || (!isRightPage && onRightEdge));

  if (innerSpineCorner) {
    return null;
  }

  const canForwardHere = single || isRightPage;
  const canBackwardHere = single || !isRightPage;

  const forwardOptions = resolveTurnOptions(state, "forward");
  const backwardOptions = resolveTurnOptions(state, "backward");
  const hardForwardFromRightEdge =
    canForwardHere && forwardOptions.hard && onRightEdge;
  const hardBackwardFromLeftEdge =
    canBackwardHere && backwardOptions.hard && onLeftEdge;

  if (hardForwardFromRightEdge || hardBackwardFromLeftEdge) {
    if (hardForwardFromRightEdge && !canTurnDirection(state, "forward")) {
      return null;
    }

    if (hardBackwardFromLeftEdge && !canTurnDirection(state, "backward")) {
      return null;
    }

    const isTopHalf = localPoint.y <= box.height / 2;
    if (hardForwardFromRightEdge) {
      return isTopHalf ? "tr" : "br";
    }

    return isTopHalf ? "tl" : "bl";
  }

  if (single && onLeftEdge) {
    const corner: Corner = localPoint.y <= box.height / 2 ? "tl" : "bl";
    return isCornerAllowedForDirection(state, corner, "backward")
      ? corner
      : null;
  }

  const maxVerticalCornerSize = Math.max(backwardCornerSize, forwardCornerSize);
  const isTop = localPoint.y <= maxVerticalCornerSize;
  const isBottom = localPoint.y >= box.height - maxVerticalCornerSize;

  if (!isTop && !isBottom) {
    return null;
  }

  let corner: Corner | null = null;
  if (onLeftEdge) {
    corner = isTop ? "tl" : "bl";
  } else if (onRightEdge) {
    corner = isTop ? "tr" : "br";
  }

  if (!corner) {
    return null;
  }

  const direction = directionFromCorner(corner);
  return isCornerAllowedForDirection(state, corner, direction) ? corner : null;
}

export function cornerForDirection(direction: TurnDirection): Corner {
  return direction === "forward" ? "br" : "bl";
}

export function previewPointForTurn(
  state: FlipTurnState,
  direction: TurnDirection,
  foldCorner: Corner,
  pageWidth: number,
  pageHeight: number,
  previewSize: number
): Point {
  if (isReversedSingleTurn(state, direction)) {
    return point(
      reversedDragFingerForFill(REVERSED_PREVIEW_FILL, pageWidth),
      isTopCorner(foldCorner) ? 0 : pageHeight
    );
  }

  const inset = constrainCornerSize(previewSize, pageWidth, pageHeight) / 2;
  return cornerPoint(foldCorner, pageWidth, pageHeight, inset);
}

export function syntheticPointerAtCorner(
  state: FlipTurnState,
  corner: Corner,
  box: ViewportBox,
  offset: number,
  pointerId: number,
  displayMode: "single" | "double"
): { clientX: number; clientY: number; pointerId: number } {
  const side = sideForCorner(corner);
  const pageWidth = pageWidthForBox(state, box);
  const startPoint = cornerPoint(corner, pageWidth, box.height, offset);
  const clientPoint = clientPointFromLocal(
    startPoint.x,
    startPoint.y,
    box,
    side,
    displayMode
  );

  return {
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    pointerId,
  };
}
