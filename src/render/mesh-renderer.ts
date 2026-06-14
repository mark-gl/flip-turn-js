import { buildTurnRenderPlan } from "../layout/turn-plan";
import { isDoubleDisplayMode, pageSourceAtIndex } from "../layout/spread";
import {
  activeTurnGradientOptions,
  resolvedBackPageSource,
} from "../turn/options";
import type {
  FlipTurnRenderer,
  FlipTurnRuntime,
  FoldGeometry,
  RenderPrimitives,
  ViewportBox,
} from "../types/renderer";
import type { PageSource } from "../types/state";
import { createDomRenderer } from "./dom-renderer";
import type {
  CylinderParams,
  StripSpace,
  SurfaceSample,
} from "./mesh-geometry";
import {
  clampNumber,
  computeCylinderParams,
  computeStripSpace,
  sampleSurfaceAtDistance,
  shouldDisplaySurface,
  STRIP_COUNT,
  stripBandLength,
} from "./mesh-geometry";

const STRIP_EDGE_BLEED = 1.5;
const RESTORE_STATIC_HANDOFF_PROGRESS = 0.015;
const SURFACE_SHADE_CREASE = 0.4;
const SURFACE_SHADE_CONTRAST = 2.2;
const SHADE_SAMPLES = 12;
const SURFACE_SHEEN = 0.16;
const SURFACE_SHEEN_CENTER = 0.55;
const SURFACE_SHEEN_WIDTH = 0.22;
const UNDER_CURL_SHADOW_OPACITY = 0.5;
const UNDER_CURL_SHADOW_FADE_FACTOR = 1.3;
const UNDER_CURL_SHADOW_MIN_WIDTH = 15;
const SHADOW_NEAR_EDGE_FADE = 60;
const SHEET_FACE_DEPTH_OFFSET = 0.12;
const STRIP_NORMAL_DEPTH_OFFSET_STEP = 0.004;
const FRONT_FACE_VIEW_DEPTH_OFFSET = 0.45;
const BACK_FACE_VIEW_DEPTH_OFFSET = 0.7;
const STRIP_VIEW_DEPTH_OFFSET_STEP = 0.035;
const NEXT_PAGE_DEPTH_OFFSET = -0.35;
const NEXT_SHADOW_DEPTH_OFFSET = -0.18;

type ContentCache = {
  sourceKey: string;
  pageWidth: number;
  pageHeight: number;
  clone: HTMLElement;
};

type MountedStripContent = {
  sourceKey: string;
  pageWidth: number;
  pageHeight: number;
  flipHorizontal: boolean;
  wrapper: HTMLDivElement;
  contentLayer: HTMLElement;
  shadowOverlay: HTMLDivElement | null;
};

type MountedPageContent = {
  sourceKey: string;
  pageWidth: number;
  pageHeight: number;
};

type MeshState = {
  container: HTMLDivElement;
  frontStrips: HTMLDivElement[];
  backStrips: HTMLDivElement[];
  nextPageEl: HTMLDivElement;
  shadowOverlay: HTMLDivElement;
  pageWidth: number;
  pageHeight: number;
  frontCache: ContentCache | null;
  backCache: ContentCache | null;
  nextCache: ContentCache | null;
  nextMounted: MountedPageContent | null;
};

type ShadowStop = {
  distance: number;
  color: string;
};

const mountedStripContentByElement = new WeakMap<
  HTMLDivElement,
  MountedStripContent
>();

function markInternal(element: HTMLElement) {
  element.dataset.flipTurnInternal = "true";
}

function setStyle(element: HTMLElement, styles: Record<string, string>) {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
}

function createMeshContainer(viewport: HTMLDivElement): HTMLDivElement {
  const container = document.createElement("div");
  setStyle(container, {
    position: "absolute",
    inset: "0",
    "pointer-events": "none",
    "z-index": "60",
    overflow: "visible",
    "will-change": "transform",
  });
  markInternal(container);
  viewport.appendChild(container);
  return container;
}

