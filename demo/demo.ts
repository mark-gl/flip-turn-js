import { createFlipTurn } from "../src/flip-turn";
import type { DisplayMode } from "../src/types/primitives";

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
const btnHardCovers = document.querySelector<HTMLButtonElement>(
  "#button-hard-covers"
);
const hardCoverThicknessInput = document.querySelector<HTMLInputElement>(
  "#hard-cover-thickness"
);
const hardCoverThicknessSetting = document.querySelector<HTMLLabelElement>(
  "#hard-cover-thickness-setting"
);
const hardCoverThicknessValue = document.querySelector<HTMLSpanElement>(
  "#hard-cover-thickness-value"
);

let hardCoverModeEnabled = false;
let hardCoverThickness = 8;

function syncHardCoverThicknessLabel() {
  if (hardCoverThicknessValue) {
    hardCoverThicknessValue.textContent = `${hardCoverThickness}px`;
  }
}

function setHardCoverMode(enabled: boolean) {
  hardCoverModeEnabled = enabled;
  hardCoverThicknessSetting?.toggleAttribute("hidden", !enabled);
  if (hardCoverThicknessInput) {
    hardCoverThicknessInput.disabled = !enabled;
  }
  flipTurn.update({
    hard: enabled ? "cover" : false,
    hardThickness: hardCoverThickness,
  });
  btnHardCovers?.classList.toggle("active", enabled);
  if (btnHardCovers) {
    btnHardCovers.textContent = `Hard covers: ${enabled ? "on" : "off"}`;
  }
}

function setDisplay(mode: DisplayMode) {
  flipTurn.display = mode;
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

btnHardCovers?.addEventListener("click", () => {
  setHardCoverMode(!hardCoverModeEnabled);
});

hardCoverThicknessInput?.addEventListener("input", () => {
  const parsedThickness = Number.parseInt(hardCoverThicknessInput.value, 10);
  hardCoverThickness = Number.isFinite(parsedThickness)
    ? Math.max(0, parsedThickness)
    : 0;
  syncHardCoverThicknessLabel();

  if (hardCoverModeEnabled) {
    flipTurn.update({ hardThickness: hardCoverThickness });
  }
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
syncHardCoverThicknessLabel();
setHardCoverMode(false);
root.classList.add("is-ready");
