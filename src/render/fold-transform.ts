import { diagonalLength, point } from "../core/math";
import type {
  ActiveTurn,
  Corner,
  FlipTurnState,
  FoldGeometry,
  Point,
} from "../core/types";
import { rotate, setTransform, translate } from "../dom/css-transforms";
import { computeFoldGeometry } from "../layout/fold";
import { cornerPoint } from "../layout/spread";
import { activeTurnGradientOptions } from "../turn/options";
import { setGradient } from "./gradient";
import type { ActiveLayers } from "./layers";

const QUARTER_TURN_DEGREES = 90;
const THREE_QUARTER_TURN_DEGREES = 270;
const NEGATIVE_QUARTER_TURN_DEGREES = -90;

const FRONT_SHADOW_OPACITY_MULTIPLIER = 0.2;
const BACK_SHADOW_OPACITY_MULTIPLIER = 0.3;
const FRONT_SHADOW_STOP_RATIO = 0.8;
const BACK_SHADOW_START_STOP = 0.8;

type FoldCornerConfig = {
  constrainX: (x: number, pageWidth: number) => number;
  foldTranslatePoint: (geometry: FoldGeometry) => Point;
  edgeIndexMap: [number, number, number, number];
  anchorPercent: [number, number];
  foldAngleDegrees: (angleDegrees: number) => number;
  foldPageTransform: (
    geometry: FoldGeometry,
    pageWidth: number,
    pageHeight: number,
    useAcceleration: boolean
  ) => string;
  foldPageOrigin: string;
  foldContentTransform: (
    pageWidth: number,
    pageHeight: number,
    useAcceleration: boolean
  ) => string;
  foldContentOrigin: string;
};

type FoldTransformPrimitives = {
  fixedGeometry: FoldGeometry;
  cornerConfig: FoldCornerConfig;
  pageWidth: number;
  pageHeight: number;
  useAcceleration: boolean;
};

function applyFrameEdges(
  target: HTMLDivElement,
  frameEdges: { left: string; top: string; right: string; bottom: string }
) {
  for (const [propertyName, propertyValue] of Object.entries(frameEdges)) {
    target.style.setProperty(propertyName, propertyValue);
  }
}

function rotationThenTranslation(
  angleDegrees: number,
  x: number,
  y: number,
  useAcceleration: boolean
): string {
  return rotate(angleDegrees) + translate(x, y, useAcceleration);
}

function translationThenRotation(
  x: number,
  y: number,
  angleDegrees: number,
  useAcceleration: boolean
): string {
  return translate(x, y, useAcceleration) + rotate(angleDegrees);
}

function clearShadowGradient(target: HTMLDivElement) {
  target.style.setProperty("background-image", "none");
}

function applyFoldShadows(
  state: FlipTurnState,
  layers: ActiveLayers,
  foldGeometry: FoldGeometry,
  pageWidth: number,
  pageHeight: number
) {
  const gradientOptions = activeTurnGradientOptions(state);

  if (gradientOptions.front) {
    setGradient(
      layers.frontShadow,
      point(
        foldGeometry.isLeftCorner ? 100 : 0,
        foldGeometry.isTopCorner ? 100 : 0
      ),
      point(foldGeometry.gradientEndPointA.x, foldGeometry.gradientEndPointA.y),
      [
        [foldGeometry.gradientStart, "rgba(0,0,0,0)"],
        [
          (1 - foldGeometry.gradientStart) * FRONT_SHADOW_STOP_RATIO +
            foldGeometry.gradientStart,
          `rgba(0,0,0,${FRONT_SHADOW_OPACITY_MULTIPLIER * foldGeometry.gradientOpacity})`,
        ],
        [
          1,
          `rgba(255,255,255,${FRONT_SHADOW_OPACITY_MULTIPLIER * foldGeometry.gradientOpacity})`,
        ],
      ],
      {
        width: pageHeight,
        height: pageWidth,
      }
    );
  } else {
    clearShadowGradient(layers.frontShadow);
  }

  if (gradientOptions.back) {
    setGradient(
      layers.backShadow,
      point(
        foldGeometry.isLeftCorner ? 0 : 100,
        foldGeometry.isTopCorner ? 0 : 100
      ),
      point(foldGeometry.gradientEndPointB.x, foldGeometry.gradientEndPointB.y),
      [
        [BACK_SHADOW_START_STOP, "rgba(0,0,0,0)"],
        [
          1,
          `rgba(0,0,0,${BACK_SHADOW_OPACITY_MULTIPLIER * foldGeometry.gradientOpacity})`,
        ],
        [1, "rgba(0,0,0,0)"],
      ],
      {
        width: pageWidth,
        height: pageHeight,
      }
    );
  } else {
    clearShadowGradient(layers.backShadow);
  }
}

