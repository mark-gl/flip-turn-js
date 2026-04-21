import type { Point } from "../types/primitives";

type FiniteBounds = {
  minimum?: number;
  maximum?: number;
};

export const PI = Math.PI;
export const HALF_PI = PI / 2;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampWithinBounds(value: number, bounds: FiniteBounds): number {
  const minimumBound = bounds.minimum ?? Number.NEGATIVE_INFINITY;
  const maximumBound = bounds.maximum ?? Number.POSITIVE_INFINITY;
  return clamp(value, minimumBound, maximumBound);
}

function normalizeFinite(
  value: number | undefined,
  fallback: number,
  normalize: (value: number) => number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return normalize(value);
}

export function finiteNonNegative(
  value: number | undefined,
  fallback: number
): number {
  return finiteAtLeast(0, value, fallback);
}

export function finiteAtLeastOne(
  value: number | undefined,
  fallback: number
): number {
  return finiteAtLeast(1, value, fallback);
}

function finiteAtLeast(
  minimumBound: number,
  value: number | undefined,
  fallback: number
): number {
  return normalizeFinite(value, fallback, (finiteValue) =>
    Math.max(minimumBound, finiteValue)
  );
}

export function finiteFlooredWithin(
  value: number | undefined,
  fallback: number,
  bounds: FiniteBounds
): number {
  return normalizeFinite(value, fallback, (finiteValue) =>
    clampWithinBounds(Math.floor(finiteValue), bounds)
  );
}

export function constrainCornerSize(
  cornerSize: number,
  pageWidth: number,
  pageHeight: number
): number {
  return Math.min(cornerSize, pageHeight / 2, pageWidth / 2);
}

export function point(x: number, y: number): Point {
  return { x, y };
}

export function square(value: number): number {
  return value * value;
}

export function magnitude(x: number, y: number): number {
  return Math.sqrt(square(x) + square(y));
}

export function distanceBetweenPoints(start: Point, end: Point): number {
  return magnitude(end.x - start.x, end.y - start.y);
}

export function diagonalLength(width: number, height: number): number {
  return Math.round(magnitude(width, height));
}

export function bezier(
  point1: Point,
  point2: Point,
  point3: Point,
  point4: Point,
  t: number
): Point {
  const oneMinusT = 1 - t;
  const oneMinusTCubed = oneMinusT * oneMinusT * oneMinusT;
  const tCubed = t * t * t;

  return point(
    Math.round(
      oneMinusTCubed * point1.x +
        3 * t * oneMinusT * oneMinusT * point2.x +
        3 * t * t * oneMinusT * point3.x +
        tCubed * point4.x
    ),
    Math.round(
      oneMinusTCubed * point1.y +
        3 * t * oneMinusT * oneMinusT * point2.y +
        3 * t * t * oneMinusT * point3.y +
        tCubed * point4.y
    )
  );
}
