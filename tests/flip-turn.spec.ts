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

async function openDouble(page: Page) {
  await page.goto("/");
  await waitForMagazine(page);
  await page.setViewportSize({ width: 1152, height: 752 });
  await page.addStyleTag({
    content: `
      body {
        margin: 0;
        padding: 0;
        background: #ccc;
      }
    `,
  });
}

async function turnForwardByDrag(page: Page) {
  const box = await getMagazineBox(page);
  const startX = box.x + box.width - 5;
  const startY = box.y + box.height - 5;
  const endX = box.x + 5;
  const endY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await waitForRender(page);
}

async function openSingle(page: Page) {
  await page.goto("/single");
  await waitForMagazine(page);
}

function registerPlaywrightSuite() {
  test.describe("turn.js parity snapshots", () => {
    test("double initial", async ({ page }) => {
      await openDouble(page);
      await expect(page).toHaveScreenshot("double-initial.png");
    });

    test("double mid-curl top right corner", async ({ page }) => {
      await openDouble(page);
      const box = await getMagazineBox(page);
      const rightEdge = box.x + box.width - 5;
      const topEdge = box.y + 5;
      const targetX = box.x + box.width * 0.65;
      const targetY = box.y + box.height * 0.35;

      await dragToPoint(page, rightEdge, topEdge, targetX, targetY);
      await expect(page).toHaveScreenshot("double-mid-curl-top-right.png");
      await page.mouse.up();
    });

    test("double mid-curl bottom right corner", async ({ page }) => {
      await openDouble(page);
      const box = await getMagazineBox(page);
      const rightEdge = box.x + box.width - 5;
      const bottomEdge = box.y + box.height - 5;
      const targetX = box.x + box.width * 0.65;
      const targetY = box.y + box.height * 0.65;

      await dragToPoint(page, rightEdge, bottomEdge, targetX, targetY);
      await expect(page).toHaveScreenshot("double-mid-curl-bottom-right.png");
      await page.mouse.up();
    });

    test("double mid-curl bottom left corner", async ({ page }) => {
      await openDouble(page);
      await turnForwardByDrag(page);
      const box = await getMagazineBox(page);
      const leftEdge = box.x + 5;
      const bottomEdge = box.y + box.height - 5;
      const targetX = box.x + box.width * 0.35;
      const targetY = box.y + box.height * 0.65;

      await dragToPoint(page, leftEdge, bottomEdge, targetX, targetY);
      await expect(page).toHaveScreenshot("double-mid-curl-bottom-left.png");
      await page.mouse.up();
    });

    test("double mid-curl top left corner", async ({ page }) => {
      await openDouble(page);
      await turnForwardByDrag(page);
      const box = await getMagazineBox(page);
      const leftEdge = box.x + 5;
      const topEdge = box.y + 5;
      const targetX = box.x + box.width * 0.35;
      const targetY = box.y + box.height * 0.35;

      await dragToPoint(page, leftEdge, topEdge, targetX, targetY);
      await expect(page).toHaveScreenshot("double-mid-curl-top-left.png");
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
      await expect(page.locator("#magazine")).toHaveScreenshot(
        "single-mid-curl.png"
      );
      await page.mouse.up();
    });
  });
}

registerPlaywrightSuite();
