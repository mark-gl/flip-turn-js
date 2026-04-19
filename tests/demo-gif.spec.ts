import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const framesPerSecond = 50;
const settleFrameCount = 60;
const playbackSpeedMultiplier = 1.0;
const dragSteps = 36;
const dragControlXRatio = 0.5;
const dragControlYRatio = 0.1;
const capturePadding = 80;
const targetGifSizeBytes = 10 * 1024 * 1024;
const renderScale = 0.7;
const gifsicleSettings = {
  colors: 176,
  lossy: 110,
};

type Point = { x: number; y: number };

function easeInOutSine(progress: number) {
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

async function waitForMagazine(page: Page) {
  await page
    .locator("#magazine .flip-turn-page")
    .first()
    .waitFor({ state: "attached", timeout: 2000 });
}

async function waitForRender(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

async function getMagazineBox(page: Page) {
  const box = await page.locator("#magazine").boundingBox();
  if (!box) {
    throw new Error("#magazine element not found");
  }

  return box;
}

async function openDouble(page: Page) {
  await page.goto("/");
  await waitForMagazine(page);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.addStyleTag({
    content: `
      html {
        background: transparent;
      }

      body {
        margin: 0;
        padding: 0;
        background: transparent;
        display: block;
        min-height: 0;
      }

      .settings {
        display: none;
      }

      #magazine {
        margin: ${capturePadding}px;
      }

      #magazine:focus,
      #magazine:focus-visible,
      #magazine .flip-turn-viewport:focus,
      #magazine .flip-turn-viewport:focus-visible,
      #magazine :focus,
      #magazine :focus-visible {
        outline: 2px solid transparent !important;
        outline-color: transparent !important;
        outline-offset: 0 !important;
        box-shadow: none !important;
      }
    `,
  });
}

async function captureFrame(
  page: Page,
  framesDirectory: string,
  frameIndex: number,
  captureClip: { x: number; y: number; width: number; height: number }
) {
  const framePath = path.join(
    framesDirectory,
    `frame-${String(frameIndex).padStart(4, "0")}.png`
  );

  await page.screenshot({
    path: framePath,
    clip: captureClip,
    omitBackground: true,
  });
}

async function captureSettleFrames(
  page: Page,
  framesDirectory: string,
  startFrameIndex: number,
  frameCount: number,
  captureClip: { x: number; y: number; width: number; height: number }
) {
  let frameIndex = startFrameIndex;

  for (let settleIndex = 0; settleIndex < frameCount; settleIndex += 1) {
    await waitForRender(page);
    await captureFrame(page, framesDirectory, frameIndex, captureClip);
    frameIndex += 1;
  }

  return frameIndex;
}

async function settleWithoutCapture(page: Page, frameCount: number) {
  for (let settleIndex = 0; settleIndex < frameCount; settleIndex += 1) {
    await waitForRender(page);
  }
}

async function dragAndCapture(
  page: Page,
  framesDirectory: string,
  start: Point,
  end: Point,
  steps: number,
  startFrameIndex: number,
  captureClip: { x: number; y: number; width: number; height: number },
  controlPoint?: Point
) {
  let frameIndex = startFrameIndex;

  const control: Point = {
    x: controlPoint?.x ?? start.x + (end.x - start.x) * dragControlXRatio,
    y: controlPoint?.y ?? start.y + (end.y - start.y) * dragControlYRatio,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const easedProgress = easeInOutSine(progress);
    const inverseProgress = 1 - easedProgress;
    const x =
      inverseProgress * inverseProgress * start.x +
      2 * inverseProgress * easedProgress * control.x +
      easedProgress * easedProgress * end.x;
    const y =
      inverseProgress * inverseProgress * start.y +
      2 * inverseProgress * easedProgress * control.y +
      easedProgress * easedProgress * end.y;

    await page.mouse.move(x, y);
    await waitForRender(page);
    await captureFrame(page, framesDirectory, frameIndex, captureClip);
    frameIndex += 1;
  }

  await page.mouse.up();

  return frameIndex;
}

async function dragWithoutCapture(
  page: Page,
  start: Point,
  end: Point,
  steps: number,
  controlPoint?: Point
) {
  const control: Point = {
    x: controlPoint?.x ?? start.x + (end.x - start.x) * dragControlXRatio,
    y: controlPoint?.y ?? start.y + (end.y - start.y) * dragControlYRatio,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const easedProgress = easeInOutSine(progress);
    const inverseProgress = 1 - easedProgress;
    const x =
      inverseProgress * inverseProgress * start.x +
      2 * inverseProgress * easedProgress * control.x +
      easedProgress * easedProgress * end.x;
    const y =
      inverseProgress * inverseProgress * start.y +
      2 * inverseProgress * easedProgress * control.y +
      easedProgress * easedProgress * end.y;

    await page.mouse.move(x, y);
    await waitForRender(page);
  }

  await page.mouse.up();
}

function renderGifWithFfmpeg(
  framesDirectory: string,
  outputGifPath: string,
  palettePath: string
) {
  const formatMegabytes = (sizeInBytes: number) =>
    `${(sizeInBytes / 1024 / 1024).toFixed(2)}MB`;

  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("Please install ffmpeg to generate GIF output");
  }

  const framePattern = path.join(framesDirectory, "frame-*.png");
  const capturedFrames = readdirSync(framesDirectory).filter(
    (fileName) => fileName.startsWith("frame-") && fileName.endsWith(".png")
  );

  const scaleExpression = (scale: number) =>
    `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2:flags=lanczos`;

  const renderBaselineGif = (scale: number) => {
    const resizeFilter = scaleExpression(scale);

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-stats",
        "-framerate",
        String(framesPerSecond),
        "-pattern_type",
        "glob",
        "-i",
        framePattern,
        "-vf",
        `${resizeFilter},palettegen=stats_mode=diff:max_colors=256:reserve_transparent=1`,
        "-frames:v",
        "1",
        "-update",
        "1",
        palettePath,
      ],
      { stdio: "inherit" }
    );

    console.log(`Rendering baseline GIF...`);

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-stats",
        "-framerate",
        String(framesPerSecond),
        "-pattern_type",
        "glob",
        "-i",
        framePattern,
        "-i",
        palettePath,
        "-lavfi",
        `fps=${framesPerSecond},${resizeFilter},setpts=PTS/${playbackSpeedMultiplier}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle:alpha_threshold=120`,
        "-gifflags",
        "+transdiff",
        "-loop",
        "0",
        outputGifPath,
      ],
      { stdio: "inherit" }
    );
  };

  if (capturedFrames.length === 0) {
    throw new Error("No PNG frames were captured for GIF rendering");
  }

  renderBaselineGif(renderScale);

  const initialSize = statSync(outputGifPath).size;
  if (initialSize <= targetGifSizeBytes) {
    console.log(`Generated ${formatMegabytes(initialSize)}MB GIF file.`);
    return;
  }

  try {
    execFileSync("gifsicle", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      `Generated GIF is ${(initialSize / 1024 / 1024).toFixed(2)}MB (above 10MB target). Install gifsicle for additional compression.`
    );
  }

  execFileSync(
    "gifsicle",
    [
      "--batch",
      "--optimize=3",
      "--careful",
      `--colors=${gifsicleSettings.colors}`,
      `--lossy=${gifsicleSettings.lossy}`,
      outputGifPath,
    ],
    { stdio: "inherit" }
  );

  const compressedSize = statSync(outputGifPath).size;

  if (compressedSize <= targetGifSizeBytes) {
    console.log(`Compressed GIF to ${formatMegabytes(compressedSize)}`);
    return;
  }

  const finalSize = statSync(outputGifPath).size;
  throw new Error(
    `Unable to reduce GIF below 10MB (final size ${(finalSize / 1024 / 1024).toFixed(2)}MB)`
  );
}

