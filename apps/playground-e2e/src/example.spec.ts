import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function expectBoardGridAndEdges(page: Page) {
  const renderState = await page.evaluate(() => {
    const alphaFromBackground = (background: string) => {
      const rgba = /rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/.exec(background);
      if (rgba) return Number(rgba[1]);
      return background.includes('rgb(') ? 1 : 0;
    };
    const grid = document.querySelector('pe-board-grid div');
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const gridBackground = gridStyle?.backgroundImage ?? '';
    const edgeGroups = [
      ...document.querySelectorAll(
        'pe-pipeline-edge-layer svg g[pe-pipeline-edge]',
      ),
    ];
    const visibleEdges = [
      ...document.querySelectorAll('pe-pipeline-edge-layer path[marker-end]'),
    ].filter((path) => {
      const stroke = getComputedStyle(path).stroke;
      return stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)';
    });

    return {
      gridBackground,
      gridBackgroundSize: gridStyle?.backgroundSize ?? '',
      gridDotAlpha: alphaFromBackground(gridBackground),
      customEdgeHosts: document.querySelectorAll('pe-pipeline-edge').length,
      edgeGroupCount: edgeGroups.length,
      edgeGroupsInSvgNamespace: edgeGroups.every(
        (group) => group.namespaceURI === 'http://www.w3.org/2000/svg',
      ),
      visibleEdgeCount: visibleEdges.length,
    };
  });

  expect(renderState.gridBackground).toContain('radial-gradient');
  expect(renderState.gridBackgroundSize).toMatch(
    /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/,
  );
  expect(renderState.gridDotAlpha).toBeGreaterThan(0);
  expect(renderState.customEdgeHosts).toBe(0);
  expect(renderState.edgeGroupCount).toBeGreaterThan(0);
  expect(renderState.edgeGroupsInSvgNamespace).toBe(true);
  expect(renderState.visibleEdgeCount).toBeGreaterThan(0);
}

test('the board editor loads', async ({ page }) => {
  await page.goto('/board');

  // The editor host and its always-available toolbar render.
  await expect(page.locator('pe-board')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  await expectBoardGridAndEdges(page);
});

test('the board playground fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/board');

  await expect(page.locator('pe-board')).toBeVisible();
  await expect(page.getByText('On mobile, tap palette items')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the ui kit playground fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui-kit');

  await expect(page.getByRole('heading', { name: 'Buttons' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the pipeline ui kit playground renders composable primitives', async ({
  page,
}) => {
  await page.goto('/pipeline-ui-kit');

  await expect(
    page.getByRole('heading', { name: 'Pipeline UI Kit' }),
  ).toBeVisible();
  await expect(page.locator('pe-board-surface')).toBeVisible();
  await expect(page.locator('pe-pipeline-node')).toHaveCount(3);
  await expect(
    page.locator('pe-pipeline-edge-layer path[marker-end]'),
  ).toHaveCount(2);
  await expectBoardGridAndEdges(page);

  await page.getByText('Webhook').first().click();
  await expect(
    page.getByRole('heading', { name: 'Node Inspector' }),
  ).toBeVisible();
});
