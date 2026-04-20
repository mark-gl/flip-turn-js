import { expect, test, type Page } from "@playwright/test";

async function waitForMagazine(page: Page) {
  await page
    .locator("#magazine .flip-turn-page")
    .first()
    .waitFor({ state: "attached", timeout: 1000 });
}

async function getMagazineBox(page: Page) {
  const box = await page.locator("#magazine").boundingBox();
  if (!box) throw new Error("#magazine element not found");
  return box;
}

async function waitForRender(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

async function dragToPoint(
  page: Page,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number
) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 24 });
  await waitForRender(page);
}

async function expectFlipInProgress(page: Page) {
  await expect(page.locator("#magazine")).toHaveClass(/flip-turn-flipping/);
}

async function openDouble(page: Page) {
  await page.goto("/");
  await waitForMagazine(page);
  await page.setViewportSize({ width: 1152, height: 752 });
  await page.addStyleTag({
    content: `
      html {
        overflow: hidden;
      }

      body {
        margin: 0;
        padding: 0;
        background: #ccc;
        display: block;
        min-height: 0;
        overflow: hidden;
      }

      .page-toolbar,
      .demo-main {
        display: block;
        margin: 0;
        padding: 0;
        min-height: 0;
      }

      .page-toolbar {
        display: none;
      }

      .settings {
        display: none;
      }

      #magazine {
        margin: 0;
        width: 1152px !important;
        height: 752px !important;
        max-width: none !important;
        aspect-ratio: auto !important;
      }

      #magazine.flip-turn-single {
        width: 576px !important;
        height: 752px !important;
        aspect-ratio: auto !important;
      }

      #magazine .flip-turn-viewport {
        width: 100% !important;
        height: 100% !important;
      }
    `,
  });
}

async function turnForwardByDrag(page: Page) {
  const box = await getMagazineBox(page);
  const startX = box.x + box.width - 5;
  const startY = box.y + 5;
  const endX = box.x + box.width * 0.35;
  const endY = box.y + box.height * 0.45;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 30 });
  await page.mouse.up();
}

async function hasLeftPageVisible(page: Page): Promise<boolean> {
  return (await page.locator("#base-left > *").count()) > 0;
}

async function turnToSecondSpread(page: Page) {
  if (await hasLeftPageVisible(page)) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await turnForwardByDrag(page);

    try {
      await expect
        .poll(() => hasLeftPageVisible(page), {
          timeout: 2000,
        })
        .toBe(true);

      await waitForRender(page);
      return;
    } catch {
      // Retry dragging in case the turn didn't work
    }
  }
}

async function openSingle(page: Page) {
  await openDouble(page);
  await page.locator("#button-single").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.locator("#magazine")).toHaveClass(/flip-turn-single/);
}

function registerPlaywrightSuite() {
  test.describe("visual snapshot tests", () => {
    test("double initial", async ({ page }) => {
      await openDouble(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "double-initial.png"
      );
    });

    test("double mid-curl top right corner", async ({ page }) => {
      await openDouble(page);
      const box = await getMagazineBox(page);
      const rightEdge = box.x + box.width - 5;
      const topEdge = box.y + 5;
      const targetX = box.x + box.width * 0.65;
      const targetY = box.y + box.height * 0.35;

      await dragToPoint(page, rightEdge, topEdge, targetX, targetY);
      await expectFlipInProgress(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "double-mid-curl-top-right.png"
      );
      await page.mouse.up();
    });

    test("double mid-curl bottom right corner", async ({ page }) => {
      await openDouble(page);
      const box = await getMagazineBox(page);
      const rightEdge = box.x + box.width - 5;
      const bottomEdge = box.y + box.height - 5;
      const targetX = box.x + box.width * 0.72;
      const targetY = box.y + box.height * 0.78;

      await dragToPoint(page, rightEdge, bottomEdge, targetX, targetY);
      await expectFlipInProgress(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "double-mid-curl-bottom-right.png"
      );
      await page.mouse.up();
    });

    test("double mid-curl bottom left corner", async ({ page }) => {
      await openDouble(page);
      await turnToSecondSpread(page);
      const box = await getMagazineBox(page);
      const leftEdge = box.x + 5;
      const bottomEdge = box.y + box.height - 5;
      const targetX = box.x + box.width * 0.28;
      const targetY = box.y + box.height * 0.78;

      await dragToPoint(page, leftEdge, bottomEdge, targetX, targetY);
      await expectFlipInProgress(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "double-mid-curl-bottom-left.png"
      );
      await page.mouse.up();
    });

    test("double mid-curl top left corner", async ({ page }) => {
      await openDouble(page);
      await turnToSecondSpread(page);
      const box = await getMagazineBox(page);
      const leftEdge = box.x + 5;
      const topEdge = box.y + 5;
      const targetX = box.x + box.width * 0.35;
      const targetY = box.y + box.height * 0.35;

      await dragToPoint(page, leftEdge, topEdge, targetX, targetY);
      await expectFlipInProgress(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "double-mid-curl-top-left.png"
      );
      await page.mouse.up();
    });

    test("single initial", async ({ page }) => {
      await openSingle(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "single-initial.png"
      );
    });

    test("single mid-curl", async ({ page }) => {
      await openSingle(page);
      const box = await getMagazineBox(page);
      const rightEdge = box.x + box.width - 5;
      const topEdge = box.y + 5;
      const targetX = box.x + box.width * 0.65;
      const targetY = box.y + box.height * 0.35;

      await dragToPoint(page, rightEdge, topEdge, targetX, targetY);
      await expectFlipInProgress(page);
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "single-mid-curl.png"
      );
      await page.mouse.up();
    });
  });
}

registerPlaywrightSuite();
