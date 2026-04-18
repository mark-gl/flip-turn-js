import type {
  FlipTurnEventListener,
  FlipTurnLifecycleEvent,
  FlipTurnState,
  FoldGeometry,
  ResolvedFlipTurnOptions,
  ViewportBox,
} from "../core/types";

export type EventSubscription = {
  unsubscribe: () => void;
};

export type PointerLike = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

export type RenderPrimitives = {
  foldGeometry: FoldGeometry | null;
  shouldShowBackShadow: boolean;
};

export type FlipTurnRenderer = {
  init?: (runtime: FlipTurnRuntime) => void;
  applyOptions?: (
    runtime: FlipTurnRuntime,
    options: ResolvedFlipTurnOptions
  ) => void;
  resize?: (runtime: FlipTurnRuntime, viewportBox: ViewportBox) => void;
  render: (runtime: FlipTurnRuntime, primitives: RenderPrimitives) => void;
  dispose?: (runtime: FlipTurnRuntime) => void;
  destroy?: (runtime: FlipTurnRuntime) => void;
};

export type FlipTurnRuntime = {
  state: FlipTurnState;
  renderer: FlipTurnRenderer;
  viewport: HTMLDivElement;
  subscribeEvent?: (
    eventName: FlipTurnLifecycleEvent,
    listener: FlipTurnEventListener
  ) => EventSubscription;
};
