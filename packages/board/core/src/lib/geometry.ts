import type {
  BoardNode,
  GridPos,
  NodePort,
  Point,
  PortSide,
  Rect,
} from '@tsai-pe/shared/models';

/** Size of one node-grid cell, in board (world) pixels. */
export const GRID_CELL = 32;

/**
 * Size of one connection-routing subcell, in board pixels. 32 / 16 = 2, so each
 * node cell contains a 2×2 block of subcells (~4 per cell).
 */
export const GRID_SUBCELL = 16;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Top-left corner of a grid cell in world pixels. */
export function cellToPx(pos: GridPos): Point {
  return { x: pos.col * GRID_CELL, y: pos.row * GRID_CELL };
}

/** Snap a world-pixel point to the nearest 32-grid cell. */
export function snapToCell(point: Point): GridPos {
  return {
    col: Math.round(point.x / GRID_CELL),
    row: Math.round(point.y / GRID_CELL),
  };
}

/** A node's bounding rectangle in world pixels. */
export function nodeRect(node: BoardNode): Rect {
  return {
    x: node.pos.col * GRID_CELL,
    y: node.pos.row * GRID_CELL,
    width: node.size.cols * GRID_CELL,
    height: node.size.rows * GRID_CELL,
  };
}

/** World-pixel position of a port anchor on a node. */
export function portAnchor(node: BoardNode, port: NodePort): Point {
  const r = nodeRect(node);
  switch (port.side) {
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
    case 'top':
      return { x: r.x + r.width / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.width / 2, y: r.y + r.height };
  }
}

/** Whether a point lies within a rectangle (inclusive of edges). */
export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Whether two axis-aligned rectangles overlap. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Bounding rectangle enclosing all given rectangles (empty rect if none). */
export function boundsOf(rects: readonly Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Outward unit normal for a port side — the direction its connection leaves. */
function sideNormal(side: PortSide): Point {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

/**
 * SVG cubic-bezier path between two anchors. Tangents leave along each port's
 * outward normal (right/top/bottom output, left input), giving the familiar
 * n8n / flow-editor look regardless of which side a port sits on.
 */
export function edgePath(
  from: Point,
  to: Point,
  fromSide: PortSide = 'right',
  toSide: PortSide = 'left',
): string {
  const reach = Math.max(48, Math.hypot(to.x - from.x, to.y - from.y) * 0.4);
  const f = sideNormal(fromSide);
  const t = sideNormal(toSide);
  const c1x = from.x + f.x * reach;
  const c1y = from.y + f.y * reach;
  const c2x = to.x + t.x * reach;
  const c2y = to.y + t.y * reach;
  return `M ${from.x},${from.y} C ${c1x},${c1y} ${c2x},${c2y} ${to.x},${to.y}`;
}
