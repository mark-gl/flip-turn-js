import {
  currentPublicPageNumber,
  setCurrentFromPublicPage,
} from "../layout/spread";
import { updatePageSourcesState } from "../render/page-lifecycle";
import { render } from "../render/render";
import { emitViewEntryBoundaryEvents } from "./events";
import { cloneResolvedOptionsSnapshot } from "./options";
import type { ResolvedFlipTurnOptions } from "../types/options";
import type { FlipTurnRuntime } from "../types/renderer";

export function applyResolvedOptions(
  runtime: FlipTurnRuntime,
  resolvedOptions: ResolvedFlipTurnOptions,
  explicitPage: boolean,
  cause: "update" | "api" = "update"
) {
  const previousPublicPage = currentPublicPageNumber(runtime.state);
  const detachedResolvedOptions = cloneResolvedOptionsSnapshot(resolvedOptions);

  runtime.state.displayMode = detachedResolvedOptions.display;
  updatePageSourcesState(runtime.state, detachedResolvedOptions);

  runtime.state.pageCount = runtime.state.pages.length;

  runtime.state.options = {
    ...detachedResolvedOptions,
    pageCount: runtime.state.pageCount,
  };

  runtime.renderer.applyOptions?.(runtime, detachedResolvedOptions);

  if (explicitPage) {
    setCurrentFromPublicPage(runtime.state, detachedResolvedOptions.page);
  } else {
    setCurrentFromPublicPage(runtime.state, previousPublicPage);
  }

  emitViewEntryBoundaryEvents(
    runtime.state,
    previousPublicPage,
    undefined,
    cause
  );

  render(runtime);
}
