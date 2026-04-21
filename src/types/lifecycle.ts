import type { DisplayMode, TurnDirection } from "./primitives";

export type FlipTurnLifecycleEvent =
  | "start"
  | "turn"
  | "turning"
  | "turned"
  | "end"
  | "first"
  | "last";

export type FlipTurnEventCause =
  | "pointer"
  | "keyboard"
  | "api"
  | "hover"
  | "update"
  | "stop"
  | "boundary";

export type FlipTurnEventPayload = {
  page: number;
  display: DisplayMode;
  spread: {
    left: number | null;
    right: number | null;
  };
  view: number[];
  direction?: TurnDirection;
  cause: FlipTurnEventCause;
};

export type CancelableFlipTurnEventPayload = FlipTurnEventPayload & {
  defaultPrevented: boolean;
  preventDefault: () => void;
};

export type FlipTurnEventListener = (
  payload: FlipTurnEventPayload | CancelableFlipTurnEventPayload
) => void;

export type FlipTurnWhen = Partial<{
  start: (payload: CancelableFlipTurnEventPayload) => void;
  turn: (payload: FlipTurnEventPayload) => void;
  turning: (payload: FlipTurnEventPayload) => void;
  turned: (payload: FlipTurnEventPayload) => void;
  end: (payload: FlipTurnEventPayload) => void;
  first: (payload: FlipTurnEventPayload) => void;
  last: (payload: FlipTurnEventPayload) => void;
}>;

export type EventSubscription = {
  unsubscribe: () => void;
};
