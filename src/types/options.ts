import type { FlipTurnWhen } from "./lifecycle";
import type { Corner, DisplayOption } from "./primitives";

export type CornerMask = Partial<Record<Corner, boolean>>;

export type PageSourceInput = HTMLElement;

export type PageTurnGradientOptions = Partial<{
  front: boolean;
  back: boolean;
}>;

export type HardOption = boolean | "cover" | number[];

export type PageTurnOptions = Partial<{
  duration: number;
  corners: CornerMask;
  cornerSize: number;
  elevation: number;
  gradients: boolean | PageTurnGradientOptions;
  hard: boolean;
  hardThickness: number;
  backFace: number | null;
}>;

export type PageTurnOptionMap = Record<number, PageTurnOptions>;

export type GoToPageOptions = {
  skipTransition?: boolean;
};

export type FlipTurnOptions = {
  pages: PageSourceInput[];
  pageCount: number;
  pageBuffer: number;
  page: number;
  display: DisplayOption;
  width: number | null;
  height: number | null;
  corners: CornerMask;
  cornerSize: number;
  cornerOutset: number | null;
  duration: number;
  elevation: number;
  gradients: boolean;
  hard: HardOption;
  hardThickness: number;
  pageOptions: PageTurnOptionMap;
  when: FlipTurnWhen;
};

export type ResolvedFlipTurnOptions = Omit<
  FlipTurnOptions,
  "corners" | "cornerOutset"
> & {
  corners: Record<Corner, boolean>;
  cornerOutset: number;
};
