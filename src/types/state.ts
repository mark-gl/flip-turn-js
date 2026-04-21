import type {
  FlipTurnEventCause,
  FlipTurnEventListener,
  FlipTurnLifecycleEvent,
} from "./lifecycle";
import type { ResolvedFlipTurnOptions } from "./options";
import type { Corner, DisplayMode, Point, TurnDirection } from "./primitives";

export type PageSource = {
  key?: string;
  value: HTMLElement;
};

export type ActiveTurnResolvedOptions = {
  duration: number;
  acceleration: boolean;
  elevation: number;
  corners: Record<Corner, boolean>;
  cornerSize: number;
  gradients: {
    front: boolean;
    back: boolean;
  };
};

export type ActiveTurn = {
  direction: TurnDirection;
  corner: Corner;
  side: "left" | "right";
  pageWidth: number;
  pageHeight: number;
  pointerId: number;
  pointerDown: boolean;
  point: Point;
  phase: "idle" | "previewing" | "restoring" | "committing";
  isPreview: boolean;
  cause: FlipTurnEventCause;
  pressedAt: number;
  progress: number;
};

export type FlipTurnState = {
  options: ResolvedFlipTurnOptions;
  displayMode: DisplayMode;
  pages: PageSource[];
  pageCount: number;
  currentSpreadIndex: number;
  currentPageIndex: number;
  animationSpeedMultiplier: number;
  animationHandle: number | null;
  hoverAnimationTarget: Point | null;
  activeTurn: ActiveTurn | null;
  activeTurnResolvedOptions: ActiveTurnResolvedOptions | null;
  keyboardTargetPosition: number | null;
  pendingPageTarget: number | null;
  interactionEnabled: boolean;
  eventSubscribers: Map<FlipTurnLifecycleEvent, Set<FlipTurnEventListener>>;
};
