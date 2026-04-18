import type { FlipTurnState } from "../core/types";
import { computeFoldGeometry } from "../layout/fold";
import {
  isSingleDisplayMode,
  spreadPageIndicesAt,
  virtualPageWindowRange,
} from "../layout/spread";
import { buildTurnRenderPlan } from "../layout/turn-plan";
import type { FlipTurnRuntime, RenderPrimitives } from "../runtime/runtime";
import {
  resolvedBackPageSource,
  shouldRenderBackGradient,
} from "../turn/options";
import { applyFoldTransform, constrainFoldPointX } from "./fold-transform";
import {
  hideActiveLayers,
  positionActiveLayers,
  setActiveLayerVisibility,
  updateActiveLayerOrder,
} from "./layers";
import type { DomRenderState } from "./page-lifecycle";
import {
  setPageFace,
  setPageFaceSource,
  updateVirtualPageWindow,
} from "./page-lifecycle";

const RESTORE_STATIC_HANDOFF_PROGRESS = 0.015;

function createRenderPrimitives(runtime: FlipTurnRuntime): RenderPrimitives {
  const activeTurn = runtime.state.activeTurn;

  if (!activeTurn) {
    return {
      foldGeometry: null,
      shouldShowBackShadow: false,
    };
  }

  return {
    foldGeometry: computeFoldGeometry(
      activeTurn.corner,
      {
        x: constrainFoldPointX(
          activeTurn.corner,
          activeTurn.point.x,
          activeTurn.pageWidth
        ),
        y: activeTurn.point.y,
      },
      activeTurn.pageWidth,
      activeTurn.pageHeight
    ),
    shouldShowBackShadow: shouldRenderBackGradient(
      runtime.state,
      activeTurn.direction
    ),
  };
}

function renderStatic(state: FlipTurnState, domState: DomRenderState) {
  const { dom, activeLayers } = domState;
  dom.viewport.classList.remove("flip-turn-flipping");

  if (isSingleDisplayMode(state)) {
    setPageFace(state, domState, dom.staticSinglePage, state.currentPageIndex);
  } else {
    const spread = spreadPageIndicesAt(state, state.currentSpreadIndex);
    setPageFace(state, domState, dom.staticLeftPage, spread.left);
    setPageFace(state, domState, dom.staticRightPage, spread.right);
  }

  if (state.displayMode === "single") {
    dom.staticLeftPage.style.backgroundImage = "none";
    dom.staticRightPage.style.backgroundImage = "none";
  } else {
    dom.staticSinglePage.style.backgroundImage = "none";
  }

  hideActiveLayers(activeLayers);
}

function renderTurning(
  state: FlipTurnState,
  domState: DomRenderState,
  primitives: RenderPrimitives
) {
  if (
    !state.activeTurn ||
    (state.activeTurn.phase === "restoring" &&
      state.activeTurn.progress <= RESTORE_STATIC_HANDOFF_PROGRESS)
  ) {
    renderStatic(state, domState);
    return;
  }

  const { dom, activeLayers } = domState;
  dom.viewport.classList.add("flip-turn-flipping");

  const turnPlan = buildTurnRenderPlan(state, state.activeTurn.direction);

  if (turnPlan.baseSinglePage !== null) {
    setPageFace(state, domState, dom.staticSinglePage, turnPlan.baseSinglePage);
  }

  if (turnPlan.baseLeftPage !== null || turnPlan.baseRightPage !== null) {
    setPageFace(state, domState, dom.staticLeftPage, turnPlan.baseLeftPage);
    setPageFace(state, domState, dom.staticRightPage, turnPlan.baseRightPage);
  }

  setPageFace(state, domState, activeLayers.frontPage, turnPlan.frontPage, {
    allowLiveMove: true,
    allowReuse: true,
  });
  setPageFaceSource(
    state,
    domState,
    activeLayers.foldContent,
    resolvedBackPageSource(state, state.activeTurn.direction),
    state.currentPageIndex + 1,
    { allowLiveMove: true }
  );
  state.activeTurn.side = turnPlan.side;

  positionActiveLayers(
    state,
    activeLayers,
    state.activeTurn.side,
    state.activeTurn.pageWidth,
    state.activeTurn.pageHeight
  );

  setActiveLayerVisibility(activeLayers, true, primitives.shouldShowBackShadow);
  updateActiveLayerOrder(
    activeLayers,
    state.activeTurn.side,
    state.activeTurn.progress
  );

  if (primitives.foldGeometry) {
    applyFoldTransform(
      state,
      activeLayers,
      state.activeTurn,
      primitives.foldGeometry
    );
  }
}

export function renderDom(
  state: FlipTurnState,
  domState: DomRenderState,
  primitives: RenderPrimitives
) {
  const { dom } = domState;
  const isSingleMode = state.displayMode === "single";
  const virtualWindow = virtualPageWindowRange(state);
  const cache = domState.renderCache;
  const shouldSyncModeClasses =
    !cache || cache.displayMode !== state.displayMode;
  const shouldSyncVirtualWindow =
    !cache ||
    cache.virtualWindowStart !== virtualWindow.start ||
    cache.virtualWindowEnd !== virtualWindow.end ||
    domState.needsVirtualWindowSync;

  if (shouldSyncModeClasses) {
    dom.viewport.classList.toggle("flip-turn-single", isSingleMode);
    dom.viewport.classList.toggle("flip-turn-double", !isSingleMode);
  }

  if (shouldSyncVirtualWindow) {
    updateVirtualPageWindow(state, domState);
  }

  domState.renderCache = {
    displayMode: state.displayMode,
    virtualWindowStart: virtualWindow.start,
    virtualWindowEnd: virtualWindow.end,
  };

  renderTurning(state, domState, primitives);
}

export function render(runtime: FlipTurnRuntime) {
  const primitives = createRenderPrimitives(runtime);
  runtime.renderer.render(runtime, primitives);
}
