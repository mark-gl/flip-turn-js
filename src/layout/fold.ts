import {
  HALF_PI,
  PI,
  diagonalLength,
  distanceBetweenPoints,
  magnitude,
  point,
} from "../core/math";
import type { Corner, Point } from "../types/primitives";
import type { FoldGeometry } from "../types/renderer";
import {
  cornerPoint,
  farCornerPoint,
  isLeftCorner,
  isTopCorner,
} from "./spread";

function relativeAxis(anchor: number, value: number): number {
  return anchor ? anchor - value : value;
}

export function computeFoldGeometry(
  corner: Corner,
  sourcePoint: Point,
  pageWidth: number,
  pageHeight: number
): FoldGeometry {
  const cornerStartPoint = cornerPoint(corner, pageWidth, pageHeight);
  const initialPoint = point(sourcePoint.x, sourcePoint.y);
  const topCorner = isTopCorner(corner);
  const leftCorner = isLeftCorner(corner);

  const diagonalSize = diagonalLength(pageWidth, pageHeight);

  const computeFromPoint = (workingPoint: Point): FoldGeometry => {
    const relativePoint = point(
      relativeAxis(cornerStartPoint.x, workingPoint.x),
      relativeAxis(cornerStartPoint.y, workingPoint.y)
    );

    const tangentAngle = Math.atan2(relativePoint.y, relativePoint.x);
    const alpha = HALF_PI - tangentAngle;
    const angleDegrees = (alpha / PI) * 180;

    const middlePoint = point(
      leftCorner
        ? pageWidth - relativePoint.x / 2
        : workingPoint.x + relativePoint.x / 2,
      relativePoint.y / 2
    );

    const gamma = alpha - Math.atan2(middlePoint.y, middlePoint.x);
    const distance = Math.max(
      0,
      Math.sin(gamma) * magnitude(middlePoint.x, middlePoint.y)
    );

    const translatePoint = point(
      distance * Math.sin(alpha),
      distance * Math.cos(alpha)
    );

    if (alpha > HALF_PI) {
      translatePoint.x += Math.abs(translatePoint.y * Math.tan(tangentAngle));
      translatePoint.y = 0;

      const projectedHeight = Math.round(
        translatePoint.x * Math.tan(PI - alpha)
      );
      if (projectedHeight < pageHeight) {
        const nextY = Math.sqrt(
          pageHeight * pageHeight + 2 * middlePoint.x * relativePoint.x
        );
        const adjustedPoint = point(
          workingPoint.x,
          topCorner ? pageHeight - nextY : nextY
        );
        return computeFromPoint(adjustedPoint);
      }
    }

    let moveVector = point(0, 0);
    if (alpha > HALF_PI) {
      const beta = PI - alpha;
      const distanceFromTop = diagonalSize - pageHeight / Math.sin(beta);
      moveVector = point(
        Math.round(distanceFromTop * Math.cos(beta)),
        Math.round(distanceFromTop * Math.sin(beta))
      );

      if (leftCorner) {
        moveVector.x = -moveVector.x;
      }
      if (topCorner) {
        moveVector.y = -moveVector.y;
      }
    }

    const px = Math.round(
      translatePoint.y / Math.tan(alpha) + translatePoint.x
    );

    const side = pageWidth - px;
    const sideX = side * Math.cos(alpha * 2);
    const sideY = side * Math.sin(alpha * 2);

    const diagonalFoldPoint = point(
      Math.round(leftCorner ? side - sideX : px + sideX),
      Math.round(topCorner ? sideY : pageHeight - sideY)
    );

    const gradientSize = side * Math.sin(alpha);
    const endingPoint = farCornerPoint(corner, pageWidth, pageHeight);
    const farDistance = distanceBetweenPoints(workingPoint, endingPoint);

    const gradientOpacity =
      farDistance < pageWidth ? farDistance / pageWidth : 1;
    const gradientStart =
      gradientSize > 100 ? (gradientSize - 100) / gradientSize : 0;

    const gradientEndPointA = point(
      ((gradientSize * Math.sin(HALF_PI - alpha)) / pageHeight) * 100,
      ((gradientSize * Math.cos(HALF_PI - alpha)) / pageWidth) * 100
    );

    if (topCorner) {
      gradientEndPointA.y = 100 - gradientEndPointA.y;
    }
    if (leftCorner) {
      gradientEndPointA.x = 100 - gradientEndPointA.x;
    }

    const gradientEndPointB = point(
      ((gradientSize * Math.sin(alpha)) / pageWidth) * 100,
      ((gradientSize * Math.cos(alpha)) / pageHeight) * 100
    );

    if (!leftCorner) {
      gradientEndPointB.x = 100 - gradientEndPointB.x;
    }
    if (!topCorner) {
      gradientEndPointB.y = 100 - gradientEndPointB.y;
    }

    const roundedTranslate = point(
      Math.round(translatePoint.x),
      Math.round(translatePoint.y)
    );

    return {
      point: workingPoint,
      angleRadians: alpha,
      angleDegrees,
      alpha,
      translate: roundedTranslate,
      moveVector,
      diagonalFoldPoint,
      gradientOpacity,
      gradientStart,
      gradientEndPointA,
      gradientEndPointB,
      isTopCorner: topCorner,
      isLeftCorner: leftCorner,
    };
  };

  return computeFromPoint(initialPoint);
}
