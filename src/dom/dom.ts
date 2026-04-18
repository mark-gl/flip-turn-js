import type { PageSourceInput, ViewportBox } from "../core/types";

export type FlipTurnDom = {
  viewport: HTMLDivElement;
  staticLeftPage: HTMLDivElement;
  staticRightPage: HTMLDivElement;
  staticSinglePage: HTMLDivElement;
};

const ROOT_CLASS_NAME = "flip-turn-viewport";
const BASE_SHEET_CLASS_NAME = "flip-turn-static-page";
const PAGE_CLASS_NAME = "flip-turn-page";

function childElementById<T extends HTMLElement>(
  container: HTMLElement,
  id: string
): T | null {
  const child = container.children.namedItem(id);
  const element =
    child instanceof HTMLElement && child.id === id ? (child as T) : null;

  return element;
}

function requiredChildElement<T extends HTMLElement>(
  container: HTMLElement,
  id: string,
  errorMessage: string
): T {
  const element = childElementById<T>(container, id);

  if (!element) {
    throw new Error(errorMessage);
  }

  return element;
}

function ensureClassNames(element: HTMLElement, classNames: string[]) {
  element.classList.add(...classNames);
}

function createLayerDiv(
  ownerDocument: Document,
  id: string,
  classNames: string[]
): HTMLDivElement {
  const createdNode = ownerDocument.createElement("div");
  createdNode.id = id;
  ensureClassNames(createdNode, classNames);
  markInternalNode(createdNode);
  return createdNode;
}

function clearDomScaffold(container: HTMLDivElement) {
  for (const node of Array.from(container.children)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (isInternalNode(node)) {
      node.remove();
    }
  }
}

export function bootstrapDomBindings(container: HTMLDivElement): void {
  container.classList.add(ROOT_CLASS_NAME);

  clearDomScaffold(container);

  const staticLeftPage = createLayerDiv(container.ownerDocument, "base-left", [
    BASE_SHEET_CLASS_NAME,
    "flip-turn-static-left-page",
    PAGE_CLASS_NAME,
  ]);
  const staticRightPage = createLayerDiv(
    container.ownerDocument,
    "base-right",
    [BASE_SHEET_CLASS_NAME, "flip-turn-static-right-page", PAGE_CLASS_NAME]
  );
  const staticSinglePage = createLayerDiv(
    container.ownerDocument,
    "base-single",
    [BASE_SHEET_CLASS_NAME, "flip-turn-static-single-page", PAGE_CLASS_NAME]
  );
  container.append(staticLeftPage, staticRightPage, staticSinglePage);
}

export function resolveDomBindings(container: HTMLDivElement): FlipTurnDom {
  container.classList.add(ROOT_CLASS_NAME);

  return {
    viewport: container,
    staticLeftPage: requiredChildElement(
      container,
      "base-left",
      "flip-turn DOM is missing #base-left"
    ),
    staticRightPage: requiredChildElement(
      container,
      "base-right",
      "flip-turn DOM is missing #base-right"
    ),
    staticSinglePage: requiredChildElement(
      container,
      "base-single",
      "flip-turn DOM is missing #base-single"
    ),
  };
}

function isInternalNode(node: HTMLElement): boolean {
  return node.dataset.flipTurnInternal === "true";
}

export function markInternalNode(node: HTMLElement) {
  node.dataset.flipTurnInternal = "true";
}

export function domChildPageSources(container: HTMLElement): PageSourceInput[] {
  const reservedIds = new Set(["base-left", "base-right", "base-single"]);

  const sources: PageSourceInput[] = [];
  for (const node of Array.from(container.children)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (reservedIds.has(node.id)) {
      continue;
    }

    if (isInternalNode(node)) {
      continue;
    }

    sources.push(node);
  }

  if (sources.length > 0) {
    return sources;
  }

  const recoveredSources: PageSourceInput[] = [];
  const seenSources = new Set<HTMLElement>();

  for (const childNode of Array.from(container.children)) {
    if (!(childNode instanceof HTMLElement) || !isInternalNode(childNode)) {
      continue;
    }

    for (const descendantNode of Array.from(childNode.querySelectorAll("*"))) {
      if (!(descendantNode instanceof HTMLElement)) {
        continue;
      }

      if (isInternalNode(descendantNode)) {
        continue;
      }

      if (descendantNode.dataset.flipTurnMirrorClone === "true") {
        continue;
      }

      if (seenSources.has(descendantNode)) {
        continue;
      }

      seenSources.add(descendantNode);
      recoveredSources.push(descendantNode);
    }
  }

  if (recoveredSources.length > 0) {
    return recoveredSources;
  }

  return sources;
}

export function viewportBoxFromDomRect(domRect: DOMRect): ViewportBox {
  return {
    left: domRect.left,
    top: domRect.top,
    width: domRect.width,
    height: domRect.height,
  };
}
