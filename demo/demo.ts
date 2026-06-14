import {
  createMeshRenderer,
  createDomRenderer,
  createFlipTurn,
} from "../src/flip-turn";
import type { FlipTurnApi } from "../src/api";
import type { DisplayOption } from "../src/types/primitives";

type RendererType = "dom" | "mesh";

const rootElement = document.querySelector<HTMLDivElement>("#magazine");
if (!rootElement) throw new Error("Missing #magazine");
const root: HTMLDivElement = rootElement;

let currentDisplayOption: DisplayOption = "auto";
let currentRendererType: RendererType = "dom";

function buildRenderer(type: RendererType) {
  if (type === "dom") return createDomRenderer();
  return createMeshRenderer();
}

let flipTurn: FlipTurnApi = createFlipTurn(root, {
  renderer: buildRenderer(currentRendererType),
  options: { display: currentDisplayOption },
});

const displayRadios = document.querySelectorAll<HTMLInputElement>(
  'input[name="display"]'
);
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
const btnRenderer =
  document.querySelector<HTMLButtonElement>("#button-renderer");

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

function setDisplay(option: DisplayOption) {
  currentDisplayOption = option;
  flipTurn.display = option;
  root.dataset.display = option;
  for (const radio of displayRadios) {
    radio.checked = radio.value === option;
  }
}

function syncRendererButton() {
  const css3dEnabled = currentRendererType === "mesh";
  btnRenderer?.classList.toggle("active", css3dEnabled);
  if (btnRenderer) {
    btnRenderer.textContent = `3D renderer: ${css3dEnabled ? "on" : "off"}`;
  }
}

function setRenderer(type: RendererType) {
  if (type === currentRendererType) return;

  const savedPage = flipTurn.page;
  flipTurn.destroy();
  currentRendererType = type;

  flipTurn = createFlipTurn(root, {
    renderer: buildRenderer(type),
    options: {
      page: savedPage,
      display: currentDisplayOption,
      hard: hardCoverModeEnabled ? "cover" : false,
      hardThickness: hardCoverThickness,
    },
  });

  root.classList.add("is-ready");
  syncRendererButton();
}

for (const radio of displayRadios) {
  radio.addEventListener("change", () => {
    if (radio.checked) {
      setDisplay(radio.value as DisplayOption);
    }
  });
}

btnHardCovers?.addEventListener("click", () => {
  setHardCoverMode(!hardCoverModeEnabled);
});

btnRenderer?.addEventListener("click", () => {
  setRenderer(currentRendererType === "dom" ? "mesh" : "dom");
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

setDisplay(currentDisplayOption);
syncHardCoverThicknessLabel();
setHardCoverMode(false);
syncRendererButton();
root.classList.add("is-ready");