test.describe("demo gif generation", () => {
  test("creates a looping demo gif", async ({ page }) => {
    test.setTimeout(120_000);

    const workspaceRoot = process.cwd();
    const outputDirectory = path.join(workspaceRoot, "demo");
    const framesDirectory = path.join(outputDirectory, "loop-frames");
    const outputGifPath = path.join(outputDirectory, "loop.gif");
    const palettePath = path.join(outputDirectory, "palette.png");

    await rm(framesDirectory, { recursive: true, force: true });
    await rm(palettePath, { force: true });
    await mkdir(framesDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    try {
      await openDouble(page);
      const box = await getMagazineBox(page);
      const captureClip = {
        x: Math.max(0, box.x - capturePadding),
        y: Math.max(0, box.y - capturePadding),
        width: box.width + capturePadding * 2,
        height: box.height + capturePadding * 2,
      };
      const topRightCorner: Point = { x: box.x + box.width - 5, y: box.y + 5 };
      const topLeftCorner: Point = { x: box.x + 5, y: box.y + 5 };
      const forwardControlPoint: Point = {
        x: box.x + box.width * 0.55,
        y: box.y + box.height * 0.22,
      };
      const backwardControlPoint: Point = {
        x: box.x + box.width * 0.45,
        y: box.y + box.height * 0.22,
      };

      await dragWithoutCapture(
        page,
        topRightCorner,
        topLeftCorner,
        dragSteps,
        forwardControlPoint
      );
      await settleWithoutCapture(page, settleFrameCount);

      let frameIndex = 0;
      await captureFrame(page, framesDirectory, frameIndex, captureClip);
      frameIndex += 1;

      frameIndex = await dragAndCapture(
        page,
        framesDirectory,
        topRightCorner,
        topLeftCorner,
        dragSteps,
        frameIndex,
        captureClip,
        forwardControlPoint
      );

      frameIndex = await captureSettleFrames(
        page,
        framesDirectory,
        frameIndex,
        settleFrameCount,
        captureClip
      );

      frameIndex = await dragAndCapture(
        page,
        framesDirectory,
        topLeftCorner,
        topRightCorner,
        dragSteps,
        frameIndex,
        captureClip,
        backwardControlPoint
      );

      frameIndex = await captureSettleFrames(
        page,
        framesDirectory,
        frameIndex,
        settleFrameCount,
        captureClip
      );

      await captureFrame(page, framesDirectory, frameIndex, captureClip);

      renderGifWithFfmpeg(framesDirectory, outputGifPath, palettePath);

      await expect(page.locator("#magazine")).toBeVisible();
    } finally {
      await rm(framesDirectory, { recursive: true, force: true });
      await rm(palettePath, { force: true });
    }
  });
});