function createStrip(): HTMLDivElement {
  const strip = document.createElement("div");
  setStyle(strip, {
    position: "absolute",
    top: "0",
    overflow: "hidden",
    "backface-visibility": "visible",
    "-webkit-backface-visibility": "visible",
    "will-change": "transform",
  });
  markInternal(strip);
  return strip;
}

function createStrips(
  count: number,
  container: HTMLDivElement
): HTMLDivElement[] {
  const strips: HTMLDivElement[] = [];
  for (let index = 0; index < count; index++) {
    const strip = createStrip();
    container.appendChild(strip);
    strips.push(strip);
  }
  return strips;
}

function cloneSource(
  source: PageSource,
  pageWidth: number,
  pageHeight: number
): HTMLElement {
  const clone = source.value.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.dataset.flipTurnMirrorClone = "true";
  setStyle(clone, {
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    position: "absolute",
    top: "0",
    left: "0",
    "pointer-events": "none",
  });
  return clone;
}

function sourceKey(source: PageSource | null): string {
  if (!source) return "";
  return source.key ?? source.value.outerHTML.slice(0, 100);
}

function ensureContentClone(
  cache: ContentCache | null,
  source: PageSource | null,
  pageWidth: number,
  pageHeight: number
): ContentCache | null {
  if (!source) return null;

  const key = sourceKey(source);
  if (
    cache &&
    cache.sourceKey === key &&
    cache.pageWidth === pageWidth &&
    cache.pageHeight === pageHeight
  ) {
    return cache;
  }

  return {
    sourceKey: key,
    pageWidth,
    pageHeight,
    clone: cloneSource(source, pageWidth, pageHeight),
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(4);
}

type Vec3 = [number, number, number];

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function matrix2d(values: number[]): string {
  return `matrix(${values.map(formatNumber).join(",")})`;
}

function matrix3d(values: number[]): string {
  return `matrix3d(${values.map(formatNumber).join(",")})`;
}

function stopPercent(stripSpace: StripSpace, distance: number): number {
  const distanceRange = stripSpace.maxDistance - stripSpace.minDistance;
  if (distanceRange <= 0) return 0;

  return Math.max(
    0,
    Math.min(100, ((distance - stripSpace.minDistance) * 100) / distanceRange)
  );
}

function surfaceShadeStops(radius: number, nearEdgeFade: number): ShadowStop[] {
  const wrapDistance = Math.PI * radius;
  const stops: ShadowStop[] = [{ distance: -radius, color: "rgba(0,0,0,0)" }];
  for (let sample = 0; sample <= SHADE_SAMPLES; sample += 1) {
    const distance = (wrapDistance * sample) / SHADE_SAMPLES;
    const normalZ = Math.cos(distance / radius);
    const crease = (1 - Math.abs(normalZ)) ** SURFACE_SHADE_CONTRAST;
    const shade = crease * SURFACE_SHADE_CREASE;
    const sheenFalloff = (normalZ - SURFACE_SHEEN_CENTER) / SURFACE_SHEEN_WIDTH;
    const sheen = SURFACE_SHEEN * Math.exp(-(sheenFalloff * sheenFalloff));
    const net = (sheen - shade) * nearEdgeFade;
    const color =
      net >= 0
        ? `rgba(255,255,255,${formatNumber(clampNumber(net, 0, 1))})`
        : `rgba(0,0,0,${formatNumber(clampNumber(-net, 0, 1))})`;
    stops.push({ distance, color });
  }
  return stops;
}

function surfaceShadowGradient(
  stripSpace: StripSpace,
  cylinder: CylinderParams
): string {
  const radius = cylinder.cylRadius;
  const nearEdgeFade = Math.max(
    0,
    Math.min(1, -stripSpace.minDistance / SHADOW_NEAR_EDGE_FADE)
  );
  const angleRadians =
    Math.PI / 2 + Math.atan2(stripSpace.normalY, stripSpace.normalX);
  const stops = surfaceShadeStops(radius, nearEdgeFade);
  const colorStops = stops
    .map(
      (stop) =>
        `${stop.color} ${formatNumber(stopPercent(stripSpace, stop.distance))}%`
    )
    .join(",");

  return `linear-gradient(${formatNumber(angleRadians)}rad,${colorStops})`;
}

function pageToStripMatrix(
  cylinder: CylinderParams,
  stripSpace: StripSpace,
  distanceStart: number
): string {
  const xOffset =
    -(
      cylinder.cylPosX * stripSpace.normalX +
      cylinder.cylPosY * stripSpace.normalY
    ) - distanceStart;
  const yOffset =
    -(
      cylinder.cylPosX * stripSpace.axisX +
      cylinder.cylPosY * stripSpace.axisY
    ) - stripSpace.axisStart;

  return matrix2d([
    stripSpace.normalX,
    stripSpace.axisX,
    stripSpace.normalY,
    stripSpace.axisY,
    xOffset,
    yOffset,
  ]);
}

function stripSurfaceMatrix(
  cylinder: CylinderParams,
  stripSpace: StripSpace,
  sample: SurfaceSample,
  stripWidth: number,
  leftOffset: number,
  surfaceNormalOffset: number,
  viewDepthOffset: number
): string {
  const center: Vec3 = [
    leftOffset +
      cylinder.cylPosX +
      stripSpace.axisX * stripSpace.axisStart +
      stripSpace.normalX * sample.offset,
    cylinder.cylPosY +
      stripSpace.axisY * stripSpace.axisStart +
      stripSpace.normalY * sample.offset,
    sample.depth,
  ];
  const basisX: Vec3 = [
    stripSpace.normalX * sample.tangentScale,
    stripSpace.normalY * sample.tangentScale,
    sample.tangentDepthScale,
  ];
  const basisY: Vec3 = [stripSpace.axisX, stripSpace.axisY, 0];
  const basisZ = cross(basisX, basisY);
  const halfWidth = stripWidth * 0.5;
  const translate: Vec3 = [
    center[0] - basisX[0] * halfWidth + basisZ[0] * surfaceNormalOffset,
    center[1] - basisX[1] * halfWidth + basisZ[1] * surfaceNormalOffset,
    center[2] -
      basisX[2] * halfWidth +
      basisZ[2] * surfaceNormalOffset +
      viewDepthOffset,
  ];

  return matrix3d([...basisX, 0, ...basisY, 0, ...basisZ, 0, ...translate, 1]);
}

function flatBandMatrix(
  cylinder: CylinderParams,
  stripSpace: StripSpace,
  distanceStart: number
): string {
  const basisX: Vec3 = [stripSpace.normalX, stripSpace.normalY, 0];
  const basisY: Vec3 = [stripSpace.axisX, stripSpace.axisY, 0];
  const basisZ = cross(basisX, basisY);
  const translateX =
    cylinder.cylPosX +
    stripSpace.normalX * distanceStart +
    stripSpace.axisX * stripSpace.axisStart;
  const translateY =
    cylinder.cylPosY +
    stripSpace.normalY * distanceStart +
    stripSpace.axisY * stripSpace.axisStart;

  return matrix3d([
    ...basisX,
    0,
    ...basisY,
    0,
    ...basisZ,
    0,
    translateX,
    translateY,
    0,
    1,
  ]);
}

function createShadowOverlay(
  pageWidth: number,
  pageHeight: number,
  shadowBackground: string
): HTMLDivElement {
  const shadowOverlay = document.createElement("div");
  setStyle(shadowOverlay, {
    position: "absolute",
    inset: "0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    "pointer-events": "none",
    background: shadowBackground,
  });
  markInternal(shadowOverlay);
  return shadowOverlay;
}

function syncStripShadow(
  mountedContent: MountedStripContent,
  pageWidth: number,
  pageHeight: number,
  shadowBackground: string | null
) {
  if (!shadowBackground) {
    mountedContent.shadowOverlay?.remove();
    mountedContent.shadowOverlay = null;
    return;
  }

  if (!mountedContent.shadowOverlay) {
    mountedContent.shadowOverlay = createShadowOverlay(
      pageWidth,
      pageHeight,
      shadowBackground
    );
    mountedContent.wrapper.appendChild(mountedContent.shadowOverlay);
    return;
  }

  mountedContent.shadowOverlay.style.background = shadowBackground;
}

function syncStripContent(
  strip: HTMLDivElement,
  sourceCache: ContentCache,
  pageWidth: number,
  pageHeight: number,
  transform: string,
  flipHorizontal: boolean,
  shadowBackground: string | null
) {
  const mountedContent = mountedStripContentByElement.get(strip);
  if (
    mountedContent &&
    mountedContent.sourceKey === sourceCache.sourceKey &&
    mountedContent.pageWidth === pageWidth &&
    mountedContent.pageHeight === pageHeight &&
    mountedContent.flipHorizontal === flipHorizontal
  ) {
    mountedContent.wrapper.style.transform = transform;
    syncStripShadow(mountedContent, pageWidth, pageHeight, shadowBackground);
    return;
  }

  strip.innerHTML = "";
  const wrapper = document.createElement("div");
  setStyle(wrapper, {
    position: "absolute",
    top: "0",
    left: "0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    "pointer-events": "none",
    "transform-origin": "0 0",
    transform,
  });

  const clone = sourceCache.clone.cloneNode(true) as HTMLElement;
  let contentLayer: HTMLElement = clone;
  if (flipHorizontal) {
    const flippedWrapper = document.createElement("div");
    setStyle(flippedWrapper, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${pageWidth}px`,
      height: `${pageHeight}px`,
      "pointer-events": "none",
      "transform-origin": "0 0",
      transform: `translate3d(${pageWidth}px,0,0) scaleX(-1)`,
    });
    flippedWrapper.appendChild(clone);
    wrapper.appendChild(flippedWrapper);
    contentLayer = flippedWrapper;
  } else {
    wrapper.appendChild(clone);
  }

  strip.appendChild(wrapper);
  const nextMountedContent: MountedStripContent = {
    sourceKey: sourceCache.sourceKey,
    pageWidth,
    pageHeight,
    flipHorizontal,
    wrapper,
    contentLayer,
    shadowOverlay: null,
  };
  mountedStripContentByElement.set(strip, nextMountedContent);
  syncStripShadow(nextMountedContent, pageWidth, pageHeight, shadowBackground);
}

function clearStripContent(strip: HTMLDivElement) {
  strip.innerHTML = "";
  mountedStripContentByElement.delete(strip);
}

function syncNextPageContent(
  meshState: MeshState,
  pageWidth: number,
  pageHeight: number,
  nextCache: ContentCache
) {
  const { nextMounted, nextPageEl } = meshState;
  if (
    nextMounted &&
    nextMounted.sourceKey === nextCache.sourceKey &&
    nextMounted.pageWidth === pageWidth &&
    nextMounted.pageHeight === pageHeight
  ) {
    return;
  }

  nextPageEl.innerHTML = "";
  const wrapper = document.createElement("div");
  setStyle(wrapper, {
    position: "absolute",
    top: "0",
    left: "0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
  });
  wrapper.appendChild(nextCache.clone.cloneNode(true));
  nextPageEl.appendChild(wrapper);
  meshState.nextMounted = {
    sourceKey: nextCache.sourceKey,
    pageWidth,
    pageHeight,
  };
}

function initMeshState(viewport: HTMLDivElement): MeshState {
  const container = createMeshContainer(viewport);

  const nextPageEl = document.createElement("div");
  setStyle(nextPageEl, {
    position: "absolute",
    top: "0",
    overflow: "hidden",
    "z-index": "0",
    "transform-origin": "0 0",
  });
  markInternal(nextPageEl);
  container.appendChild(nextPageEl);

  const shadowOverlay = document.createElement("div");
  setStyle(shadowOverlay, {
    position: "absolute",
    top: "0",
    "pointer-events": "none",
    "z-index": "1",
    "transform-origin": "0 0",
  });
  markInternal(shadowOverlay);
  container.appendChild(shadowOverlay);

  const frontStrips = createStrips(STRIP_COUNT, container);
  const backStrips = createStrips(STRIP_COUNT, container);

  return {
    container,
    frontStrips,
    backStrips,
    nextPageEl,
    shadowOverlay,
    pageWidth: 0,
    pageHeight: 0,
    frontCache: null,
    backCache: null,
    nextCache: null,
    nextMounted: null,
  };
}

function positionStrips(
  strips: HTMLDivElement[],
  sourceCache: ContentCache | null,
  pageWidth: number,
  pageHeight: number,
  leftOffset: number,
  cylinder: CylinderParams,
  isBackFace: boolean,
  shadowsEnabled: boolean,
  flipHorizontal: boolean
) {
  const stripSpace = computeStripSpace(pageWidth, pageHeight, cylinder);
  const shadowBackground = shadowsEnabled
    ? surfaceShadowGradient(stripSpace, cylinder)
    : null;

  for (let index = 0; index < strips.length; index++) {
    const strip = strips[index]!;

    if (!sourceCache) {
      strip.style.display = "none";
      clearStripContent(strip);
      continue;
    }

    const stripBand = stripSpace.stripBands[index]!;
    const stripWidth = stripBandLength(stripBand);
    const stripBleed = Math.min(STRIP_EDGE_BLEED, stripWidth * 0.25);
    const rawDistanceStart = stripBand.distanceStart - stripBleed;
    const rawDistanceEnd = rawDistanceStart + stripWidth + stripBleed * 2;
    const visibleDistanceStart = rawDistanceStart;
    const visibleStripWidth = rawDistanceEnd - visibleDistanceStart;
    if (visibleStripWidth <= 0.001) {
      strip.style.display = "none";
      continue;
    }
    const distanceCenter = visibleDistanceStart + visibleStripWidth * 0.5;
    const sample = sampleSurfaceAtDistance(distanceCenter, cylinder);

    if (!shouldDisplaySurface(sample, distanceCenter, cylinder, isBackFace)) {
      strip.style.display = "none";
      continue;
    }

    const visibleSurfaceNormal = isBackFace ? -1 : 1;
    const surfaceNormalOffset =
      visibleSurfaceNormal *
      (SHEET_FACE_DEPTH_OFFSET + index * STRIP_NORMAL_DEPTH_OFFSET_STEP);
    const viewDepthOffset =
      (isBackFace
        ? BACK_FACE_VIEW_DEPTH_OFFSET
        : FRONT_FACE_VIEW_DEPTH_OFFSET) +
      index * STRIP_VIEW_DEPTH_OFFSET_STEP;

    setStyle(strip, {
      display: "block",
      width: `${visibleStripWidth}px`,
      height: `${stripSpace.axisLength}px`,
      "transform-origin": "0 0",
      transform: stripSurfaceMatrix(
        cylinder,
        stripSpace,
        sample,
        visibleStripWidth,
        leftOffset,
        surfaceNormalOffset,
        viewDepthOffset
      ),
      "z-index": isBackFace ? "3" : "2",
      filter: "",
    });
    syncStripContent(
      strip,
      sourceCache,
      pageWidth,
      pageHeight,
      pageToStripMatrix(cylinder, stripSpace, visibleDistanceStart),
      flipHorizontal,
      shadowBackground
    );
    const mounted = mountedStripContentByElement.get(strip);
    if (mounted) {
      mounted.wrapper.style.background = isBackFace
        ? "var(--flip-turn-page-background)"
        : "none";
      mounted.contentLayer.style.opacity = isBackFace
        ? "var(--flip-turn-back-face-opacity)"
        : "1";
    }
  }
}

function renderNextPage(
  meshState: MeshState,
  leftOffset: number,
  pageWidth: number,
  pageHeight: number,
  nextCache: ContentCache | null,
  cylinder: CylinderParams
) {
  const { nextPageEl, shadowOverlay } = meshState;

  if (!nextCache) {
    nextPageEl.style.display = "none";
    nextPageEl.innerHTML = "";
    meshState.nextMounted = null;
    shadowOverlay.style.display = "none";
    shadowOverlay.innerHTML = "";
    return;
  }

  setStyle(nextPageEl, {
    display: "block",
    left: `${leftOffset}px`,
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    transform: `translateZ(${NEXT_PAGE_DEPTH_OFFSET}px)`,
  });
  syncNextPageContent(meshState, pageWidth, pageHeight, nextCache);

  const stripSpace = computeStripSpace(pageWidth, pageHeight, cylinder);
  const shadowFadeEnd = Math.max(
    UNDER_CURL_SHADOW_MIN_WIDTH,
    cylinder.cylRadius * UNDER_CURL_SHADOW_FADE_FACTOR
  );
  const shadowEndDistance = Math.max(
    1,
    Math.min(stripSpace.maxDistance, shadowFadeEnd)
  );
  setStyle(shadowOverlay, {
    display: "block",
    left: `${leftOffset}px`,
    top: "0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    overflow: "hidden",
    background: "none",
    transform: `translateZ(${NEXT_SHADOW_DEPTH_OFFSET}px)`,
  });
  shadowOverlay.innerHTML = "";

  const nearEdgeFade = Math.max(
    0,
    Math.min(1, -stripSpace.minDistance / SHADOW_NEAR_EDGE_FADE)
  );
  if (nearEdgeFade > 0) {
    const peakAlpha = UNDER_CURL_SHADOW_OPACITY * nearEdgeFade;
    const shadowMid = shadowEndDistance * 0.4;
    const shadowBand = document.createElement("div");
    setStyle(shadowBand, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${formatNumber(shadowEndDistance)}px`,
      height: `${stripSpace.axisLength}px`,
      "pointer-events": "none",
      "transform-origin": "0 0",
      transform: flatBandMatrix(cylinder, stripSpace, 0),
      background:
        `linear-gradient(to right,` +
        `rgba(0,0,0,${formatNumber(peakAlpha)}) 0px,` +
        `rgba(0,0,0,${formatNumber(peakAlpha * 0.45)}) ${formatNumber(shadowMid)}px,` +
        `rgba(0,0,0,0) ${formatNumber(shadowEndDistance)}px)`,
    });
    markInternal(shadowBand);
    shadowOverlay.appendChild(shadowBand);
  }
}

