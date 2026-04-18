import { clamp, constrainCornerSize, point } from "../core/math";
import { pageOffsetXForSide } from "../core/state";
import type {
  Corner,
  DisplayMode,
  FlipTurnState,
  Point,
  TurnDirection,
  ViewportBox,
} from "../core/types";
import {
  cornerPoint,
  directionFromCorner,
  isDoubleDisplayMode,
  pageWidthForBox,
  sideForClientX,
  sideForCorner,
} from "../layout/spread";
import { isCornerAllowedForDirection, resolveTurnOptions } from "./options";

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

export function clientPointFromLocal(
  localX: number,
  localY: number,
  box: ViewportBox,
  side: "left" | "right",
  displayMode: DisplayMode
): Point {
  const pageOffsetX = pageOffsetFor(box, displayMode, side);
  return point(box.left + pageOffsetX + localX, box.top + localY);
}

export function progressFromTurnPoint(
  pointX: number,
  pageWidth: number,
  side: "left" | "right"
): number {
  if (side === "right") {
    return clamp((pageWidth - pointX) / pageWidth, 0, 1);
  }

  return clamp(pointX / pageWidth, 0, 1);
}

export function syncActiveTurnProgress(state: FlipTurnState) {
  if (!state.activeTurn) {
    return;
  }

  state.activeTurn.progress = progressFromTurnPoint(
    state.activeTurn.point.x,
    state.activeTurn.pageWidth,
    state.activeTurn.side
  );
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
  const displayMode = isDoubleDisplayMode(state) ? "double" : "single";
  const localPoint = localPagePointFromClient(
    clientX,
    clientY,
    box,
    pageWidth,
    box.height,
    side,
    displayMode
  );

  const innerSpineCorner =
    isDoubleDisplayMode(state) &&
    ((isRightPage && localPoint.x <= backwardCornerSize) ||
      (!isRightPage && localPoint.x >= pageWidth - forwardCornerSize));

  if (innerSpineCorner) {
    return null;
  }

  const maxVerticalCornerSize = Math.max(backwardCornerSize, forwardCornerSize);
  const isTop = localPoint.y <= maxVerticalCornerSize;
  const isBottom = localPoint.y >= box.height - maxVerticalCornerSize;

  if (!isTop && !isBottom) {
    return null;
  }

  let corner: Corner | null = null;
  if (localPoint.x <= backwardCornerSize) {
    corner = isTop ? "tl" : "bl";
  } else if (localPoint.x >= pageWidth - forwardCornerSize) {
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
