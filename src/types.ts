import type {
  DisplayMode,
  FlipTurnEventListener,
  FlipTurnLifecycleEvent,
  FlipTurnOptions,
  PageSourceInput,
  ResolvedFlipTurnOptions,
} from "./core/types";
import type { EventSubscription } from "./runtime/runtime";

export type FlipTurnApi = {
  update: (options: Partial<FlipTurnOptions>) => FlipTurnApi;
  options: () => ResolvedFlipTurnOptions;
  page: (pageNumber?: number) => number;
  display: (displayMode?: DisplayMode) => DisplayMode;
  next: () => boolean;
  previous: () => boolean;
  size: (
    width?: number | null,
    height?: number | null
  ) => FlipTurnApi | { width: number | null; height: number | null };
  setPages: (pages: PageSourceInput[]) => FlipTurnApi;
  addPage: (pageSource: PageSourceInput, pageNumber?: number) => FlipTurnApi;
  removePage: (pageNumber: number) => FlipTurnApi;
  stop: () => void;
  animating: () => boolean;
  subscribe: (
    eventName: FlipTurnLifecycleEvent,
    listener: FlipTurnEventListener
  ) => EventSubscription;
  disable: () => void;
  enable: () => void;
  destroy: () => void;
};
