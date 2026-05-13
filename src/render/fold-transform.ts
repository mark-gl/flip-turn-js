import { diagonalLength, point } from "../core/math";
import { rotate, setTransform, translate } from "../dom/css-transforms";
import { computeFoldGeometry } from "../layout/fold";
import { cornerPoint } from "../layout/spread";
import { activeTurnGradientOptions } from "../turn/options";
import type { Corner, Point } from "../types/primitives";
import type { FoldGeometry } from "../types/renderer";
import type { ActiveTurn, FlipTurnState } from "../types/state";
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
    pageHeight: number
  ) => string;
  foldPageOrigin: string;
  foldContentTransform: (pageWidth: number, pageHeight: number) => string;
  foldContentOrigin: string;
};

type FoldTransformPrimitives = {
  fixedGeometry: FoldGeometry;
  cornerConfig: FoldCornerConfig;
  pageWidth: number;
  pageHeight: number;
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
  y: number
): string {
  return rotate(angleDegrees) + translate(x, y, false);
}

function translationThenRotation(
  x: number,
  y: number,
  angleDegrees: number
): string {
  return translate(x, y, false) + rotate(angleDegrees);
}

function rotateY(degrees: number): string {
  return ` rotateY(${degrees}deg) `;
}

function translateZ(depth: number): string {
  return ` translateZ(${depth}px) `;
}

function hardTurnProgress(
  pointX: number,
  pageWidth: number,
  side: "left" | "right"
): number {
  if (pageWidth <= 0) {
    return 0;
  }

  if (side === "right") {
    return Math.max(0, Math.min(1, (pageWidth - pointX) / (2 * pageWidth)));
  }

  return Math.max(0, Math.min(1, pointX / (2 * pageWidth)));
}

function clearShadowGradient(target: HTMLDivElement) {
  target.style.setProperty("background-image", "none");
}

function setHardPageShading(layers: ActiveLayers, enabled: boolean) {
  if (enabled) {
    layers.frontPage.style.setProperty(
      "box-shadow",
      "inset 1px 0 0 rgba(0, 0, 0, 0.2), 0 0.6rem 1.4rem rgba(0, 0, 0, 0.22)"
    );
    layers.foldContent.style.setProperty(
      "box-shadow",
      "inset -1px 0 0 rgba(0, 0, 0, 0.2), 0 0.6rem 1.4rem rgba(0, 0, 0, 0.2)"
    );
    return;
  }

  layers.frontPage.style.removeProperty("box-shadow");
  layers.foldContent.style.removeProperty("box-shadow");
}

function setBackfaceVisibility(
  target: HTMLDivElement,
  value: "hidden" | "visible"
) {
  target.style.setProperty("backface-visibility", value);
  target.style.setProperty("-webkit-backface-visibility", value);
}

function setHardBackFaceRenderingMode(layers: ActiveLayers, enabled: boolean) {
  const visibility = enabled ? "visible" : "hidden";
  setBackfaceVisibility(layers.foldRotator, visibility);
  setBackfaceVisibility(layers.foldPage, visibility);
  setBackfaceVisibility(layers.foldContent, "hidden");
}

function setHardPageEdgeThickness(
  layers: ActiveLayers,
  side: "left" | "right",
  thickness: number
) {
  const clampedThickness = Math.max(0, thickness);
  const visible = clampedThickness >= 0.5;

  layers.hardEdge.style.setProperty("height", "100%");
  layers.hardEdge.style.setProperty("width", `${clampedThickness}px`);
  layers.hardEdge.style.setProperty("opacity", visible ? "1" : "0");

  if (side === "right") {
    layers.hardEdge.style.setProperty("left", "100%");
    layers.hardEdge.style.setProperty("right", "auto");
    setTransform(layers.hardEdge, rotateY(90), "0% 50%");
    return;
  }

  layers.hardEdge.style.setProperty("left", "auto");
  layers.hardEdge.style.setProperty("right", "100%");
  setTransform(layers.hardEdge, rotateY(-90), "100% 50%");
}

