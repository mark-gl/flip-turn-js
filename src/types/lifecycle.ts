import type { Corner, DisplayMode, TurnDirection } from "./primitives";

export type FlipTurnEvent =
  | "start"
  | "turn"
  | "turning"
  | "turned"
  | "end"
  | "first"
  | "last";

export type FlipTurnEventSource =
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
  source: FlipTurnEventSource;
};

export type CancelableFlipTurnEventPayload = FlipTurnEventPayload & {
  corner?: Corner;
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
