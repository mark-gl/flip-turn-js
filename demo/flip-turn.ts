import { createFlipTurn } from "../src/flip-turn";

(window as unknown as Record<string, unknown>).createFlipTurn = createFlipTurn;

const defaultRoot = document.querySelector("#magazine");
const flipTurn =
  defaultRoot instanceof HTMLDivElement ? createFlipTurn(defaultRoot) : null;
if (flipTurn) {
  (window as unknown as Record<string, unknown>).flipTurn = flipTurn;
}
