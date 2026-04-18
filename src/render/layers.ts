import { diagonalLength } from "../core/math";
import type { FlipTurnState } from "../core/types";
import { setTransform } from "../dom/css-transforms";
import type { FlipTurnDom } from "../dom/dom";
import { markInternalNode } from "../dom/dom";
import { isDoubleDisplayMode } from "../layout/spread";

export type ActiveLayers = {
  frontWrapper: HTMLDivElement;
  frontRotator: HTMLDivElement;
  frontPage: HTMLDivElement;
  foldWrapper: HTMLDivElement;
  foldRotator: HTMLDivElement;
  foldPage: HTMLDivElement;
  foldContent: HTMLDivElement;
  frontShadow: HTMLDivElement;
  backShadow: HTMLDivElement;
};

export function createLayerDiv(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  markInternalNode(element);
  return element;
}

export function setupActiveLayers(dom: FlipTurnDom): ActiveLayers {
  const frontWrapper = createLayerDiv("flip-turn-active-front-layer");
  const frontRotator = createLayerDiv("flip-turn-active-front-rotator");
  const frontPage = createLayerDiv(
    "flip-turn-active-front-page flip-turn-page"
  );

  frontRotator.append(frontPage);
  frontWrapper.append(frontRotator);

  const foldWrapper = createLayerDiv("flip-turn-active-fold-layer");
  const foldRotator = createLayerDiv("flip-turn-active-fold-rotator");
  const foldPage = createLayerDiv("flip-turn-active-fold-page");
  const foldContent = createLayerDiv(
    "flip-turn-active-fold-content flip-turn-page"
  );
  const frontShadow = createLayerDiv("flip-turn-active-front-shadow");
  const backShadow = createLayerDiv("flip-turn-active-back-shadow");

  foldPage.append(foldContent, frontShadow);
  foldRotator.append(foldPage);
  foldWrapper.append(foldRotator);

  dom.viewport.append(frontWrapper, foldWrapper, backShadow);

  return {
    frontWrapper,
    frontRotator,
    frontPage,
    foldWrapper,
    foldRotator,
    foldPage,
    foldContent,
    frontShadow,
    backShadow,
  };
}

const LAYER_ORDER_SWITCH_PROGRESS = 0.55;
const Z_INDEX_FOLD_WRAPPER = "34";

const RIGHT_LAYER_Z_INDEX = {
  frontWhenMovingInFront: "32",
  frontWhenMovingBehind: "26",
  backWhenMovingInFront: "30",
  backWhenMovingBehind: "24",
} as const;

const LEFT_LAYER_Z_INDEX = {
  frontWhenMovingInFront: "26",
  frontWhenMovingBehind: "32",
  backWhenMovingInFront: "24",
  backWhenMovingBehind: "30",
} as const;

const zIndexBySide = {
  right: RIGHT_LAYER_Z_INDEX,
  left: LEFT_LAYER_Z_INDEX,
} as const;

type LayerOrderCache = {
  side: "left" | "right";
  movingInFront: boolean;
};

const layerOrderCacheByLayers = new WeakMap<ActiveLayers, LayerOrderCache>();

export function updateActiveLayerOrder(
  layers: ActiveLayers,
  side: "left" | "right",
  progress: number
) {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const movingInFront = normalizedProgress < LAYER_ORDER_SWITCH_PROGRESS;

  const cached = layerOrderCacheByLayers.get(layers);
  if (cached?.side === side && cached?.movingInFront === movingInFront) {
    return;
  }
  layerOrderCacheByLayers.set(layers, { side, movingInFront });

  const sideZIndexes = zIndexBySide[side];
  layers.frontWrapper.style.setProperty(
    "z-index",
    movingInFront
      ? sideZIndexes.frontWhenMovingInFront
      : sideZIndexes.frontWhenMovingBehind
  );
  layers.foldWrapper.style.setProperty("z-index", Z_INDEX_FOLD_WRAPPER);
  layers.backShadow.style.setProperty(
    "z-index",
    movingInFront
      ? sideZIndexes.backWhenMovingInFront
      : sideZIndexes.backWhenMovingBehind
  );
}

