import { defaultOptions, resolveOptions } from "./options";
import type {
  FlipTurnEventListener,
  FlipTurnLifecycleEvent,
} from "../types/lifecycle";
import type { DisplayMode } from "../types/primitives";
import type {
  ActiveTurn,
  ActiveTurnResolvedOptions,
  FlipTurnState,
  PageSource,
} from "../types/state";

const LIFECYCLE_EVENTS: FlipTurnLifecycleEvent[] = [
  "start",
  "turn",
  "turning",
  "turned",
  "end",
  "first",
  "last",
];

function createEventSubscribers() {
  const subscribers = new Map<
    FlipTurnLifecycleEvent,
    Set<FlipTurnEventListener>
  >();

  for (const eventName of LIFECYCLE_EVENTS) {
    subscribers.set(eventName, new Set());
  }

  return subscribers;
}

export function createState(): FlipTurnState {
  const initialOptions = resolveOptions(defaultOptions, {});

  return {
    options: initialOptions,
    displayMode: initialOptions.display,
    pages: [] as PageSource[],
    pageCount: 0,
    currentSpreadIndex: 0,
    currentPageIndex: 0,
    animationSpeedMultiplier: 1,
    animationHandle: null,
    hoverAnimationTarget: null,
    activeTurn: null as ActiveTurn | null,
    activeTurnResolvedOptions: null as ActiveTurnResolvedOptions | null,
    keyboardTargetPosition: null,
    pendingPageTarget: null,
    eventSubscribers: createEventSubscribers(),
    interactionEnabled: true,
  };
}

export function clearActiveTurnState(state: FlipTurnState) {
  state.activeTurn = null;
  state.activeTurnResolvedOptions = null;
}

export function pageOffsetXForSide(
  boxWidth: number,
  displayMode: DisplayMode,
  side: "left" | "right"
): number {
  return displayMode === "double" && side === "right" ? boxWidth / 2 : 0;
}
