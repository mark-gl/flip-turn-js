import type {
  EventSubscription,
  FlipTurnEventListener,
  FlipTurnLifecycleEvent,
} from "./lifecycle";
import type { ResolvedFlipTurnOptions } from "./options";
import type { Point } from "./primitives";
import type { FlipTurnState } from "./state";

export type ViewportBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FoldGeometry = {
  point: Point;
  angleRadians: number;
  angleDegrees: number;
  alpha: number;
  translate: Point;
  moveVector: Point;
  diagonalFoldPoint: Point;
  gradientOpacity: number;
  gradientStart: number;
  gradientEndPointA: Point;
  gradientEndPointB: Point;
  isTopCorner: boolean;
  isLeftCorner: boolean;
};

export type RenderPrimitives = {
  foldGeometry: FoldGeometry | null;
  shouldShowBackShadow: boolean;
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
