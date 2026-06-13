import { isTopCorner } from "../layout/spread";
import type { FoldGeometry } from "../types/renderer";
import type { ActiveTurn } from "../types/state";

export const STRIP_COUNT = 20;
export const MIN_FOLD_RADIUS = 0.1;

const ADAPTIVE_CURL_RADIUS = 6;
const ADAPTIVE_CURL_STRIP_SCREEN_PX = 1.5;

const AXIS_OVERLAP = 0.1;

export type StripBand = {
  distanceStart: number;
  distanceEnd: number;
};

export type PagePoint = {
  x: number;
  y: number;
};

export type StripSpace = {
  axisX: number;
  axisY: number;
  normalX: number;
  normalY: number;
  minDistance: number;
  maxDistance: number;
  axisStart: number;
  axisLength: number;
  stripBands: StripBand[];
};

export type SurfaceSample = {
  offset: number;
  depth: number;
  normalZ: number;
  tangentScale: number;
  tangentDepthScale: number;
};

export type CylinderParams = {
  cylPosX: number;
  cylPosY: number;
  cylDirX: number;
  cylDirY: number;
  cylRadius: number;
};

export function clampNumber(
  value: number,
  minValue: number,
  maxValue: number
): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function smoothstep(
  edgeStart: number,
  edgeEnd: number,
  value: number
): number {
  const progress = clampNumber(
    (value - edgeStart) / (edgeEnd - edgeStart),
    0,
    1
  );
  return progress * progress * (3 - 2 * progress);
}

export function computeCylinderParams(
  geometry: FoldGeometry,
  activeTurn: ActiveTurn
): CylinderParams {
  const startX = activeTurn.side === "right" ? activeTurn.pageWidth : 0;
  const startY = isTopCorner(activeTurn.corner) ? 0 : activeTurn.pageHeight;
  const dragX = geometry.point.x - startX;
  const dragY = geometry.point.y - startY;
  const dragLength = Math.sqrt(dragX * dragX + dragY * dragY);
  const fallbackDragX = activeTurn.side === "right" ? -1 : 1;
  const normalizedDragX =
    dragLength > 0.001 ? dragX / dragLength : fallbackDragX;
  const normalizedDragY = dragLength > 0.001 ? dragY / dragLength : 0;

  let radius = 16 + dragLength / 8;
  const quarterDistance = (Math.PI / 2 - 1) * radius;
  let cylinderDistance: number;

  if (dragLength < quarterDistance) {
    cylinderDistance = (dragLength / quarterDistance) * (Math.PI / 2) * radius;
  } else if (dragLength < Math.PI * radius) {
    cylinderDistance =
      ((dragLength - quarterDistance) / (Math.PI * radius - quarterDistance) +
        1) *
      (Math.PI / 2) *
      radius;
  } else {
    cylinderDistance = Math.PI * radius + (dragLength - Math.PI * radius) / 2;
  }

  let cylPosX = startX + normalizedDragX * cylinderDistance;
  let cylPosY = startY + normalizedDragY * cylinderDistance;
  const cylDirX = normalizedDragY;
  const cylDirY = -normalizedDragX;

  // Constrain the cylinder so it does not lift the spine/opposite edge
  const normalX = cylDirY;
  const normalY = -cylDirX;
  const spineX = activeTurn.side === "right" ? 0 : activeTurn.pageWidth;

  const dAtTop = (spineX - cylPosX) * normalX + (0 - cylPosY) * normalY;
  const dAtBottom =
    (spineX - cylPosX) * normalX + (activeTurn.pageHeight - cylPosY) * normalY;
  const maxSpineD = Math.max(dAtTop, dAtBottom);

  if (maxSpineD > 0) {
    cylPosX += maxSpineD * normalX;
    cylPosY += maxSpineD * normalY;
    const trueRadius = radius - (2 * maxSpineD) / Math.PI;
    radius = Math.max(MIN_FOLD_RADIUS, trueRadius);
  }

  return {
    cylPosX,
    cylPosY,
    cylDirX,
    cylDirY,
    cylRadius: radius,
  };
}

function pageCorners(pageWidth: number, pageHeight: number): PagePoint[] {
  return [
    { x: 0, y: 0 },
    { x: pageWidth, y: 0 },
    { x: pageWidth, y: pageHeight },
    { x: 0, y: pageHeight },
  ];
}

