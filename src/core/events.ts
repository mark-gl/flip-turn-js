import {
  currentPublicPageNumber,
  hasPages,
  isSingleDisplayMode,
  publicPageNumberFromPageIndex,
  spreadPageIndicesAt,
} from "../layout/spread";
import type {
  CancelableFlipTurnEventPayload,
  FlipTurnEventCause,
  FlipTurnEventListener,
  FlipTurnEventPayload,
  FlipTurnLifecycleEvent,
  FlipTurnState,
  TurnDirection,
} from "./types";

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
  cause: FlipTurnEventCause
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
    cause,
  };
}

function dispatchSubscribers(
  state: FlipTurnState,
  eventName: FlipTurnLifecycleEvent,
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
  eventName: FlipTurnLifecycleEvent,
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
  eventName: FlipTurnLifecycleEvent,
  direction?: TurnDirection,
  cause: FlipTurnEventCause = "api"
): boolean {
  if (eventName === "start") {
    let defaultPrevented = false;
    const startPayload = immutablePayload(basePayload(state, direction, cause));
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
  const payload = immutablePayload(basePayload(state, direction, cause));

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
  cause: FlipTurnEventCause
) {
  if (!hasPages(state.pageCount)) {
    return;
  }

  const currentPage = currentPublicPageNumber(state);
  if (currentPage === 1 && previousPage !== 1) {
    emitLifecycle(state, "first", direction, cause);
  }

  if (currentPage === state.pageCount && previousPage !== state.pageCount) {
    emitLifecycle(state, "last", direction, cause);
  }
}
