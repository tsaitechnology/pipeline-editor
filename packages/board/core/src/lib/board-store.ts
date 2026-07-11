import { computed, signal, Signal } from '@angular/core';
import {
  type ActionCategory,
  type BoardNode,
  type CellSize,
  type Edge,
  type EdgeEnd,
  type GridPos,
  type NodeConfig,
  type NodeKind,
  type NodePort,
  type Pipeline,
  type Point,
  type PortRole,
  type PortSide,
  reaches,
  type Rect,
  type ValidationIssue,
  validatePipeline,
} from '@tsai-pe/shared/models';
import {
  defaultControlFlowConfig,
  derivePorts,
} from '@tsai-pe/shared/nodes';
import { boundsOf, edgePath, nodeRect, portAnchor, rectsIntersect } from './geometry';
import { routeEdge } from './routing';
import { Viewport } from './viewport';

/** Fields needed to add a fresh node; `ports` default from its kind/config. */
export interface NewNode {
  kind: NodeKind;
  category?: ActionCategory;
  /** Concrete catalog type id (open-ended trigger/integration/effect). */
  type?: string;
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
  /** Midpoint of the endpoints — anchor for a visible branch label. */
  mid: Point;
  selected: boolean;
  /** "Source → Target" label for tooltips. */
  label: string;
  /** Visible mid-edge label (e.g. a control-flow branch name), if the source port has one. */
  midLabel?: string;
}

/** A port located near a world point (for magnet snapping). */
export interface PortHit {
  nodeId: string;
  portId: string;
  point: Point;
  distance: number;
}

/**
 * Signal-based board document store: nodes, edges, selection and the viewport.
 * Framework-light (only `@angular/core` signals) so it can be unit-tested and
 * reused outside a component tree.
 */
interface Snapshot {
  nodes: readonly BoardNode[];
  edges: readonly Edge[];
}

const HISTORY_LIMIT = 100;
const PASTE_OFFSET: GridPos = { col: 2, row: 2 };

export class BoardStore {
  readonly viewport = new Viewport();

  private readonly _nodes = signal<readonly BoardNode[]>([]);
  private readonly _edges = signal<readonly Edge[]>([]);
  private readonly _selection = signal<ReadonlySet<string>>(new Set());
  private seq = 0;
  private id = 'pipeline';
  private name = 'Untitled pipeline';

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private clipboard: Snapshot | null = null;
  private readonly _canUndo = signal(false);
  private readonly _canRedo = signal(false);

  readonly nodes: Signal<readonly BoardNode[]> = this._nodes.asReadonly();
  readonly edges: Signal<readonly Edge[]> = this._edges.asReadonly();
  readonly selection: Signal<ReadonlySet<string>> = this._selection.asReadonly();
  readonly canUndo: Signal<boolean> = this._canUndo.asReadonly();
  readonly canRedo: Signal<boolean> = this._canRedo.asReadonly();

  private readonly nodeById = computed(() => {
    const map = new Map<string, BoardNode>();
    for (const node of this._nodes()) map.set(node.id, node);
    return map;
  });

  /**
   * Edges resolved to renderable geometry. Each edge is routed orthogonally
   * around nodes on the 16-subgrid; already-routed edges are fed back as
   * occupancy so connections avoid overlapping. Falls back to a bezier when a
   * route can't be found.
   */
  readonly edgeGeometries: Signal<EdgeGeometry[]> = computed(() => {
    const byId = this.nodeById();
    const nodes = this._nodes();
    const selected = this._selection();
    const occupied = new Set<string>();
    const result: EdgeGeometry[] = [];
    for (const edge of this._edges()) {
      const from = this.anchorOf(byId, edge.source.nodeId, edge.source.portId);
      const to = this.anchorOf(byId, edge.target.nodeId, edge.target.portId);
      if (!from || !to) continue;
      const route = routeEdge(from.point, to.point, from.side, to.side, nodes, occupied);
      let path: string;
      if (route) {
        path = route.path;
        for (const cell of route.cells) occupied.add(cell);
      } else {
        path = edgePath(from.point, to.point, from.side, to.side);
      }
      result.push({
        id: edge.id,
        path,
        from: from.point,
        to: to.point,
        mid: {
          x: (from.point.x + to.point.x) / 2,
          y: (from.point.y + to.point.y) / 2,
        },
        selected: selected.has(edge.id),
        label: `${byId.get(edge.source.nodeId)?.title ?? '?'} → ${byId.get(edge.target.nodeId)?.title ?? '?'}`,
        midLabel: from.label,
      });
    }
    return result;
  });

  /** Bounding rectangle (world px) of all nodes — for fit-to-content. */
  readonly contentBounds: Signal<Rect> = computed(() =>
    boundsOf(this._nodes().map(nodeRect)),
  );

  /** Live structural validation of the current graph. */
  readonly issues: Signal<ValidationIssue[]> = computed(() =>
    validatePipeline(this.toPipeline()),
  );

