import { pageListFromOptions } from "../core/options";
import type { ResolvedFlipTurnOptions } from "../types/options";
import type { FlipTurnState, PageSource } from "../types/state";
import type { FlipTurnDom } from "../dom/dom";
import { resolveDomBindings } from "../dom/dom";
import {
  isSingleDisplayMode,
  pageIndexFromPublicPageNumber,
  pageSourceAtIndex,
  virtualPageWindowRange,
} from "../layout/spread";
import type { ActiveLayers } from "./layers";
import { createLayerDiv, setupActiveLayers } from "./layers";

type DomPageResource =
  | { kind: "host-node"; node: HTMLElement }
  | { kind: "mirror-clone"; node: HTMLElement }
  | { kind: "empty" };

type MountedFaceRef = {
  resource: DomPageResource;
  pageKey: string;
  pageNumber: number;
};

type RenderDomCache = {
  displayMode: FlipTurnState["displayMode"];
  virtualWindowStart: number;
  virtualWindowEnd: number;
};

export type DomRenderState = {
  dom: FlipTurnDom;
  activeLayers: ActiveLayers;
  parkedSourceLayer: HTMLDivElement;
  liveNodeParkingSlots: Map<HTMLElement, HTMLDivElement>;
  mountedFaceResources: WeakMap<HTMLDivElement, MountedFaceRef>;
  virtualPageWindowLayer: HTMLDivElement;
  mountedPageWrappers: Map<number, HTMLDivElement>;
  needsVirtualWindowSync: boolean;
  renderCache: RenderDomCache | null;
};

export function createDomState(viewport: HTMLDivElement): DomRenderState {
  const dom = resolveDomBindings(viewport);
  const activeLayers = setupActiveLayers(dom);

  const parkedSourceLayer = createLayerDiv("flip-turn-source-parking-layer");
  viewport.append(parkedSourceLayer);

  const virtualPageWindowLayer = createLayerDiv("flip-turn-window-layer");
  viewport.append(virtualPageWindowLayer);

  return {
    dom,
    activeLayers,
    parkedSourceLayer,
    liveNodeParkingSlots: new Map(),
    mountedFaceResources: new WeakMap(),
    virtualPageWindowLayer,
    mountedPageWrappers: new Map(),
    needsVirtualWindowSync: true,
    renderCache: null,
  };
}

const LIVE_RESOURCE_KEY_PREFIX = "live:";

function toHostNode(source: PageSource): HTMLElement | null {
  return source.value instanceof HTMLElement ? source.value : null;
}

function parkSourceNodeIfNeeded(
  domState: DomRenderState,
  sourceNode: HTMLElement
) {
  const { liveNodeParkingSlots, parkedSourceLayer } = domState;
  const existingSlot = liveNodeParkingSlots.get(sourceNode);
  if (existingSlot) {
    if (sourceNode.parentElement !== existingSlot) {
      existingSlot.append(sourceNode);
    }
    return;
  }

  const slot = createLayerDiv("flip-turn-source-parking-slot");
  parkedSourceLayer.append(slot);
  liveNodeParkingSlots.set(sourceNode, slot);
  slot.append(sourceNode);
}

function clearFaceContent(domState: DomRenderState, face: HTMLDivElement) {
  const { liveNodeParkingSlots, mountedFaceResources } = domState;
  const mountedRef = mountedFaceResources.get(face);
  if (mountedRef) {
    unmountResource(mountedRef.resource, face, domState);
    disposeResource(mountedRef.resource);
    mountedFaceResources.delete(face);
  }

  for (const existingNode of Array.from(face.children)) {
    if (!(existingNode instanceof HTMLElement)) {
      continue;
    }

    if (existingNode.dataset.flipTurnMirrorClone === "true") {
      existingNode.remove();
      continue;
    }

    const slot = liveNodeParkingSlots.get(existingNode);
    if (slot) {
      slot.append(existingNode);
      continue;
    }

    existingNode.remove();
  }
}

function createResource(pageKey: string, source: PageSource): DomPageResource {
  const sourceNode = toHostNode(source);
  if (!sourceNode) {
    return { kind: "empty" };
  }

  if (pageKey.startsWith(LIVE_RESOURCE_KEY_PREFIX)) {
    const mirrorClone = sourceNode.cloneNode(true);
    if (mirrorClone instanceof HTMLElement) {
      mirrorClone.removeAttribute("id");
      mirrorClone.classList.add("flip-turn-page-face-node");
      mirrorClone.dataset.flipTurnMirrorClone = "true";
      return { kind: "mirror-clone", node: mirrorClone };
    }
  }

  return { kind: "host-node", node: sourceNode };
}

function mountResource(
  resource: DomPageResource,
  face: HTMLDivElement,
  domState: DomRenderState
) {
  if (resource.kind === "host-node") {
    parkSourceNodeIfNeeded(domState, resource.node);
    resource.node.classList.add("flip-turn-page-face-node");
    face.append(resource.node);
  } else if (resource.kind === "mirror-clone") {
    face.append(resource.node);
  }
}

function unmountResource(
  resource: DomPageResource,
  face: HTMLDivElement,
  domState: DomRenderState
) {
  if (resource.kind === "host-node") {
    if (face.contains(resource.node)) {
      parkSourceNodeIfNeeded(domState, resource.node);
    }
  } else if (resource.kind === "mirror-clone") {
    if (face.contains(resource.node)) {
      resource.node.remove();
    }
  }
}

