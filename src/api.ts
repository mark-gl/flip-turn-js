import { subscribeLifecycleEvent } from "./core/events";
import { cloneResolvedOptionsSnapshot } from "./core/options";
import type {
  DisplayMode,
  FlipTurnOptions,
  FlipTurnState,
  PageSourceInput,
} from "./core/types";
import {
  currentPublicPageNumber,
  normalizePageIndex,
  normalizePublicPageNumber,
} from "./layout/spread";
import type { FlipTurnRuntime } from "./runtime/runtime";
import { isAnimating, stopAnimation } from "./turn/animation";
import { requestPageSet, requestTurn, stopActiveTurn } from "./turn/commands";
import type { FlipTurnApi } from "./types";

type CreateApiArgs = {
  runtime: FlipTurnRuntime;
  state: FlipTurnState;
  pageNavigationMode: () => "animated" | "snap";
  updateOptions: (options: Partial<FlipTurnOptions>) => FlipTurnApi;
  destroy: () => void;
};

export function createFlipTurnApi({
  runtime,
  state,
  pageNavigationMode,
  updateOptions,
  destroy,
}: CreateApiArgs): FlipTurnApi {
  const assertDomPageSource = (
    pageSource: PageSourceInput,
    errorContext: string
  ) => {
    if (!(pageSource instanceof HTMLElement)) {
      throw new TypeError(
        `Invalid ${errorContext}. Supported page source inputs are HTMLElements.`
      );
    }
  };

  const api: FlipTurnApi = {
    update: updateOptions,
    options: () => cloneResolvedOptionsSnapshot(state.options),
    page: (pageNumber?: number) => {
      if (pageNumber === undefined) {
        return currentPublicPageNumber(state);
      }

      const requestedPage = normalizePublicPageNumber(state, pageNumber);
      const snap = pageNavigationMode() === "snap";
      const started = requestPageSet(runtime, requestedPage, snap);

      if (snap || !started) {
        return currentPublicPageNumber(state);
      }

      return requestedPage;
    },
    display: (displayMode?: DisplayMode) => {
      if (!displayMode) {
        return state.displayMode;
      }

      updateOptions({ display: displayMode });
      return state.displayMode;
    },
    next: () => {
      state.keyboardTargetPosition = null;
      state.pendingPageTarget = null;
      return requestTurn(runtime, "forward");
    },
    previous: () => {
      state.keyboardTargetPosition = null;
      state.pendingPageTarget = null;
      return requestTurn(runtime, "backward");
    },
    size: (width?: number | null, height?: number | null) => {
      if (width === undefined && height === undefined) {
        return {
          width: state.options.width,
          height: state.options.height,
        };
      }

      updateOptions({
        width: width === undefined ? state.options.width : width,
        height: height === undefined ? state.options.height : height,
      });
      return api;
    },
    setPages: (pages: PageSourceInput[]) => {
      for (const pageSource of pages) {
        assertDomPageSource(pageSource, "page source");
      }

      updateOptions({ pages });
      return api;
    },
    addPage: (pageSource: PageSourceInput, pageNumber?: number) => {
      assertDomPageSource(pageSource, "page source");

      const nextPages = state.pages.map((source) => source.value);
      const insertionIndex =
        pageNumber === undefined
          ? nextPages.length
          : normalizePageIndex(pageNumber, nextPages.length, nextPages.length);
      const currentPage = currentPublicPageNumber(state);

      nextPages.splice(insertionIndex, 0, pageSource);
      const nextPage =
        insertionIndex <= currentPage - 1 ? currentPage + 1 : currentPage;
      updateOptions({ pages: nextPages, page: nextPage });
      return api;
    },
    removePage: (pageNumber: number) => {
      const nextPages = state.pages.map((source) => source.value);
      if (nextPages.length === 0) {
        return api;
      }

      const currentPage = currentPublicPageNumber(state);
      const removalIndex = normalizePageIndex(
        pageNumber,
        nextPages.length - 1,
        0
      );

      nextPages.splice(removalIndex, 1);
      const removedPublicPage = removalIndex + 1;
      const nextPage =
        removedPublicPage < currentPage
          ? currentPage - 1
          : Math.min(currentPage, Math.max(1, nextPages.length));

      updateOptions({ pages: nextPages, page: nextPage });
      return api;
    },
    stop: () => {
      state.keyboardTargetPosition = null;
      state.pendingPageTarget = null;
      stopAnimation(state);
      stopActiveTurn(runtime, "stop");
    },
    animating: () => isAnimating(state),
    subscribe: (eventName, listener) => {
      const unsubscribe = runtime.subscribeEvent
        ? runtime.subscribeEvent(eventName, listener).unsubscribe
        : subscribeLifecycleEvent(state, eventName, listener);

      return { unsubscribe };
    },
    disable: () => {
      state.interactionEnabled = false;
      state.keyboardTargetPosition = null;
      state.pendingPageTarget = null;
      stopActiveTurn(runtime, "stop");
    },
    enable: () => {
      state.interactionEnabled = true;
    },
    destroy,
  };

  return api;
}