  /** Serialize the current board back into a plain pipeline document. */
  toPipeline(): Pipeline {
    return {
      id: this.id,
      name: this.name,
      nodes: [...this._nodes()],
      edges: [...this._edges()],
    };
  }

  load(pipeline: Pipeline): void {
    this.id = pipeline.id;
    this.name = pipeline.name;
    this._nodes.set(pipeline.nodes);
    this._edges.set(pipeline.edges);
    this._selection.set(new Set());
    this.undoStack = [];
    this.redoStack = [];
    this._canUndo.set(false);
    this._canRedo.set(false);
    // Keep the id sequence ahead of any numeric-suffixed ids already present.
    for (const node of pipeline.nodes) {
      const n = Number(node.id.split('-').pop());
      if (Number.isFinite(n)) this.seq = Math.max(this.seq, n);
    }
  }

  // ── History ────────────────────────────────────────────────────────────
  /** Capture current state onto the undo stack. Call before a discrete edit. */
  record(): void {
    this.undoStack.push({ nodes: this._nodes(), edges: this._edges() });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this._canUndo.set(true);
    this._canRedo.set(false);
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push({ nodes: this._nodes(), edges: this._edges() });
    this.restore(prev);
    this._canUndo.set(this.undoStack.length > 0);
    this._canRedo.set(true);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push({ nodes: this._nodes(), edges: this._edges() });
    this.restore(next);
    this._canUndo.set(true);
    this._canRedo.set(this.redoStack.length > 0);
  }

  private restore(snapshot: Snapshot): void {
    this._nodes.set(snapshot.nodes);
    this._edges.set(snapshot.edges);
    this._selection.set(new Set());
  }

