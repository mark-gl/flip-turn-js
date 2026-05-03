import {
  currentPublicPageNumber,
  hasPages,
  isSingleDisplayMode,
  publicPageNumberFromPageIndex,
  spreadPageIndicesAt,
} from "../layout/spread";
import type {
  CancelableFlipTurnEventPayload,
  FlipTurnEvent,
  FlipTurnEventListener,
  FlipTurnEventPayload,
  FlipTurnEventSource,
} from "../types/lifecycle";
import type { TurnDirection } from "../types/primitives";
import type { FlipTurnState } from "../types/state";

function immutablePayload(payload: FlipTurnEventPayload): FlipTurnEventPayload {
  const frozenView = [...payload.view];
  Object.freeze(frozenView);

  const frozenSpread = Object.freeze({ ...payload.spread });

  return Object.freeze({
    ...payload,
    spread: frozenSpread,
    view: frozenView,
  }) as FlipTurnEventPayload;
}

function currentSpreadPayload(state: FlipTurnState) {
  if (isSingleDisplayMode(state)) {
    const currentPage = currentPublicPageNumber(state);
    return {
      left: null,
      right: currentPage,
      view: [currentPage],
    };
  }

  const spread = spreadPageIndicesAt(state, state.currentSpreadIndex);
  const leftPage = publicPageNumberFromPageIndex(spread.left);
  const rightPage = publicPageNumberFromPageIndex(spread.right);
  const view = [leftPage, rightPage].filter(
    (pageNumber): pageNumber is number => pageNumber !== null
  );

  return {
    left: leftPage,
    right: rightPage,
    view,
  };
}

function basePayload(
  state: FlipTurnState,
  direction: TurnDirection | undefined,
  source: FlipTurnEventSource
): FlipTurnEventPayload {
  const spreadPayload = currentSpreadPayload(state);

  return {
    page: currentPublicPageNumber(state),
    display: state.displayMode,
    spread: {
      left: spreadPayload.left,
      right: spreadPayload.right,
    },
    view: spreadPayload.view,
    direction,
    source,
  };
}

function dispatchSubscribers(
  state: FlipTurnState,
  eventName: FlipTurnEvent,
  payload: FlipTurnEventPayload | CancelableFlipTurnEventPayload
) {
  const listeners = state.eventSubscribers.get(eventName);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribeLifecycleEvent(
  state: FlipTurnState,
  eventName: FlipTurnEvent,
  listener: FlipTurnEventListener
): () => void {
  const listeners = state.eventSubscribers.get(eventName);
  if (!listeners) {
    throw new Error(`unsupported lifecycle event: ${eventName}`);
  }

  listeners.add(listener);

  let active = true;
  return () => {
    if (!active) {
      return;
    }

    active = false;
    listeners.delete(listener);
  };
}

export function emitLifecycle(
  state: FlipTurnState,
  eventName: FlipTurnEvent,
  direction?: TurnDirection,
  source: FlipTurnEventSource = "api"
): boolean {
  if (eventName === "start") {
    let defaultPrevented = false;
    const startPayload = immutablePayload(
      basePayload(state, direction, source)
    );
    const callback = state.options.when[eventName];
    const startCallback = callback as
      | ((payload: CancelableFlipTurnEventPayload) => void)
      | undefined;

    const payload: CancelableFlipTurnEventPayload = {
      ...startPayload,
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: () => {
        defaultPrevented = true;
      },
    };

    startCallback?.(payload);
    dispatchSubscribers(state, eventName, payload);

    return !defaultPrevented;
  }

  const callback = state.options.when[eventName];
  const payload = immutablePayload(basePayload(state, direction, source));

  if (callback) {
    const lifecycleCallback = callback as (
      payload: FlipTurnEventPayload
    ) => void;
    lifecycleCallback(payload);
  }

  dispatchSubscribers(state, eventName, payload);
  return true;
}

export function emitViewEntryBoundaryEvents(
  state: FlipTurnState,
  previousPage: number,
  direction: TurnDirection | undefined,
  source: FlipTurnEventSource
) {
  if (!hasPages(state.pageCount)) {
    return;
  }

  const currentPage = currentPublicPageNumber(state);
  if (currentPage === 1 && previousPage !== 1) {
    emitLifecycle(state, "first", direction, source);
  }

  if (currentPage === state.pageCount && previousPage !== state.pageCount) {
    emitLifecycle(state, "last", direction, source);
  }
}
