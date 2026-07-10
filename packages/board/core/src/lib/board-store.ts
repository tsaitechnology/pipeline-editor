import { computed, signal, Signal } from '@angular/core';
import {
  type ActionCategory,
  type BoardNode,
  type CellSize,
  defaultPorts,
  type Edge,
  type EdgeEnd,
  type GridPos,
  type NodeKind,
  type NodePort,
  type Pipeline,
  type Point,
  type PortSide,
  type Rect,
} from '@tsai-pe/shared/models';
import { boundsOf, edgePath, nodeRect, portAnchor, rectsIntersect } from './geometry';
import { Viewport } from './viewport';

/** Fields needed to add a fresh node; `ports` default from its kind. */
export interface NewNode {
  kind: NodeKind;
  category?: ActionCategory;
  title: string;
  subtitle?: string;
  pos: GridPos;
  size?: CellSize;
}

/** A resolved edge ready to render: its bezier `d` plus endpoint anchors. */
export interface EdgeGeometry {
  id: string;
  path: string;
  from: Point;
  to: Point;
  selected: boolean;
}

/**
 * Signal-based board document store: nodes, edges, selection and the viewport.
 * Framework-light (only `@angular/core` signals) so it can be unit-tested and
 * reused outside a component tree.
 */
export class BoardStore {
  readonly viewport = new Viewport();

  private readonly _nodes = signal<readonly BoardNode[]>([]);
  private readonly _edges = signal<readonly Edge[]>([]);
  private readonly _selection = signal<ReadonlySet<string>>(new Set());
  private seq = 0;

  readonly nodes: Signal<readonly BoardNode[]> = this._nodes.asReadonly();
  readonly edges: Signal<readonly Edge[]> = this._edges.asReadonly();
  readonly selection: Signal<ReadonlySet<string>> = this._selection.asReadonly();

  private readonly nodeById = computed(() => {
    const map = new Map<string, BoardNode>();
    for (const node of this._nodes()) map.set(node.id, node);
    return map;
  });

  /** Edges resolved to renderable geometry (bezier path + endpoints). */
  readonly edgeGeometries: Signal<EdgeGeometry[]> = computed(() => {
    const byId = this.nodeById();
    const selected = this._selection();
    const result: EdgeGeometry[] = [];
    for (const edge of this._edges()) {
      const from = this.anchorOf(byId, edge.source.nodeId, edge.source.portId);
      const to = this.anchorOf(byId, edge.target.nodeId, edge.target.portId);
      if (!from || !to) continue;
      result.push({
        id: edge.id,
        path: edgePath(from.point, to.point, from.side, to.side),
        from: from.point,
        to: to.point,
        selected: selected.has(edge.id),
      });
    }
    return result;
  });

  /** Bounding rectangle (world px) of all nodes — for fit-to-content. */
  readonly contentBounds: Signal<Rect> = computed(() =>
    boundsOf(this._nodes().map(nodeRect)),
  );

  load(pipeline: Pipeline): void {
    this._nodes.set(pipeline.nodes);
    this._edges.set(pipeline.edges);
    this._selection.set(new Set());
    // Keep the id sequence ahead of any numeric-suffixed ids already present.
    for (const node of pipeline.nodes) {
      const n = Number(node.id.split('-').pop());
      if (Number.isFinite(n)) this.seq = Math.max(this.seq, n);
    }
  }

  /** Move a node to a new grid cell. */
  moveNode(id: string, pos: GridPos): void {
    this._nodes.update((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, pos } : n)),
    );
  }

  /** Add a new node (ports derived from its kind) and select it. Returns its id. */
  addNode(input: NewNode): string {
    const id = `node-${++this.seq}`;
    const node: BoardNode = {
      id,
      kind: input.kind,
      category: input.category,
      title: input.title,
      subtitle: input.subtitle,
      pos: input.pos,
      size: input.size ?? { cols: 6, rows: 2 },
      ports: defaultPorts(input.kind),
    };
    this._nodes.update((nodes) => [...nodes, node]);
    this.select(id);
    return id;
  }

  /** Remove a node together with any connections touching it. */
  removeNode(id: string): void {
    this._nodes.update((nodes) => nodes.filter((n) => n.id !== id));
    this._edges.update((edges) =>
      edges.filter((e) => e.source.nodeId !== id && e.target.nodeId !== id),
    );
    this._selection.update((sel) => {
      if (!sel.has(id)) return sel;
      const next = new Set(sel);
      next.delete(id);
      return next;
    });
  }

  /** Connect an output port to an input port (idempotent, 1:1). */
  connect(source: EdgeEnd, target: EdgeEnd): void {
    if (source.nodeId === target.nodeId) return;
    const id = `edge-${source.nodeId}.${source.portId}~${target.nodeId}.${target.portId}`;
    this._edges.update((edges) =>
      edges.some((e) => e.id === id)
        ? edges
        : [...edges, { id, source, target }],
    );
    this.select(id);
  }

  removeEdge(id: string): void {
    this._edges.update((edges) => edges.filter((e) => e.id !== id));
  }

  isSelected(id: string): boolean {
    return this._selection().has(id);
  }

  /** Select an id; `additive` toggles it within the current selection. */
  select(id: string, additive = false): void {
    this._selection.update((current) => {
      if (!additive) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Replace the selection with the given ids (optionally add to current). */
  selectMany(ids: readonly string[], additive = false): void {
    this._selection.set(new Set(additive ? [...this._selection(), ...ids] : ids));
  }

  /** Select every node whose rectangle intersects a world-space marquee rect. */
  selectInRect(rect: Rect, additive = false): void {
    const ids = this._nodes()
      .filter((n) => rectsIntersect(nodeRect(n), rect))
      .map((n) => n.id);
    this.selectMany(ids, additive);
  }

  clearSelection(): void {
    if (this._selection().size) this._selection.set(new Set());
  }

  /** Delete the current selection: selected nodes (+ their edges) and edges. */
  removeSelected(): void {
    const sel = this._selection();
    if (!sel.size) return;
    this._nodes.update((nodes) => nodes.filter((n) => !sel.has(n.id)));
    this._edges.update((edges) =>
      edges.filter(
        (e) =>
          !sel.has(e.id) &&
          !sel.has(e.source.nodeId) &&
          !sel.has(e.target.nodeId),
      ),
    );
    this._selection.set(new Set());
  }

  private anchorOf(
    byId: Map<string, BoardNode>,
    nodeId: string,
    portId: string,
  ): { point: Point; side: PortSide } | undefined {
    const node = byId.get(nodeId);
    const port: NodePort | undefined = node?.ports.find((p) => p.id === portId);
    if (!node || !port) return undefined;
    return { point: portAnchor(node, port), side: port.side };
  }
}
