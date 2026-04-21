import type { DisplayMode } from "../src/types/primitives";
import { createFlipTurn } from "../src/flip-turn";

const rootElement = document.querySelector<HTMLDivElement>("#magazine");
if (!rootElement) throw new Error("Missing #magazine");
const root: HTMLDivElement = rootElement;

const mobileLayoutQuery = window.matchMedia(
  "(max-width: 900px), (pointer: coarse)"
);
let preferredDesktopMode: DisplayMode = "double";

const initialDisplayMode: DisplayMode = mobileLayoutQuery.matches
  ? "single"
  : preferredDesktopMode;

root.dataset.display = initialDisplayMode;
root.classList.toggle("flip-turn-single", initialDisplayMode === "single");
document.body.classList.toggle("mobile-single", mobileLayoutQuery.matches);

const flipTurn = createFlipTurn(root);

const btnDouble = document.querySelector<HTMLButtonElement>("#button-double");
const btnSingle = document.querySelector<HTMLButtonElement>("#button-single");

function setDisplay(mode: DisplayMode) {
  flipTurn.display(mode);
  root.dataset.display = mode;
  root.classList.toggle("flip-turn-single", mode === "single");
  btnDouble?.classList.toggle("active", mode === "double");
  btnSingle?.classList.toggle("active", mode === "single");
}

btnDouble?.addEventListener("click", () => {
  preferredDesktopMode = "double";
  setDisplay("double");
});

btnSingle?.addEventListener("click", () => {
  preferredDesktopMode = "single";
  setDisplay("single");
});

function applyResponsiveDisplayMode() {
  const isMobileLayout = mobileLayoutQuery.matches;
  document.body.classList.toggle("mobile-single", isMobileLayout);

  if (isMobileLayout) {
    setDisplay("single");
    return;
  }

  setDisplay(preferredDesktopMode);
}

mobileLayoutQuery.addEventListener("change", applyResponsiveDisplayMode);

setDisplay(initialDisplayMode);
root.classList.add("is-ready");
