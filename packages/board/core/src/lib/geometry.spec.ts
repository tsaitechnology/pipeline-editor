import type { BoardNode } from '@tsai-pe/shared/models';
import {
  boundsOf,
  cellToPx,
  clamp,
  edgePath,
  GRID_CELL,
  nodeRect,
  portAnchor,
  rectContains,
  rectsIntersect,
  snapToCell,
} from './geometry';

function node(): BoardNode {
  return {
    id: 'n',
    kind: 'action',
    category: 'transform',
    title: 'N',
    pos: { col: 2, row: 3 },
    size: { cols: 4, rows: 2 },
    ports: [
      { id: 'in', role: 'input', side: 'left' },
      { id: 'out', role: 'output', side: 'right' },
    ],
  };
}

describe('clamp', () => {
  it('bounds a value to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('cellToPx / snapToCell', () => {
  it('maps a cell to its top-left world pixel', () => {
    expect(cellToPx({ col: 2, row: 3 })).toEqual({ x: 64, y: 96 });
  });

  it('snaps a world point to the nearest cell (round)', () => {
    expect(snapToCell({ x: 70, y: 90 })).toEqual({ col: 2, row: 3 });
    expect(snapToCell({ x: 80, y: 80 })).toEqual({ col: 3, row: 3 });
  });
});

describe('nodeRect', () => {
  it('scales grid pos/size by GRID_CELL', () => {
    expect(nodeRect(node())).toEqual({ x: 64, y: 96, width: 128, height: 64 });
  });
});

describe('portAnchor', () => {
  const n = node();

  it('anchors a lone left input at the middle of the left edge', () => {
    const input = n.ports[0];
    expect(portAnchor(n, input)).toEqual({ x: 64, y: 96 + 32 });
  });

  it('anchors a lone right output at the middle of the right edge', () => {
    const output = n.ports[1];
    expect(portAnchor(n, output)).toEqual({ x: 64 + 128, y: 96 + 32 });
  });
});

describe('rectContains', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };

  it('includes interior and edge points', () => {
    expect(rectContains(rect, { x: 50, y: 25 })).toBe(true);
    expect(rectContains(rect, { x: 0, y: 0 })).toBe(true);
    expect(rectContains(rect, { x: 100, y: 50 })).toBe(true);
  });

  it('excludes outside points', () => {
    expect(rectContains(rect, { x: 101, y: 25 })).toBe(false);
  });
});

describe('rectsIntersect', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 20, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('treats edge-touching as non-overlapping', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('boundsOf', () => {
  it('is an empty rect for no inputs', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('encloses all rectangles', () => {
    expect(
      boundsOf([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 30, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 30, height: 40 });
  });
});

describe('edgePath', () => {
  it('produces a cubic bezier starting and ending at the anchors', () => {
    const d = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d.startsWith('M 0,0 C')).toBe(true);
    expect(d.endsWith('100,0')).toBe(true);
  });
});

it('GRID_CELL is 32', () => {
  expect(GRID_CELL).toBe(32);
});