function applyHardPageTransform(
  state: FlipTurnState,
  layers: ActiveLayers,
  turn: ActiveTurn
) {
  layers.frontWrapper.style.setProperty("overflow", "visible");
  setHardBackFaceRenderingMode(layers, false);

  const rigidProgress = hardTurnProgress(
    turn.point.x,
    turn.pageWidth,
    turn.side
  );
  const hardThickness =
    state.activeTurnResolvedOptions?.hardThickness ??
    state.options.hardThickness;
  const backFaceShouldBeOnTop = rigidProgress >= 0.5;
  const rotationYDegrees =
    turn.side === "right" ? -180 * rigidProgress : 180 * rigidProgress;
  const rotationOrigin = turn.side === "right" ? "0% 50%" : "100% 50%";
  const backFaceCompensationX =
    turn.side === "right" ? turn.pageWidth : -turn.pageWidth;
  const hardTransform = rotateY(rotationYDegrees);

  setTransform(
    layers.frontWrapper,
    hardTransform + translateZ(Math.max(0, hardThickness)),
    rotationOrigin
  );
  setTransform(
    layers.foldWrapper,
    hardTransform + translate(backFaceCompensationX, 0, false) + rotateY(180),
    rotationOrigin
  );

  layers.frontWrapper.style.setProperty(
    "z-index",
    backFaceShouldBeOnTop ? "26" : "34"
  );
  layers.foldWrapper.style.setProperty(
    "z-index",
    backFaceShouldBeOnTop ? "34" : "26"
  );

  setTransform(layers.frontRotator, "", "50% 50%");
  setTransform(layers.frontPage, "", "50% 50%");
  setTransform(layers.foldRotator, "", "50% 50%");
  setTransform(layers.foldPage, "", "50% 50%");
  setTransform(layers.foldContent, "", "50% 50%");

  clearShadowGradient(layers.frontShadow);
  clearShadowGradient(layers.backShadow);
  setHardPageShading(layers, true);
  setHardPageEdgeThickness(layers, turn.side, hardThickness);
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

  applyFrameEdges(layers.frontPage, framePosition);

  setTransform(
    layers.frontPage,
    rotationThenTranslation(
      angleDegrees,
      translatePoint.x + aliasingFix,
      translatePoint.y
    ),
    origin
  );

  applyFrameEdges(layers.foldRotator, framePosition);

  setTransform(
    layers.frontRotator,
    translationThenRotation(
      -translatePoint.x + moveWidth - aliasingFix,
      -translatePoint.y + moveHeight,
      -angleDegrees
    ),
    origin
  );

  setTransform(
    layers.foldWrapper,
    translationThenRotation(
      -translatePoint.x + foldGeometry.moveVector.x + moveWidth,
      -translatePoint.y + foldGeometry.moveVector.y + moveHeight,
      -angleDegrees
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
        foldGeometry.moveVector.y
    ),
    origin
  );

  applyFoldShadows(state, layers, foldGeometry, pageWidth, pageHeight);
}

function contentTurnFromTop(pageHeight: number): string {
  return rotate(QUARTER_TURN_DEGREES) + translate(0, -pageHeight);
}

function contentTurnFromRight(pageWidth: number): string {
  return rotate(THREE_QUARTER_TURN_DEGREES) + translate(-pageWidth, 0);
}

const foldCornerConfigs: Record<Corner, FoldCornerConfig> = {
  tl: {
    constrainX: (x) => Math.max(x, 1),
    foldTranslatePoint: (geometry) => geometry.translate,
    edgeIndexMap: [1, 0, 0, 1],
    anchorPercent: [100, 0],
    foldAngleDegrees: (angleDegrees) => angleDegrees,
    foldPageTransform: (geometry, pageWidth, pageHeight) =>
      translate(-pageHeight, -pageWidth) +
      rotate(QUARTER_TURN_DEGREES - geometry.angleDegrees * 2),
    foldPageOrigin: "100% 100%",
    foldContentTransform: (_pageWidth, pageHeight) =>
      contentTurnFromTop(pageHeight),
    foldContentOrigin: "0% 0%",
  },
  tr: {
    constrainX: (x, pageWidth) => Math.min(x, pageWidth - 1),
    foldTranslatePoint: (geometry) =>
      point(-geometry.translate.x, geometry.translate.y),
    edgeIndexMap: [0, 0, 0, 1],
    anchorPercent: [0, 0],
    foldAngleDegrees: (angleDegrees) => -angleDegrees,
    foldPageTransform: (geometry, pageWidth) =>
      translate(0, -pageWidth) +
      rotate(NEGATIVE_QUARTER_TURN_DEGREES + geometry.angleDegrees * 2),
    foldPageOrigin: "0% 100%",
    foldContentTransform: (pageWidth) => contentTurnFromRight(pageWidth),
    foldContentOrigin: "0% 0%",
  },
  bl: {
    constrainX: (x) => Math.max(x, 1),
    foldTranslatePoint: (geometry) =>
      point(geometry.translate.x, -geometry.translate.y),
    edgeIndexMap: [1, 1, 0, 0],
    anchorPercent: [100, 100],
    foldAngleDegrees: (angleDegrees) => -angleDegrees,
    foldPageTransform: (geometry, _pageWidth, pageHeight) =>
      translate(-pageHeight, 0) +
      rotate(NEGATIVE_QUARTER_TURN_DEGREES + geometry.angleDegrees * 2),
    foldPageOrigin: "100% 0%",
    foldContentTransform: (pageWidth) => contentTurnFromRight(pageWidth),
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
    foldContentTransform: (_pageWidth, pageHeight) =>
      contentTurnFromTop(pageHeight),
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
  };
}

export function applyFoldTransform(
  state: FlipTurnState,
  layers: ActiveLayers,
  turn: ActiveTurn,
  geometry: FoldGeometry
) {
  if (state.activeTurnResolvedOptions?.hard === true) {
    applyHardPageTransform(state, layers, turn);
    return;
  }

  layers.frontWrapper.style.setProperty("overflow", "hidden");
  setHardBackFaceRenderingMode(layers, false);
  setTransform(layers.frontWrapper, "", "0% 100%");
  layers.hardEdge.style.setProperty("opacity", "0");
  layers.hardEdge.style.setProperty("width", "0px");
  layers.hardEdge.style.setProperty("left", "auto");
  layers.hardEdge.style.setProperty("right", "auto");
  setTransform(layers.hardEdge, "", "0% 50%");
  setHardPageShading(layers, false);

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
      primitives.pageHeight
    ),
    primitives.cornerConfig.foldPageOrigin
  );
  setTransform(
    layers.foldContent,
    primitives.cornerConfig.foldContentTransform(
      primitives.pageWidth,
      primitives.pageHeight
    ),
    primitives.cornerConfig.foldContentOrigin
  );
}
