let has3dTransforms: boolean | undefined;

export function initTransformSupport() {
  if (has3dTransforms !== undefined) {
    return;
  }

  has3dTransforms =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("transform", "translate3d(0,0,0)");
}

export function translate(x: number, y: number, use3d = true): string {
  if (has3dTransforms && use3d) {
    return ` translate3d(${x}px,${y}px, 0px) `;
  }
  return ` translate(${x}px, ${y}px) `;
}

export function rotate(degrees: number): string {
  return ` rotate(${degrees}deg) `;
}

export function setTransform(
  element: HTMLElement,
  transformValue: string,
  transformOrigin?: string
) {
  element.style.transform = transformValue;
  if (transformOrigin) {
    element.style.transformOrigin = transformOrigin;
  }
}