function applyFoldFrame(
  state: FlipTurnState,
  layers: ActiveLayers,
  pageWidth: number,
  pageHeight: number,
  translatePoint: Point,
  edgeIndexMap: [number, number, number, number],
  anchorPercent: [number, number],
  angleDegrees: number,
  foldGeometry: FoldGeometry
) {
  const diagonalSize = diagonalLength(pageWidth, pageHeight);

  const cssOffsetValues: [string, string] = ["0", "auto"];
  const moveWidth = ((pageWidth - diagonalSize) * anchorPercent[0]) / 100;
  const moveHeight = ((pageHeight - diagonalSize) * anchorPercent[1]) / 100;
  const offsetAt = (index: number): string => cssOffsetValues[index] ?? "0";

  const framePosition = {
    left: offsetAt(edgeIndexMap[0]),
    top: offsetAt(edgeIndexMap[1]),
    right: offsetAt(edgeIndexMap[2]),
    bottom: offsetAt(edgeIndexMap[3]),
  };

  const aliasingFix = foldGeometry.isLeftCorner ? -1 : 1;

  const origin = `${anchorPercent[0]}% ${anchorPercent[1]}%`;
  const activeTurnResolvedOptions = state.activeTurnResolvedOptions;
  const useAcceleration =
    activeTurnResolvedOptions?.acceleration ?? state.options.acceleration;

  applyFrameEdges(layers.frontPage, framePosition);

  setTransform(
    layers.frontPage,
    rotationThenTranslation(
      angleDegrees,
      translatePoint.x + aliasingFix,
      translatePoint.y,
      useAcceleration
    ),
    origin
  );

  applyFrameEdges(layers.foldRotator, framePosition);

  setTransform(
    layers.frontRotator,
    translationThenRotation(
      -translatePoint.x + moveWidth - aliasingFix,
      -translatePoint.y + moveHeight,
      -angleDegrees,
      useAcceleration
    ),
    origin
  );

  setTransform(
    layers.foldWrapper,
    translationThenRotation(
      -translatePoint.x + foldGeometry.moveVector.x + moveWidth,
      -translatePoint.y + foldGeometry.moveVector.y + moveHeight,
      -angleDegrees,
      useAcceleration
    ),
    origin
  );

  setTransform(
    layers.foldRotator,
    rotationThenTranslation(
      angleDegrees,
      translatePoint.x +
        foldGeometry.diagonalFoldPoint.x -
        foldGeometry.moveVector.x,
      translatePoint.y +
        foldGeometry.diagonalFoldPoint.y -
        foldGeometry.moveVector.y,
      useAcceleration
    ),
    origin
  );

  applyFoldShadows(state, layers, foldGeometry, pageWidth, pageHeight);
}

function contentTurnFromTop(
  pageHeight: number,
  useAcceleration: boolean
): string {
  return (
    rotate(QUARTER_TURN_DEGREES) + translate(0, -pageHeight, useAcceleration)
  );
}

function contentTurnFromRight(
  pageWidth: number,
  useAcceleration: boolean
): string {
  return (
    rotate(THREE_QUARTER_TURN_DEGREES) +
    translate(-pageWidth, 0, useAcceleration)
  );
}

