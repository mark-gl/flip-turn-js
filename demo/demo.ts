import type { DisplayMode } from "../src/core/types";
import { createFlipTurn } from "../src/flip-turn";

const root = document.querySelector("#magazine");
if (!(root instanceof HTMLDivElement)) throw new Error("Missing #magazine");

const flipTurn = createFlipTurn(root);

const btnDouble = document.querySelector<HTMLButtonElement>("#button-double")!;
const btnSingle = document.querySelector<HTMLButtonElement>("#button-single")!;

function setDisplay(mode: DisplayMode) {
  flipTurn.display(mode);
  btnDouble.classList.toggle("active", mode === "double");
  btnSingle.classList.toggle("active", mode === "single");
}

btnDouble.addEventListener("click", () => setDisplay("double"));
btnSingle.addEventListener("click", () => setDisplay("single"));
