import { subscribeLifecycleEvent } from "./core/events";
import { cloneResolvedOptionsSnapshot } from "./core/options";
import {
  currentPublicPageNumber,
  normalizePageIndex,
  normalizePublicPageNumber,
} from "./layout/spread";
import { isAnimating, stopAnimation } from "./turn/animation";
import { requestPageSet, requestTurn, stopActiveTurn } from "./turn/commands";
import type {
  EventSubscription,
  FlipTurnEvent,
  FlipTurnEventListener,
} from "./types/lifecycle";
import type {
  FlipTurnOptions,
  GoToPageOptions,
  PageSourceInput,
  ResolvedFlipTurnOptions,
} from "./types/options";
import type { DisplayMode, DisplayOption } from "./types/primitives";
import type { FlipTurnRuntime } from "./types/renderer";
import type { FlipTurnState } from "./types/state";

export type FlipTurnApi = {
  update: (options: Partial<FlipTurnOptions>) => FlipTurnApi;
  readonly options: ResolvedFlipTurnOptions;
  readonly page: number;
  goToPage: (pageNumber: number, options?: GoToPageOptions) => number;
  display: DisplayOption;
  next: () => boolean;
  previous: () => boolean;
  size: { width: number | null; height: number | null };
  setPages: (pages: PageSourceInput[]) => FlipTurnApi;
  addPage: (pageSource: PageSourceInput, pageNumber?: number) => FlipTurnApi;
  removePage: (pageNumber: number) => FlipTurnApi;
  stop: () => void;
  readonly isAnimating: boolean;
  subscribe: (
    eventName: FlipTurnEvent,
    listener: FlipTurnEventListener
  ) => EventSubscription;
  disable: () => void;
  enable: () => void;
  destroy: () => void;
};

type CreateApiArgs = {
  runtime: FlipTurnRuntime;
  state: FlipTurnState;
  updateOptions: (options: Partial<FlipTurnOptions>) => FlipTurnApi;
  destroy: () => void;
};

export function createFlipTurnApi({
  runtime,
  state,
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

  const apiBase = {
    update: updateOptions,
    goToPage: (pageNumber: number, options?: GoToPageOptions) => {
      const requestedPage = normalizePublicPageNumber(state, pageNumber);
      const snap = options?.skipTransition === true;
      const started = requestPageSet(runtime, requestedPage, snap);

      if (snap || !started) {
        return currentPublicPageNumber(state);
      }

      return requestedPage;
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
    subscribe: (eventName: FlipTurnEvent, listener: FlipTurnEventListener) => ({
      unsubscribe: subscribeLifecycleEvent(state, eventName, listener),
    }),
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

  const api = Object.defineProperties(apiBase, {
    options: {
      get: (): ResolvedFlipTurnOptions =>
        cloneResolvedOptionsSnapshot(state.options),
      enumerable: true,
      configurable: true,
    },
    page: {
      get: (): number => currentPublicPageNumber(state),
      enumerable: true,
      configurable: true,
    },
    isAnimating: {
      get: (): boolean => isAnimating(state),
      enumerable: true,
      configurable: true,
    },
    display: {
      get: (): DisplayMode => state.displayMode,
      set: (mode: DisplayOption) => updateOptions({ display: mode }),
      enumerable: true,
      configurable: true,
    },
    size: {
      get: (): { width: number | null; height: number | null } => ({
        width: state.options.width,
        height: state.options.height,
      }),
      set: (value: { width: number | null; height: number | null }) => {
        updateOptions({ width: value.width, height: value.height });
      },
      enumerable: true,
      configurable: true,
    },
  }) as FlipTurnApi;

  return api;
}