const foldCornerConfigs: Record<Corner, FoldCornerConfig> = {
  tl: {
    constrainX: (x) => Math.max(x, 1),
    foldTranslatePoint: (geometry) => geometry.translate,
    edgeIndexMap: [1, 0, 0, 1],
    anchorPercent: [100, 0],
    foldAngleDegrees: (angleDegrees) => angleDegrees,
    foldPageTransform: (geometry, pageWidth, pageHeight, useAcceleration) =>
      translate(-pageHeight, -pageWidth, useAcceleration) +
      rotate(QUARTER_TURN_DEGREES - geometry.angleDegrees * 2),
    foldPageOrigin: "100% 100%",
    foldContentTransform: (_pageWidth, pageHeight, useAcceleration) =>
      contentTurnFromTop(pageHeight, useAcceleration),
    foldContentOrigin: "0% 0%",
  },
  tr: {
    constrainX: (x, pageWidth) => Math.min(x, pageWidth - 1),
    foldTranslatePoint: (geometry) =>
      point(-geometry.translate.x, geometry.translate.y),
    edgeIndexMap: [0, 0, 0, 1],
    anchorPercent: [0, 0],
    foldAngleDegrees: (angleDegrees) => -angleDegrees,
    foldPageTransform: (geometry, pageWidth, _pageHeight, useAcceleration) =>
      translate(0, -pageWidth, useAcceleration) +
      rotate(NEGATIVE_QUARTER_TURN_DEGREES + geometry.angleDegrees * 2),
    foldPageOrigin: "0% 100%",
    foldContentTransform: (pageWidth, _pageHeight, useAcceleration) =>
      contentTurnFromRight(pageWidth, useAcceleration),
    foldContentOrigin: "0% 0%",
  },
  bl: {
    constrainX: (x) => Math.max(x, 1),
    foldTranslatePoint: (geometry) =>
      point(geometry.translate.x, -geometry.translate.y),
    edgeIndexMap: [1, 1, 0, 0],
    anchorPercent: [100, 100],
    foldAngleDegrees: (angleDegrees) => -angleDegrees,
    foldPageTransform: (geometry, _pageWidth, pageHeight, useAcceleration) =>
      translate(-pageHeight, 0, useAcceleration) +
      rotate(NEGATIVE_QUARTER_TURN_DEGREES + geometry.angleDegrees * 2),
    foldPageOrigin: "100% 0%",
    foldContentTransform: (pageWidth, _pageHeight, useAcceleration) =>
      contentTurnFromRight(pageWidth, useAcceleration),
    foldContentOrigin: "0% 0%",
  },
  br: {
    constrainX: (x, pageWidth) => Math.min(x, pageWidth - 1),
    foldTranslatePoint: (geometry) =>
      point(-geometry.translate.x, -geometry.translate.y),
    edgeIndexMap: [0, 1, 1, 0],
    anchorPercent: [0, 100],
    foldAngleDegrees: (angleDegrees) => angleDegrees,
    foldPageTransform: (geometry) =>
      rotate(QUARTER_TURN_DEGREES - geometry.angleDegrees * 2),
    foldPageOrigin: "0% 0%",
    foldContentTransform: (_pageWidth, pageHeight, useAcceleration) =>
      contentTurnFromTop(pageHeight, useAcceleration),
    foldContentOrigin: "0% 0%",
  },
};

export function constrainFoldPointX(
  corner: Corner,
  pointX: number,
  pageWidth: number
): number {
  const cornerConfig = foldCornerConfigs[corner];
  return cornerConfig.constrainX(pointX, pageWidth);
}

function computeFoldTransformPrimitives(
  state: FlipTurnState,
  turn: ActiveTurn,
  geometry: FoldGeometry
): FoldTransformPrimitives {
  const pageWidth = turn.pageWidth;
  const pageHeight = turn.pageHeight;
  const useAcceleration =
    state.activeTurnResolvedOptions?.acceleration ?? state.options.acceleration;

  const cornerConfig = foldCornerConfigs[turn.corner];
  let fixedGeometry = geometry;

  const shouldSnapRestoreClosed =
    turn.phase === "restoring" && turn.progress >= 0.995;

  if (shouldSnapRestoreClosed) {
    fixedGeometry = computeFoldGeometry(
      turn.corner,
      cornerPoint(turn.corner, pageWidth, pageHeight, 0),
      pageWidth,
      pageHeight
    );
  }

  return {
    fixedGeometry,
    cornerConfig,
    pageWidth,
    pageHeight,
    useAcceleration,
  };
}

export function applyFoldTransform(
  state: FlipTurnState,
  layers: ActiveLayers,
  turn: ActiveTurn,
  geometry: FoldGeometry
) {
  const primitives = computeFoldTransformPrimitives(state, turn, geometry);

  applyFoldFrame(
    state,
    layers,
    primitives.pageWidth,
    primitives.pageHeight,
    primitives.cornerConfig.foldTranslatePoint(primitives.fixedGeometry),
    primitives.cornerConfig.edgeIndexMap,
    primitives.cornerConfig.anchorPercent,
    primitives.cornerConfig.foldAngleDegrees(
      primitives.fixedGeometry.angleDegrees
    ),
    primitives.fixedGeometry
  );

  setTransform(
    layers.foldPage,
    primitives.cornerConfig.foldPageTransform(
      primitives.fixedGeometry,
      primitives.pageWidth,
      primitives.pageHeight,
      primitives.useAcceleration
    ),
    primitives.cornerConfig.foldPageOrigin
  );
  setTransform(
    layers.foldContent,
    primitives.cornerConfig.foldContentTransform(
      primitives.pageWidth,
      primitives.pageHeight,
      primitives.useAcceleration
    ),
    primitives.cornerConfig.foldContentOrigin
  );
}