  /** Move a node to a new grid cell. */
  moveNode(id: string, pos: GridPos): void {
    this._nodes.update((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, pos } : n)),
    );
  }

  /** Resize a node to a whole-cell footprint (clamped to a minimum). */
  resizeNode(id: string, cols: number, rows: number): void {
    const size = { cols: Math.max(4, cols), rows: Math.max(2, rows) };
    this._nodes.update((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, size } : n)),
    );
  }

  /** Auto-size a node's width to its title (records history). */
  autoSizeNode(id: string): void {
    this.record();
    this._nodes.update((nodes) =>
      nodes.map((n) => {
        if (n.id !== id) return n;
        const chars = Math.max(n.title.length, (n.subtitle ?? '').length);
        const cols = Math.min(16, Math.max(4, Math.ceil(chars * 0.32) + 3));
        return { ...n, size: { cols, rows: 2 } };
      }),
    );
  }

  /** Shift every selected node by a whole-cell delta (records history). */
  nudgeSelected(dCol: number, dRow: number): void {
    const sel = this._selection();
    if (!sel.size) return;
    this.record();
    this._nodes.update((nodes) =>
      nodes.map((n) =>
        sel.has(n.id)
          ? { ...n, pos: { col: n.pos.col + dCol, row: n.pos.row + dRow } }
          : n,
      ),
    );
  }

  /** Patch a node's editable fields (records history for undo). */
  updateNode(id: string, patch: Partial<BoardNode>): void {
    this.record();
    this._nodes.update((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    );
  }

  /**
   * Set a control-flow node's config, re-derive its output ports, grow it to fit
   * the branches, and drop any connections whose ports no longer exist.
   */
  applyConfig(id: string, config: NodeConfig): void {
    this.record();
    this._nodes.update((nodes) =>
      nodes.map((n) => {
        if (n.id !== id) return n;
        const next: BoardNode = { ...n, config };
        const ports = derivePorts(next);
        const outputs = ports.filter((p) => p.role === 'output').length;
        const rows = Math.min(12, Math.max(n.size.rows, outputs + 1));
        return { ...next, ports, size: { ...n.size, rows } };
      }),
    );
    this.pruneOrphanEdges();
  }

  /** Remove connections that reference a port no longer present on its node. */
  private pruneOrphanEdges(): void {
    const ports = new Map<string, Set<string>>();
    for (const n of this._nodes()) {
      ports.set(n.id, new Set(n.ports.map((p) => p.id)));
    }
    this._edges.update((edges) =>
      edges.filter(
        (e) =>
          ports.get(e.source.nodeId)?.has(e.source.portId) &&
          ports.get(e.target.nodeId)?.has(e.target.portId),
      ),
    );
  }

  /**
   * All nodes upstream of `id` (its ancestors in the DAG) — the pipeline context
   * whose variables an expression on this node may reference (n8n-style).
   */
  ancestorsOf(id: string): BoardNode[] {
    const incoming = new Map<string, string[]>();
    for (const e of this._edges()) {
      const list = incoming.get(e.target.nodeId) ?? [];
      list.push(e.source.nodeId);
      incoming.set(e.target.nodeId, list);
    }
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const u = stack.pop() as string;
      for (const p of incoming.get(u) ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
    return this._nodes().filter((n) => seen.has(n.id));
  }

  /**
   * Nearest port of a given role to a world point, within `maxDistance` world
   * px, optionally excluding one node. Used to magnet-snap connections.
   */
  nearestPort(
    world: Point,
    role: PortRole,
    excludeNodeId: string | undefined,
    maxDistance: number,
  ): PortHit | null {
    let best: PortHit | null = null;
    for (const node of this._nodes()) {
      if (node.id === excludeNodeId) continue;
      for (const port of node.ports) {
        if (port.role !== role) continue;
        const point = portAnchor(node, port);
        const distance = Math.hypot(point.x - world.x, point.y - world.y);
        if (distance <= maxDistance && (!best || distance < best.distance)) {
          best = { nodeId: node.id, portId: port.id, point, distance };
        }
      }
    }
    return best;
  }

  /** Add a new node (ports derived from its kind/config) and select it. */
  addNode(input: NewNode): string {
    this.record();
    const id = `node-${++this.seq}`;
    const config: NodeConfig | undefined =
      input.category === 'control-flow'
        ? defaultControlFlowConfig('if')
        : undefined;
    const base: BoardNode = {
      id,
      kind: input.kind,
      category: input.category,
      type: input.type,
      title: input.title,
      subtitle: input.subtitle,
      pos: input.pos,
      size: input.size ?? { cols: 6, rows: 2 },
      config,
      ports: [],
    };
    this._nodes.update((nodes) => [...nodes, { ...base, ports: derivePorts(base) }]);
    this.select(id);
    return id;
  }

  /** Remove a node together with any connections touching it. */
  removeNode(id: string): void {
    this.record();
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

  /**
   * Whether a connection from `source` to `target` is valid: output → input,
   * distinct nodes, and it must not introduce a cycle.
   */
  canConnect(source: EdgeEnd, target: EdgeEnd): boolean {
    if (source.nodeId === target.nodeId) return false;
    if (this.roleOf(source) !== 'output' || this.roleOf(target) !== 'input') {
      return false;
    }
    // Adding source→target closes a cycle iff target already reaches source.
    return !reaches(this._edges(), target.nodeId, source.nodeId);
  }

  /**
   * Connect an output port to an input port. Rejects invalid/cyclic links and
   * exact duplicates. Inputs accept **multiple** incoming connections (fan-in,
   * OR semantics): distinct sources — e.g. several triggers — can converge on one
   * node, which runs when any of them delivers.
   */
  connect(source: EdgeEnd, target: EdgeEnd): void {
    if (!this.canConnect(source, target)) return;
    const id = `edge-${source.nodeId}.${source.portId}~${target.nodeId}.${target.portId}`;
    if (this._edges().some((e) => e.id === id)) return;
    this.record();
    this._edges.update((edges) => [...edges, { id, source, target }]);
    this.select(id);
  }

  private roleOf(end: EdgeEnd): PortRole | undefined {
    return this._nodes()
      .find((n) => n.id === end.nodeId)
      ?.ports.find((p) => p.id === end.portId)?.role;
  }

  removeEdge(id: string): void {
    this.record();
    this._edges.update((edges) => edges.filter((e) => e.id !== id));
  }

  // ── Clipboard ──────────────────────────────────────────────────────────
  /** Copy the selected nodes and any edges fully within the selection. */
  copySelection(): void {
    const sel = this._selection();
    const nodes = this._nodes().filter((n) => sel.has(n.id));
    if (!nodes.length) {
      this.clipboard = null;
      return;
    }
    const ids = new Set(nodes.map((n) => n.id));
    const edges = this._edges().filter(
      (e) => ids.has(e.source.nodeId) && ids.has(e.target.nodeId),
    );
    this.clipboard = { nodes, edges };
  }

  get hasClipboard(): boolean {
    return !!this.clipboard?.nodes.length;
  }

  /** Paste the clipboard offset by a couple of cells, selecting the copies. */
  paste(): void {
    const clip = this.clipboard;
    if (!clip?.nodes.length) return;
    this.record();
    const idMap = new Map<string, string>();
    const nodes = clip.nodes.map((n) => {
      const id = `node-${++this.seq}`;
      idMap.set(n.id, id);
      return {
        ...n,
        id,
        pos: {
          col: n.pos.col + PASTE_OFFSET.col,
          row: n.pos.row + PASTE_OFFSET.row,
        },
        ports: n.ports.map((p) => ({ ...p })),
      };
    });
    const edges = clip.edges.map((e) => ({
      id: `edge-${++this.seq}`,
      source: { nodeId: idMap.get(e.source.nodeId) as string, portId: e.source.portId },
      target: { nodeId: idMap.get(e.target.nodeId) as string, portId: e.target.portId },
    }));
    this._nodes.update((ns) => [...ns, ...nodes]);
    this._edges.update((es) => [...es, ...edges]);
    this.selectMany(nodes.map((n) => n.id));
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
    this.record();
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
  ): { point: Point; side: PortSide; label?: string } | undefined {
    const node = byId.get(nodeId);
    const port: NodePort | undefined = node?.ports.find((p) => p.id === portId);
    if (!node || !port) return undefined;
    return { point: portAnchor(node, port), side: port.side, label: port.label };
  }
}
