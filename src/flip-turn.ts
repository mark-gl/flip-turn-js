import type { FlipTurnApi } from "./api";
import { createFlipTurnApi } from "./api";
import { subscribeLifecycleEvent } from "./core/events";
import {
  cloneApiBoundaryOptions,
  defaultOptions,
  resolveOptions,
} from "./core/options";
import { createState } from "./core/state";
import type { FlipTurnOptions } from "./core/types";
import {
  initTransformSupport,
  setTransform,
  translate,
} from "./dom/css-transforms";
import { optionsFromDataAttributes } from "./dom/data-options";
import { domChildPageSources, viewportBoxFromDomRect } from "./dom/dom";
import { createDomRenderer } from "./render/dom-renderer";
import { render } from "./render/render";
import { applyResolvedOptions } from "./runtime/apply-options";
import type { FlipTurnRenderer, FlipTurnRuntime } from "./runtime/runtime";
import { stopAnimation } from "./turn/animation";
import { stopActiveTurn } from "./turn/commands";
import { bindInputEvents } from "./turn/input/binding";

export type { FlipTurnApi };

export type CreateFlipTurnConfig = {
  renderer?: FlipTurnRenderer;
};

export function createFlipTurn(
  viewport: HTMLDivElement,
  config: CreateFlipTurnConfig = {}
): FlipTurnApi {
  const rootElement = viewport;

  const runtime: FlipTurnRuntime = {
    state: createState(),
    renderer: config.renderer ?? createDomRenderer(),
    viewport: rootElement,
  };

  runtime.subscribeEvent = (eventName, listener) => ({
    unsubscribe: subscribeLifecycleEvent(runtime.state, eventName, listener),
  });

  const state = runtime.state;

  let initialized = false;
  let domSourceSyncScheduled = false;
  let useDomPages = false;
  let pageNavigationMode: "animated" | "snap" = "animated";
  let lifecycleController: AbortController | null = null;
  let destroyed = false;

  const readDomPages = (): FlipTurnOptions["pages"] =>
    domChildPageSources(rootElement);

  const scheduleDomSourceSync = () => {
    if (destroyed || domSourceSyncScheduled || !useDomPages) {
      return;
    }

    domSourceSyncScheduled = true;
    queueMicrotask(() => {
      domSourceSyncScheduled = false;
      if (destroyed || !useDomPages) {
        return;
      }

      const syncedOptions = resolveOptions(state.options, {
        pages: readDomPages(),
      });
      applyResolvedOptions(runtime, syncedOptions, false, "update");
    });
  };

  const ensureLifecycle = () => {
    if (lifecycleController !== null) {
      return;
    }

    lifecycleController = new AbortController();
    const { signal } = lifecycleController;

    const onResize = () => {
      runtime.renderer.resize?.(
        runtime,
        viewportBoxFromDomRect(rootElement.getBoundingClientRect())
      );
      render(runtime);
    };

    window.addEventListener("resize", onResize, { signal });

    const observer = new MutationObserver(scheduleDomSourceSync);
    observer.observe(rootElement, { childList: true });
    signal.addEventListener("abort", () => observer.disconnect(), {
      once: true,
    });

    bindInputEvents(runtime, signal);
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    state.pendingPageTarget = null;
    stopAnimation(state);
    stopActiveTurn(runtime, "stop");

    if (lifecycleController) {
      lifecycleController.abort();
      lifecycleController = null;
    }

    runtime.renderer.dispose?.(runtime);
    runtime.renderer.destroy?.(runtime);
  };

  const updateOptions = (
    partialOptions: Partial<FlipTurnOptions>
  ): FlipTurnApi => {
    if (destroyed) {
      return api;
    }

    const detachedPartialOptions = cloneApiBoundaryOptions(partialOptions);

    if (detachedPartialOptions.pageNavigationMode === "snap") {
      pageNavigationMode = "snap";
    } else if (detachedPartialOptions.pageNavigationMode === "animated") {
      pageNavigationMode = "animated";
    }

    if (detachedPartialOptions.pages !== undefined) {
      useDomPages = false;
    }

    if (state.activeTurn) {
      stopActiveTurn(runtime, "update");
    }

    const resolvedOptions = resolveOptions(
      state.options,
      detachedPartialOptions
    );
    applyResolvedOptions(
      runtime,
      resolvedOptions,
      detachedPartialOptions.page !== undefined
    );
    return api;
  };

  const api = createFlipTurnApi({
    runtime,
    state,
    pageNavigationMode: () => pageNavigationMode,
    updateOptions,
    destroy,
  });

  const init = (options: Partial<FlipTurnOptions> = {}): FlipTurnApi => {
    if (destroyed) {
      return api;
    }

    const detachedOptions = cloneApiBoundaryOptions(options);
    const dataOptions = optionsFromDataAttributes(rootElement);
    const explicitPagesFromCaller = detachedOptions.pages !== undefined;
    const explicitPagesFromData = dataOptions.pages !== undefined;
    if (!explicitPagesFromCaller && !explicitPagesFromData) {
      dataOptions.pages = readDomPages();
      useDomPages = true;
    }

    const resolvedOptions = resolveOptions(defaultOptions, {
      ...dataOptions,
      ...detachedOptions,
    });

    if (!initialized) {
      initialized = true;
      runtime.renderer.init?.(runtime);
      initTransformSupport();
      setTransform(rootElement, translate(0, 0, true));
    }

    applyResolvedOptions(runtime, resolvedOptions, true);

    if (!lifecycleController) {
      runtime.renderer.resize?.(
        runtime,
        viewportBoxFromDomRect(rootElement.getBoundingClientRect())
      );
      ensureLifecycle();
    }

    return api;
  };

  init();
  return api;
}

export default createFlipTurn;
