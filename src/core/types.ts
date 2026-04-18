export type DisplayMode = "single" | "double";
export type TurnDirection = "forward" | "backward";
export type Corner = "tl" | "tr" | "bl" | "br";

export type ViewportBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PageSource = {
  key?: string;
  value: HTMLElement;
};

export type PageSourceInput = HTMLElement;

export type PageTurnGradientOptions = Partial<{
  front: boolean;
  back: boolean;
}>;
export type CornerMask = Partial<Record<Corner, boolean>>;
export type CornerMode = "forward" | "backward" | "all" | CornerMask;

export type PageTurnOptions = Partial<{
  duration: number;
  corners: CornerMode;
  cornerSize: number;
  acceleration: boolean;
  elevation: number;
  gradients: boolean | PageTurnGradientOptions;
  backPage: number | null;
}>;

export type PageTurnOptionMap = Record<number, PageTurnOptions>;
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

export type FlipTurnOptions = {
  page: number;
  display: DisplayMode;
  pageNavigationMode: "animated" | "snap";
  duration: number;
  acceleration: boolean;
  elevation: number;
  gradients: boolean;
  cornerSize: number;
  corners: CornerMode;
  pages: number | PageSourceInput[];
  virtualPageWindow: number;
  pageTurn: PageTurnOptionMap;
  when: FlipTurnWhen;
  width: number | null;
  height: number | null;
};

export type ResolvedFlipTurnOptions = Omit<FlipTurnOptions, "corners"> & {
  corners: Record<Corner, boolean>;
  pageCount: number;
};
export type Point = {
  x: number;
  y: number;
};

export type ActiveTurn = {
  direction: TurnDirection;
  corner: Corner;
  pageWidth: number;
  pageHeight: number;
  pointerId: number;
  pointerDown: boolean;
  isPreview: boolean;
  cause: FlipTurnEventCause;
  phase: "idle" | "previewing" | "restoring" | "committing";
  pressedAt: number;
  point: Point;
  progress: number;
  side: "left" | "right";
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
  eventSubscribers: Map<FlipTurnLifecycleEvent, Set<FlipTurnEventListener>>;
  interactionEnabled: boolean;
};
