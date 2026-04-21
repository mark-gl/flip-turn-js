import { PI, distanceBetweenPoints, magnitude, point } from "../core/math";
import type { Point } from "../types/primitives";

export type GradientStop = {
  percent: number;
  color: string;
};

export type LinearGradientDescriptor = {
  angleRadians: number;
  stops: GradientStop[];
};

export function computeLinearGradientDescriptor(
  box: { width: number; height: number },
  pointStart: Point,
  pointEnd: Point,
  colors: Array<[number, string]>
): LinearGradientDescriptor {
  const absoluteStart = point(
    (pointStart.x / 100) * box.width,
    (pointStart.y / 100) * box.height
  );
  const absoluteEnd = point(
    (pointEnd.x / 100) * box.width,
    (pointEnd.y / 100) * box.height
  );

  const deltaX = absoluteEnd.x - absoluteStart.x;
  const deltaY = absoluteEnd.y - absoluteStart.y;
  const angle = Math.atan2(deltaY, deltaX);
  const angleOrthogonal = angle - PI / 2;
  const diagonal =
    Math.abs(box.width * Math.sin(angleOrthogonal)) +
    Math.abs(box.height * Math.cos(angleOrthogonal));
  const gradientDiagonal = magnitude(deltaX, deltaY);

  const cornerPoint = point(
    absoluteEnd.x < absoluteStart.x ? box.width : 0,
    absoluteEnd.y < absoluteStart.y ? box.height : 0
  );

  const slope = Math.tan(angle);
  const inverseSlope = -1 / slope;
  const crossingX =
    (inverseSlope * cornerPoint.x -
      cornerPoint.y -
      slope * absoluteStart.x +
      absoluteStart.y) /
    (inverseSlope - slope);

  const crossingPoint = point(
    crossingX,
    inverseSlope * crossingX - inverseSlope * cornerPoint.x + cornerPoint.y
  );

  const segmentLength = distanceBetweenPoints(absoluteStart, crossingPoint);
  const stops = colors.map(([position, color]) => ({
    color,
    percent: ((segmentLength + gradientDiagonal * position) * 100) / diagonal,
  }));

  return {
    angleRadians: PI / 2 + angle,
    stops,
  };
}

export function linearGradientCss(
  descriptor: LinearGradientDescriptor
): string {
  const colorStops = descriptor.stops
    .map((stop) => `${stop.color} ${stop.percent}%`)
    .join(",");

  return `linear-gradient(${descriptor.angleRadians}rad, ${colorStops})`;
}

export function setGradient(
  element: HTMLElement,
  pointStart: Point,
  pointEnd: Point,
  colors: Array<[number, string]>,
  box?: { width: number; height: number }
) {
  const gradientBox = box ?? {
    width: element.offsetWidth,
    height: element.offsetHeight,
  };

  const descriptor = computeLinearGradientDescriptor(
    gradientBox,
    pointStart,
    pointEnd,
    colors
  );

  element.style.setProperty("background-image", linearGradientCss(descriptor));
}