function hideMesh(meshState: MeshState) {
  meshState.container.style.display = "none";
}

function showMesh(meshState: MeshState) {
  meshState.container.style.display = "block";
}

function shouldUseCSSMesh(runtime: FlipTurnRuntime): boolean {
  const activeTurn = runtime.state.activeTurn;
  if (!activeTurn) return false;
  if (runtime.state.activeTurnResolvedOptions?.hard === true) return false;
  if (
    activeTurn.phase === "restoring" &&
    activeTurn.progress <= RESTORE_STATIC_HANDOFF_PROGRESS
  ) {
    return false;
  }
  return true;
}

function resolveMeshCylinder(
  runtime: FlipTurnRuntime,
  geometry: FoldGeometry
): CylinderParams | null {
  const activeTurn = runtime.state.activeTurn;
  if (!activeTurn) return null;
  return computeCylinderParams(geometry, activeTurn);
}

function renderMeshCurl(
  runtime: FlipTurnRuntime,
  meshState: MeshState,
  cylinder: CylinderParams
) {
  const state = runtime.state;
  const activeTurn = state.activeTurn!;
  const direction = activeTurn.direction;
  const plan = buildTurnRenderPlan(state, direction);

  const pageWidth = activeTurn.pageWidth;
  const pageHeight = activeTurn.pageHeight;
  const pageOffsetX =
    activeTurn.side === "right" && isDoubleDisplayMode(state) ? pageWidth : 0;

  meshState.pageWidth = pageWidth;
  meshState.pageHeight = pageHeight;

  const frontSource = pageSourceAtIndex(state, plan.frontPage);
  const backSource = resolvedBackPageSource(state, direction);
  const gradientOptions = activeTurnGradientOptions(state);
  const backFaceReadsForward = isDoubleDisplayMode(state);
  const nextPageIndex =
    plan.baseSinglePage ??
    (activeTurn.side === "right" ? plan.baseRightPage : plan.baseLeftPage);
  const nextSource = pageSourceAtIndex(state, nextPageIndex);

  // Cache clones to avoid re-cloning every frame
  meshState.frontCache = ensureContentClone(
    meshState.frontCache,
    frontSource,
    pageWidth,
    pageHeight
  );
  meshState.backCache = ensureContentClone(
    meshState.backCache,
    backSource,
    pageWidth,
    pageHeight
  );
  meshState.nextCache = ensureContentClone(
    meshState.nextCache,
    nextSource,
    pageWidth,
    pageHeight
  );

  positionStrips(
    meshState.frontStrips,
    meshState.frontCache,
    pageWidth,
    pageHeight,
    pageOffsetX,
    cylinder,
    false,
    gradientOptions.front,
    false
  );

  positionStrips(
    meshState.backStrips,
    meshState.backCache,
    pageWidth,
    pageHeight,
    pageOffsetX,
    cylinder,
    true,
    gradientOptions.back,
    backFaceReadsForward
  );

  renderNextPage(
    meshState,
    pageOffsetX,
    pageWidth,
    pageHeight,
    meshState.nextCache,
    cylinder
  );
}

