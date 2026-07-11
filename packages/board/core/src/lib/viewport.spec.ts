import { Viewport } from './viewport';

describe('Viewport', () => {
  it('starts at origin, zoom 1', () => {
    const vp = new Viewport();
    expect(vp.pan()).toEqual({ x: 0, y: 0 });
    expect(vp.zoom()).toBe(1);
  });

  it('pans by a delta', () => {
    const vp = new Viewport();
    vp.panBy({ x: 10, y: -5 });
    vp.panBy({ x: 2, y: 5 });
    expect(vp.pan()).toEqual({ x: 12, y: 0 });
  });

  it('clamps zoom to the allowed range', () => {
    const vp = new Viewport();
    vp.setZoom(99);
    expect(vp.zoom()).toBeLessThanOrEqual(2.5);
    vp.setZoom(0.001);
    expect(vp.zoom()).toBeGreaterThanOrEqual(0.35);
  });

  it('keeps the anchor point fixed when zooming around it', () => {
    const vp = new Viewport();
    const anchor = { x: 200, y: 150 };
    const before = vp.screenToBoard(anchor);
    vp.zoomAround(anchor, 1.5);
    const after = vp.screenToBoard(anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('round-trips screen ↔ board coordinates', () => {
    const vp = new Viewport();
    vp.setPan({ x: 30, y: -20 });
    vp.setZoom(1.5);
    const screen = { x: 123, y: 45 };
    const back = vp.boardToScreen(vp.screenToBoard(screen));
    expect(back.x).toBeCloseTo(screen.x, 6);
    expect(back.y).toBeCloseTo(screen.y, 6);
  });

  it('reflects transform as a CSS string', () => {
    const vp = new Viewport();
    vp.setPan({ x: 10, y: 20 });
    vp.setZoom(2);
    expect(vp.transform()).toBe('translate(10px, 20px) scale(2)');
  });

  it('fits content centered within the viewport', () => {
    const vp = new Viewport();
    vp.fitTo({ x: 0, y: 0, width: 100, height: 100 }, { width: 500, height: 500 });
    // content centre (50,50) should map to viewport centre (250,250)
    expect(vp.boardToScreen({ x: 50, y: 50 }).x).toBeCloseTo(250, 6);
    expect(vp.boardToScreen({ x: 50, y: 50 }).y).toBeCloseTo(250, 6);
  });

  it('resets pan and zoom', () => {
    const vp = new Viewport();
    vp.setPan({ x: 5, y: 5 });
    vp.setZoom(2);
    vp.reset();
    expect(vp.pan()).toEqual({ x: 0, y: 0 });
    expect(vp.zoom()).toBe(1);
  });
});