function projectPoint(
  point: PagePoint,
  cylinder: CylinderParams,
  vectorX: number,
  vectorY: number
): number {
  return (
    (point.x - cylinder.cylPosX) * vectorX +
    (point.y - cylinder.cylPosY) * vectorY
  );
}

export function stripBandLength(stripBand: StripBand): number {
  return Math.max(0, stripBand.distanceEnd - stripBand.distanceStart);
}

export function sampleSurfaceAtDistance(
  distance: number,
  cylinder: CylinderParams
): SurfaceSample {
  if (distance <= 0) {
    return {
      offset: distance,
      depth: 0,
      normalZ: 1,
      tangentScale: 1,
      tangentDepthScale: 0,
    };
  }

  const maxWrapDistance = Math.PI * cylinder.cylRadius;
  const clampedDistance = Math.min(distance, maxWrapDistance);
  const wrapAngle = clampedDistance / cylinder.cylRadius;
  const sinAngle = Math.sin(wrapAngle);
  const cosAngle = Math.cos(wrapAngle);
  const overshoot = Math.max(0, distance - maxWrapDistance);

  return {
    offset: sinAngle * cylinder.cylRadius - overshoot,
    depth: (1 - cosAngle) * cylinder.cylRadius,
    normalZ: cosAngle,
    tangentScale: overshoot > 0 ? -1 : cosAngle,
    tangentDepthScale: sinAngle,
  };
}

export function shouldDisplaySurface(
  sample: SurfaceSample,
  distance: number,
  cylinder: CylinderParams,
  isBackFace: boolean
): boolean {
  const radiusFactor = smoothstep(5, 25, cylinder.cylRadius);
  const discardThreshold = 1 - radiusFactor;

  if (isBackFace) {
    return distance > 0 && sample.normalZ < discardThreshold;
  }

  return distance <= 0 || sample.normalZ >= discardThreshold;
}

function curlRegion(
  cylinder: CylinderParams,
  minDistance: number,
  maxDistance: number
): { curlStart: number; curlEnd: number } {
  const wrapDistance = Math.PI * cylinder.cylRadius;
  const curlPadding = Math.max(2, cylinder.cylRadius * 0.35);
  return {
    curlStart: clampNumber(-curlPadding, minDistance, maxDistance),
    curlEnd: clampNumber(wrapDistance + curlPadding, minDistance, maxDistance),
  };
}

function subdivide(start: number, end: number, count: number): StripBand[] {
  const span = end - start;
  return Array.from({ length: count }, (_, index) => ({
    distanceStart: start + (span * index) / count,
    distanceEnd: start + (span * (index + 1)) / count,
  }));
}

function buildWeightedStripBands(
  minDistance: number,
  maxDistance: number,
  cylinder: CylinderParams,
  stripCount: number
): StripBand[] {
  const distanceRange = Math.max(1, maxDistance - minDistance);
  const { curlStart, curlEnd } = curlRegion(cylinder, minDistance, maxDistance);
  const curlLength = Math.max(0, curlEnd - curlStart);

  if (curlLength <= 0.001) {
    return subdivide(minDistance, maxDistance, stripCount);
  }

  const curlWeight =
    1 + clampNumber(distanceRange / Math.max(1, curlLength) - 1, 0, 11);
  const weightedSections: Array<StripBand & { weight: number }> = [
    { distanceStart: minDistance, distanceEnd: curlStart, weight: 1 },
    { distanceStart: curlStart, distanceEnd: curlEnd, weight: curlWeight },
    { distanceStart: curlEnd, distanceEnd: maxDistance, weight: 1 },
  ].filter((section) => stripBandLength(section) > 0.001);
  const totalWeightedLength = weightedSections.reduce(
    (total, section) => total + stripBandLength(section) * section.weight,
    0
  );

  const edgeDistances: number[] = [];
  for (let edgeIndex = 0; edgeIndex <= stripCount; edgeIndex += 1) {
    const targetWeightedDistance =
      (totalWeightedLength * edgeIndex) / stripCount;
    let consumedWeightedDistance = 0;
    let edgeDistance = maxDistance;

    for (const section of weightedSections) {
      const sectionWeightedLength = stripBandLength(section) * section.weight;
      if (
        targetWeightedDistance <=
        consumedWeightedDistance + sectionWeightedLength
      ) {
        edgeDistance =
          section.distanceStart +
          (targetWeightedDistance - consumedWeightedDistance) / section.weight;
        break;
      }
      consumedWeightedDistance += sectionWeightedLength;
    }

    edgeDistances.push(edgeDistance);
  }

  return Array.from({ length: stripCount }, (_, stripIndex) => ({
    distanceStart: edgeDistances[stripIndex]!,
    distanceEnd: edgeDistances[stripIndex + 1]!,
  }));
}