export function createMeshRenderer(): FlipTurnRenderer {
  let meshState: MeshState | null = null;
  const domRenderer = createDomRenderer();

  return {
    init(runtime: FlipTurnRuntime) {
      domRenderer.init!(runtime);
      meshState = initMeshState(runtime.viewport);
      hideMesh(meshState);
    },

    applyOptions(runtime: FlipTurnRuntime, options) {
      domRenderer.applyOptions!(runtime, options);
      if (meshState) {
        meshState.frontCache = null;
        meshState.backCache = null;
        meshState.nextCache = null;
        meshState.nextMounted = null;
      }
    },

    resize(runtime: FlipTurnRuntime, box: ViewportBox) {
      domRenderer.resize!(runtime, box);
    },

    render(runtime: FlipTurnRuntime, primitives: RenderPrimitives) {
      const meshCylinder =
        shouldUseCSSMesh(runtime) && !!primitives.foldGeometry
          ? resolveMeshCylinder(runtime, primitives.foldGeometry)
          : null;
      const willShowMesh = meshCylinder !== null;

      domRenderer.render(
        runtime,
        willShowMesh
          ? { ...primitives, suppressActiveLayers: true }
          : primitives
      );

      if (!meshState) return;

      if (!willShowMesh) {
        hideMesh(meshState);
        return;
      }

      showMesh(meshState);
      renderMeshCurl(runtime, meshState, meshCylinder);
    },

    dispose(runtime: FlipTurnRuntime) {
      domRenderer.dispose!(runtime);
      if (meshState) {
        meshState.frontCache = null;
        meshState.backCache = null;
        meshState.nextCache = null;
        meshState.nextMounted = null;
      }
    },

    destroy(runtime: FlipTurnRuntime) {
      domRenderer.destroy!(runtime);
      if (meshState) {
        meshState.container.remove();
        meshState = null;
      }
    },
  };
}
