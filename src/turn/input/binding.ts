import type { FlipTurnRuntime } from "../../types/renderer";
import { requestTurn } from "../commands";
import { bindPointerEvents } from "./pointer";

const boundInputRuntimes = new WeakSet<FlipTurnRuntime>();

function inputViewport(runtime: FlipTurnRuntime): HTMLElement {
  return runtime.viewport;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || target.matches("input, textarea, select");
}

export function bindInputEvents(
  runtime: FlipTurnRuntime,
  signal?: AbortSignal
) {
  if (boundInputRuntimes.has(runtime)) {
    return;
  }

  boundInputRuntimes.add(runtime);

  const bind = <T extends Event>(
    target: EventTarget,
    eventName: string,
    listener: (event: T) => void
  ) => {
    const wrappedListener: EventListener = (event) => {
      listener(event as T);
    };

    target.addEventListener(eventName, wrappedListener, { signal });
  };

  const viewport = inputViewport(runtime);

  if (viewport.tabIndex < 0) {
    viewport.tabIndex = 0;
  }

  bind<KeyboardEvent>(viewport, "keydown", (event) => {
    if (isEditableElement(event.target)) {
      return;
    }

    const direction =
      event.key === "ArrowRight"
        ? "forward"
        : event.key === "ArrowLeft"
          ? "backward"
          : null;

    if (!direction) {
      return;
    }

    event.preventDefault();

    const state = runtime.state;
    if (!state.interactionEnabled) {
      return;
    }

    requestTurn(runtime, direction, "keyboard");
  });

  bindPointerEvents(runtime, viewport, bind);
}