function disposeResource(resource: DomPageResource) {
  if (resource.kind === "mirror-clone") {
    resource.node.remove();
  }
}

function hasReusableMountedFace(
  domState: DomRenderState,
  face: HTMLDivElement,
  pageKey: string,
  pageNumber: number
): boolean {
  const mountedRef = domState.mountedFaceResources.get(face);
  if (!mountedRef) {
    return false;
  }

  const isResourceAttached =
    mountedRef.resource.kind === "empty"
      ? face.children.length === 0
      : face.contains(mountedRef.resource.node);

  if (!isResourceAttached) {
    return false;
  }

  return mountedRef.pageKey === pageKey && mountedRef.pageNumber === pageNumber;
}

function mountFace(
  domState: DomRenderState,
  face: HTMLDivElement,
  source: PageSource,
  pageKey: string,
  pageNumber: number,
  allowReuse = false
) {
  if (
    allowReuse &&
    hasReusableMountedFace(domState, face, pageKey, pageNumber)
  ) {
    return;
  }

  clearFaceContent(domState, face);
  const resource = createResource(pageKey, source);
  mountResource(resource, face, domState);
  domState.mountedFaceResources.set(face, { resource, pageKey, pageNumber });
}

type SetPageFaceSourceOptions = {
  allowLiveMove?: boolean;
  allowReuse?: boolean;
};

export function setPageFaceSource(
  state: FlipTurnState,
  domState: DomRenderState,
  element: HTMLDivElement,
  source: PageSource | null,
  pageNumber = 1,
  options: SetPageFaceSourceOptions = {}
) {
  if (source === null) {
    clearFaceContent(domState, element);
    return;
  }

  const stableSourceKey = source.key ?? `page:${pageNumber}`;
  const resourcePageKey = options.allowLiveMove
    ? `${LIVE_RESOURCE_KEY_PREFIX}${stableSourceKey}`
    : stableSourceKey;

  mountFace(
    domState,
    element,
    source,
    resourcePageKey,
    pageNumber,
    options.allowReuse ?? true
  );
}

export function clearPageFace(
  domState: DomRenderState,
  element: HTMLDivElement
) {
  clearFaceContent(domState, element);
}

export function setPageFace(
  state: FlipTurnState,
  domState: DomRenderState,
  element: HTMLDivElement,
  pageIndex: number | null,
  options: SetPageFaceSourceOptions = {}
) {
  const source = pageSourceAtIndex(state, pageIndex);
  setPageFaceSource(
    state,
    domState,
    element,
    source,
    (pageIndex ?? 0) + 1,
    options
  );
}

function setWrapperGeometry(
  state: FlipTurnState,
  wrapper: HTMLDivElement,
  pageNumber: number
) {
  const pageIndex = pageIndexFromPublicPageNumber(pageNumber);
  const isSingleMode = isSingleDisplayMode(state);
  const isRightPage = pageNumber % 2 === 1;
  const side: "left" | "right" = isRightPage ? "right" : "left";

  wrapper.style.setProperty("display", "block");
  wrapper.style.setProperty("width", isSingleMode ? "100%" : "50%");
  wrapper.style.setProperty("height", "100%");
  wrapper.style.setProperty(
    "left",
    isSingleMode ? "0px" : side === "right" ? "50%" : "0px"
  );
  wrapper.style.setProperty("top", "0px");
  wrapper.style.setProperty("z-index", String(10 + pageIndex));
}

export function updateVirtualPageWindow(
  state: FlipTurnState,
  domState: DomRenderState
) {
  const range = virtualPageWindowRange(state);
  const nextPageNumbers = new Set<number>();

  for (let pageNumber = range.start; pageNumber <= range.end; pageNumber++) {
    nextPageNumbers.add(pageNumber);
  }

  for (const [pageNumber, wrapper] of Array.from(
    domState.mountedPageWrappers
  )) {
    if (!nextPageNumbers.has(pageNumber)) {
      clearFaceContent(domState, wrapper);
      wrapper.remove();
      domState.mountedPageWrappers.delete(pageNumber);
    }
  }

  for (const pageNumber of nextPageNumbers) {
    let wrapper = domState.mountedPageWrappers.get(pageNumber);
    if (!wrapper) {
      wrapper = createLayerDiv("flip-turn-window-page-frame flip-turn-page");
      wrapper.dataset.pageNumber = String(pageNumber);
      domState.mountedPageWrappers.set(pageNumber, wrapper);
      domState.virtualPageWindowLayer.append(wrapper);
    }
    setWrapperGeometry(state, wrapper, pageNumber);
    setPageFace(
      state,
      domState,
      wrapper,
      pageIndexFromPublicPageNumber(pageNumber)
    );
  }

  domState.needsVirtualWindowSync = false;
}

export function destroyVirtualPageWindow(domState: DomRenderState) {
  for (const wrapper of domState.mountedPageWrappers.values()) {
    clearFaceContent(domState, wrapper);
    wrapper.remove();
  }
  domState.mountedPageWrappers.clear();
  domState.needsVirtualWindowSync = true;
}

export function updatePageSourcesState(
  state: FlipTurnState,
  options: ResolvedFlipTurnOptions
) {
  state.pages = pageListFromOptions(options);
}

export function parkPageSourceNodes(
  state: FlipTurnState,
  domState: DomRenderState
) {
  for (const source of state.pages) {
    const hostNode = toHostNode(source);
    if (hostNode) {
      parkSourceNodeIfNeeded(domState, hostNode);
    }
  }
}