function buildFootprintStripBands(
  minDistance: number,
  maxDistance: number,
  cylinder: CylinderParams,
  stripCount: number,
  curlBudget: number
): StripBand[] {
  const { curlStart, curlEnd } = curlRegion(cylinder, minDistance, maxDistance);
  const beforeLength = Math.max(0, curlStart - minDistance);
  const curlLength = Math.max(0, curlEnd - curlStart);
  const afterLength = Math.max(0, maxDistance - curlEnd);

  if (curlLength <= 0.001) {
    return subdivide(minDistance, maxDistance, stripCount);
  }

  const hasBefore = beforeLength > 0.001;
  const hasAfter = afterLength > 0.001;
  const flatSectionCount = (hasBefore ? 1 : 0) + (hasAfter ? 1 : 0);
  const curlCount =
    flatSectionCount === 0
      ? stripCount
      : clampNumber(Math.round(curlBudget), 1, stripCount - flatSectionCount);
  const remaining = stripCount - curlCount;

  let beforeCount = 0;
  let afterCount = 0;
  if (hasBefore && hasAfter) {
    beforeCount = clampNumber(
      Math.round((remaining * beforeLength) / (beforeLength + afterLength)),
      1,
      remaining - 1
    );
    afterCount = remaining - beforeCount;
  } else if (hasBefore) {
    beforeCount = remaining;
  } else if (hasAfter) {
    afterCount = remaining;
  }

  return [
    ...(hasBefore ? subdivide(minDistance, curlStart, beforeCount) : []),
    ...subdivide(curlStart, curlEnd, curlCount),
    ...(hasAfter ? subdivide(curlEnd, maxDistance, afterCount) : []),
  ];
}

export function buildStripBands(
  minDistance: number,
  maxDistance: number,
  cylinder: CylinderParams,
  stripCount: number
): StripBand[] {
  if (cylinder.cylRadius >= ADAPTIVE_CURL_RADIUS) {
    return buildWeightedStripBands(
      minDistance,
      maxDistance,
      cylinder,
      stripCount
    );
  }

  const screenFootprint = 2 * cylinder.cylRadius;
  const curlBudget = clampNumber(
    Math.round(screenFootprint / ADAPTIVE_CURL_STRIP_SCREEN_PX),
    1,
    stripCount - 2
  );
  return buildFootprintStripBands(
    minDistance,
    maxDistance,
    cylinder,
    stripCount,
    curlBudget
  );
}

export function computeStripSpace(
  pageWidth: number,
  pageHeight: number,
  cylinder: CylinderParams
): StripSpace {
  const normalX = cylinder.cylDirY;
  const normalY = -cylinder.cylDirX;
  const axisX = cylinder.cylDirX;
  const axisY = cylinder.cylDirY;
  let minDistance = Number.POSITIVE_INFINITY;
  let maxDistance = Number.NEGATIVE_INFINITY;
  let minAxis = Number.POSITIVE_INFINITY;
  let maxAxis = Number.NEGATIVE_INFINITY;

  for (const corner of pageCorners(pageWidth, pageHeight)) {
    const distance = projectPoint(corner, cylinder, normalX, normalY);
    const axisPosition = projectPoint(corner, cylinder, axisX, axisY);
    minDistance = Math.min(minDistance, distance);
    maxDistance = Math.max(maxDistance, distance);
    minAxis = Math.min(minAxis, axisPosition);
    maxAxis = Math.max(maxAxis, axisPosition);
  }

  const axisStart = minAxis - AXIS_OVERLAP;
  const axisLength = Math.max(1, maxAxis - minAxis + AXIS_OVERLAP * 2);

  return {
    axisX,
    axisY,
    normalX,
    normalY,
    minDistance,
    maxDistance,
    axisStart,
    axisLength,
    stripBands: buildStripBands(
      minDistance,
      maxDistance,
      cylinder,
      STRIP_COUNT
    ),
  };
}
