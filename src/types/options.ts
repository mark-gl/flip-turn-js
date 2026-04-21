import type { FlipTurnWhen } from "./lifecycle";
import type { Corner, DisplayMode } from "./primitives";

export type CornerMask = Partial<Record<Corner, boolean>>;
export type CornerMode = "forward" | "backward" | "all" | CornerMask;

export type PageSourceInput = HTMLElement;

export type PageTurnGradientOptions = Partial<{
  front: boolean;
  back: boolean;
}>;

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

export type FlipTurnOptions = {
  pages: number | PageSourceInput[];
  virtualPageWindow: number;
  page: number;
  display: DisplayMode;
  width: number | null;
  height: number | null;
  pageNavigationMode: "animated" | "snap";
  corners: CornerMode;
  cornerSize: number;
  duration: number;
  acceleration: boolean;
  elevation: number;
  gradients: boolean;
  pageTurn: PageTurnOptionMap;
  when: FlipTurnWhen;
};

export type ResolvedFlipTurnOptions = Omit<FlipTurnOptions, "corners"> & {
  corners: Record<Corner, boolean>;
  pageCount: number;
};
