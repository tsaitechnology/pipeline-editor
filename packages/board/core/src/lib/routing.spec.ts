import type { BoardNode } from '@tsai-pe/shared/models';
import { routeEdge } from './routing';

/** A blocking node occupying the given grid cell + footprint. */
function blocker(col: number, row: number, cols = 4, rows = 2): BoardNode {
  return {
    id: `b-${col}-${row}`,
    kind: 'action',
    category: 'transform',
    title: 'B',
    pos: { col, row },
    size: { cols, rows },
    ports: [],
  };
}

const NONE = new Set<string>();

describe('routeEdge', () => {
  it('routes a clear horizontal connection', () => {
    const route = routeEdge(
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      'right',
      'left',
      [],
      NONE,
    );
    expect(route).not.toBeNull();
    expect(route?.path.startsWith('M ')).toBe(true);
    expect(route?.cells.length).toBeGreaterThan(0);
  });

  it('detours around a node blocking the straight line (adds a bend)', () => {
    // Node centred on the y=100 line between the endpoints.
    const route = routeEdge(
      { x: 0, y: 100 },
      { x: 400, y: 100 },
      'right',
      'left',
      [blocker(6, 2)],
      NONE,
    );
    expect(route).not.toBeNull();
    // A rounded bend emits a quadratic ("Q") segment; a straight run never does.
    expect(route?.path).toContain('Q');
  });

  it('returns null when the start point sits inside a node', () => {
    const route = routeEdge(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      'right',
      'left',
      [blocker(0, 0)],
      NONE,
    );
    expect(route).toBeNull();
  });
});