function setStyles(el: HTMLDivElement, styles: Record<string, string>) {
  for (const [prop, val] of Object.entries(styles)) {
    el.style.setProperty(prop, val);
  }
}

function pxSize(width: number, height: number) {
  return { width: `${width}px`, height: `${height}px` };
}

function pxPosition(left: number, top = 0) {
  return { left: `${left}px`, top: `${top}px` };
}

export function positionActiveLayers(
  state: FlipTurnState,
  layers: ActiveLayers,
  side: "left" | "right",
  pageWidth: number,
  pageHeight: number
) {
  const leftOffset =
    side === "right" && isDoubleDisplayMode(state) ? pageWidth : 0;
  const diagonalSize = diagonalLength(pageWidth, pageHeight);

  setStyles(layers.frontWrapper, {
    ...pxPosition(leftOffset),
    ...pxSize(pageWidth, pageHeight),
  });

  setStyles(layers.frontPage, pxSize(pageWidth, pageHeight));
  setStyles(layers.frontRotator, pxSize(diagonalSize, diagonalSize));
  setStyles(layers.foldWrapper, {
    ...pxSize(diagonalSize, diagonalSize),
    ...pxPosition(leftOffset),
  });
  setStyles(layers.foldRotator, pxSize(pageWidth, pageHeight));
  setStyles(layers.foldPage, pxSize(pageHeight, pageWidth));
  setStyles(layers.foldContent, pxSize(pageWidth, pageHeight));
  setStyles(layers.frontShadow, pxSize(pageHeight, pageWidth));
  setStyles(layers.backShadow, {
    ...pxSize(pageWidth, pageHeight),
    ...pxPosition(leftOffset),
  });
}

type LayerVisibilityCache = {
  frontAndFoldVisible: boolean;
  backShadowVisible: boolean;
};

const layerVisibilityCacheByLayers = new WeakMap<
  ActiveLayers,
  LayerVisibilityCache
>();

export function setActiveLayerVisibility(
  layers: ActiveLayers,
  frontAndFoldVisible: boolean,
  backShadowVisible: boolean
) {
  const cached = layerVisibilityCacheByLayers.get(layers);
  if (
    cached?.frontAndFoldVisible === frontAndFoldVisible &&
    cached?.backShadowVisible === backShadowVisible
  ) {
    return;
  }
  layerVisibilityCacheByLayers.set(layers, {
    frontAndFoldVisible,
    backShadowVisible,
  });

  layers.frontWrapper.style.setProperty("display", "block");
  layers.foldWrapper.style.setProperty("display", "block");
  layers.backShadow.style.setProperty("display", "block");

  layers.frontWrapper.style.setProperty(
    "visibility",
    frontAndFoldVisible ? "visible" : "hidden"
  );
  layers.foldWrapper.style.setProperty(
    "visibility",
    frontAndFoldVisible ? "visible" : "hidden"
  );
  layers.backShadow.style.setProperty(
    "visibility",
    backShadowVisible ? "visible" : "hidden"
  );

  layers.frontWrapper.style.setProperty(
    "opacity",
    frontAndFoldVisible ? "1" : "0"
  );
  layers.foldWrapper.style.setProperty(
    "opacity",
    frontAndFoldVisible ? "1" : "0"
  );
  layers.backShadow.style.setProperty("opacity", backShadowVisible ? "1" : "0");
}

export function hideActiveLayers(layers: ActiveLayers) {
  setActiveLayerVisibility(layers, false, false);

  setTransform(layers.frontPage, "", "0% 100%");
  setTransform(layers.frontRotator, "", "0% 100%");
  setTransform(layers.foldWrapper, "", "0% 100%");
  setTransform(layers.foldRotator, "", "0% 100%");
  setTransform(layers.foldPage, "", "0% 0%");
  setTransform(layers.foldContent, "", "0% 0%");

  layers.frontShadow.style.backgroundImage = "none";
  layers.backShadow.style.backgroundImage = "none";
}
