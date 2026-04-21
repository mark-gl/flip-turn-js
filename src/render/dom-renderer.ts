import type { ResolvedFlipTurnOptions } from "../types/options";
import type { FlipTurnRenderer } from "../types/renderer";
import { bootstrapDomBindings } from "../dom/dom";
import type { DomRenderState } from "./page-lifecycle";
import {
  clearPageFace,
  createDomState,
  destroyVirtualPageWindow,
  parkPageSourceNodes,
} from "./page-lifecycle";
import { renderDom } from "./render";

function clearMountedFaces(domState: DomRenderState) {
  clearPageFace(domState, domState.dom.staticLeftPage);
  clearPageFace(domState, domState.dom.staticRightPage);
  clearPageFace(domState, domState.dom.staticSinglePage);
  clearPageFace(domState, domState.activeLayers.frontPage);
  clearPageFace(domState, domState.activeLayers.foldContent);

  for (const wrapper of domState.mountedPageWrappers.values()) {
    clearPageFace(domState, wrapper);
  }

  domState.mountedPageWrappers.clear();
}

function applyDimensions(
  domState: DomRenderState,
  options: ResolvedFlipTurnOptions
) {
  const { viewport } = domState.dom;

  if (options.width !== null) {
    viewport.style.width = `${options.width}px`;
  } else {
    viewport.style.removeProperty("width");
  }

  if (options.height !== null) {
    viewport.style.height = `${options.height}px`;
  } else {
    viewport.style.removeProperty("height");
  }
}

export function createDomRenderer(): FlipTurnRenderer {
  let domState: DomRenderState | null = null;

  return {
    init: (runtime) => {
      bootstrapDomBindings(runtime.viewport);
      domState = createDomState(runtime.viewport);
    },
    applyOptions: (runtime, options) => {
      if (!domState) return;
      applyDimensions(domState, options);
      parkPageSourceNodes(runtime.state, domState);
      domState.needsVirtualWindowSync = true;
    },
    resize: () => {},
    render: (runtime, primitives) => {
      if (!domState) return;
      renderDom(runtime.state, domState, primitives);
    },
    dispose: () => {
      if (!domState) return;
      clearMountedFaces(domState);
      destroyVirtualPageWindow(domState);
    },
    destroy: (runtime) => {
      if (!domState) return;
      for (const sourceNode of domState.liveNodeParkingSlots.keys()) {
        sourceNode.classList.remove("flip-turn-page-face-node");
        if (sourceNode.parentElement !== runtime.viewport) {
          runtime.viewport.append(sourceNode);
        }
      }
      domState.liveNodeParkingSlots.clear();

      domState.activeLayers.frontWrapper.remove();
      domState.activeLayers.foldWrapper.remove();
      domState.activeLayers.backShadow.remove();
      domState.virtualPageWindowLayer.remove();
      domState.parkedSourceLayer.remove();

      domState.dom.viewport.classList.remove("flip-turn-flipping");
      domState.dom.viewport.style.removeProperty("width");
      domState.dom.viewport.style.removeProperty("height");
      domState.dom.staticLeftPage.style.backgroundImage = "none";
      domState.dom.staticRightPage.style.backgroundImage = "none";
      domState.dom.staticSinglePage.style.backgroundImage = "none";
    },
  };
}
