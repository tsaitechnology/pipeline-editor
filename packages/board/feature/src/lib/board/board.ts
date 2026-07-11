import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  BoardStore,
  edgePath,
  GRID_CELL,
  nodeRect,
  portAnchor,
  snapToCell,
} from '@tsai-pe/board/core';
import {
  BoardGrid,
  NODE_META,
  NodeView,
  type PortPointer,
} from '@tsai-pe/board/ui';
import {
  type ActionCategory,
  type BoardNode,
  type ControlFlowConfig,
  type ControlFlowKind,
  type EdgeEnd,
  type GridPos,
  type NodeKind,
  type NodeStatus,
  nodeType,
  type NodeType,
  type Pipeline,
  type PipelineSummary,
  type Point,
  type PortSide,
  type Rect,
  type RunSnapshot,
  type Size,
  type Unsubscribe,
  type ValidationIssue,
} from '@tsai-pe/shared/models';
import {
  catalogEntry,
  defaultControlFlowConfig,
  isControlFlow,
  NODE_CATALOG,
  type ParamField,
  paramSchema,
  variablePaths,
} from '@tsai-pe/shared/nodes';
import { Button, Dialog } from '@tsai-pe/ui-kit';
import { LucideAngularModule } from 'lucide-angular';
import { PIPELINE_BACKEND } from '../pipeline-backend.token';
import { PIPELINE_STORE } from '../pipeline-store.token';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 4;
const ZOOM_STEP = 1.2;
const SNAP_PX = 28; // magnet radius (screen px) for connecting to a nearby port
const MINIMAP = { width: 190, height: 120, pad: 8 };

/** One entry in the node palette — a concrete catalog type (or control-flow). */
interface PaletteItem {
  label: string;
  kind: NodeKind;
  category?: ActionCategory;
  /** Concrete catalog type id, when adding a typed node. */
  type?: string;
  icon: (typeof NODE_META)[NodeType]['icon'];
  color: string;
}

interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

function fromCatalog(spec: (typeof NODE_CATALOG)[number]): PaletteItem {
  const meta = NODE_META[nodeType(spec)];
  return {
    label: spec.label,
    kind: spec.kind,
    category: spec.category,
    type: spec.id,
    icon: meta.icon,
    color: meta.color,
  };
}

const byType = (t: NodeType) =>
  NODE_CATALOG.filter((s) => nodeType(s) === t).map(fromCatalog);

/** Palette grouped by category; concrete types come from the node catalog. */
const PALETTE_GROUPS: PaletteGroup[] = [
  { label: 'Triggers', items: byType('trigger') },
  { label: 'Integrations', items: byType('integration') },
  { label: 'Transforms', items: byType('transform') },
  {
    label: 'Flow',
    items: [
      ...byType('split'),
      ...byType('merge'),
      {
        label: 'Control flow',
        kind: 'action',
        category: 'control-flow',
        icon: NODE_META['control-flow'].icon,
        color: NODE_META['control-flow'].color,
      },
    ],
  },
  { label: 'Effects', items: byType('effect') },
];

/** A resolved port drop target under the cursor. */
interface PortHit {
  nodeId: string;
  portId: string;
  role: string;
}

type Drag =
  | { mode: 'pan'; startClient: Point; startPan: Point; moved: boolean }
  | {
      mode: 'move';
      nodeId: string;
      startBoard: Point;
      startPx: Point;
      recorded: boolean;
    }
  | { mode: 'connect'; from: EdgeEnd; anchor: Point; side: PortSide }
  | { mode: 'select'; startLocal: Point; additive: boolean }
  | {
      mode: 'resize';
      nodeId: string;
      startBoard: Point;
      startCols: number;
      startRows: number;
      recorded: boolean;
    };

/** A contextual menu opened by right-click (desktop) or long-press (touch). */
interface ContextMenu {
  x: number;
  y: number;
  cell: GridPos;
  nodeId?: string;
}

/**
 * The `<pe-board>` editor. Composes the infinite grid, a transformed world layer
 * of nodes and edges, and all pointer interaction:
 * - pan: hold RMB and drag (desktop) or swipe with one finger (touch);
 * - move a node: drag its body (snaps to the 32-grid);
 * - draw a connection: drag from an output port onto an input port;
 * - select: click a node or edge; click empty space to clear;
 * - context menu: right-click or long-press (empty space vs. a node).
 */
@Component({
  selector: 'pe-board',
  imports: [BoardGrid, NodeView, LucideAngularModule, Dialog, Button],
  templateUrl: './board.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    tabindex: '0',
    role: 'application',
    'aria-label': 'Pipeline board editor',
    class:
      'relative block w-full h-full overflow-hidden bg-[var(--canvas-bg)] touch-none select-none outline-none',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
    '(contextmenu)': 'onContextMenu($event)',
    '(wheel)': 'onWheel($event)',
    '(keydown)': 'onKeyDown($event)',
    '(keyup)': 'onKeyUp($event)',
    '(dragover)': 'onDragOver($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Board {
  /** Pipeline document to render. Reloaded into the store whenever it changes. */
  readonly pipeline = input<Pipeline | null>(null);
  /** View-only mode: pan/zoom/select/inspect stay, all editing is disabled. */
  readonly readonly = input(false);

  protected readonly store = new BoardStore();
  protected readonly paletteGroups = PALETTE_GROUPS;

  /** Shared Tailwind class strings for the repeated floating-panel widgets. */
  protected readonly cls = {
    toolbarBtn:
      'min-w-[30px] h-[30px] px-2 text-[0.8125rem] font-semibold text-text-2 rounded-[var(--r-sm)] cursor-pointer transition-colors duration-150 enabled:hover:text-text enabled:hover:bg-[var(--surface-3)] disabled:opacity-40 disabled:cursor-not-allowed',
    menuItem:
      'flex items-center px-2.5 py-[7px] text-[0.8125rem] text-text text-left rounded-[var(--r-sm)] cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-3)]',
    menuItemDanger:
      'flex items-center px-2.5 py-[7px] text-[0.8125rem] text-left rounded-[var(--r-sm)] cursor-pointer transition-colors duration-150 text-[var(--danger)] hover:bg-[var(--danger-quiet)]',
    menuLabel:
      'px-2.5 pt-1.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.04em] uppercase text-[var(--text-3,var(--text-2))]',
    sep: 'h-px my-1 mx-1.5 bg-[var(--border)]',
    field: 'flex flex-col gap-[5px]',
    fieldLabel: 'text-xs text-text-2',
    fieldInput:
      'w-full px-[9px] py-[7px] text-[0.8125rem] text-text border border-[var(--border)] rounded-[var(--r-sm)] bg-[var(--surface-1)] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]',
  };

  /** Visible-edge classes: active flow, else selection accent, else resting. */
  protected edgeClasses(selected: boolean, active: boolean): string {
    const base =
      'fill-none [pointer-events:none] transition-[stroke,stroke-width] duration-150';
    if (active) {
      return `${base} stroke-[var(--accent)] [stroke-width:2.5] [stroke-dasharray:8_4] animate-[pe-flow_0.5s_linear_infinite]`;
    }
    return selected
      ? `${base} stroke-[var(--edge-selected)] [stroke-width:2.5]`
      : `${base} stroke-[var(--edge)] [stroke-width:2] group-hover:stroke-[var(--edge-hover)] group-hover:[stroke-width:2.5]`;
  }

  /** Validation status pill color by current severity. */
  protected statusClass(): string {
    if (this.errorCount() > 0) {
      return 'text-[var(--danger)] bg-[var(--danger-quiet)]';
    }
    if (this.warningCount() > 0) {
      return 'text-[var(--warning)] bg-[var(--warning-quiet)]';
    }
    return 'text-[var(--success)] bg-[var(--success-quiet)]';
  }

  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly backend = inject(PIPELINE_BACKEND, { optional: true });
  private readonly persistence = inject(PIPELINE_STORE, { optional: true });

  /** Whether persistence is wired (shows Save / Open). */
  protected readonly canPersist = !!this.persistence;
  /** Whether the Open-pipeline dialog is visible. */
  protected readonly showOpen = signal(false);
  /** Summaries of saved pipelines, loaded when the Open dialog is shown. */
  protected readonly savedPipelines = signal<PipelineSummary[]>([]);
  /** Transient "Saved" confirmation flag after a successful save. */
  protected readonly justSaved = signal(false);
  private savedTimer?: ReturnType<typeof setTimeout>;

  private drag: Drag | null = null;
  private longPress?: ReturnType<typeof setTimeout>;
  private spaceHeld = false;
  private runUnsub?: Unsubscribe;

  /** Whether a backend is wired (shows the Run control). */
  protected readonly canRun = !!this.backend;
  /** Latest snapshot of the current/last run, or null. */
  protected readonly run = signal<RunSnapshot | null>(null);
  protected readonly running = computed(() => this.run()?.status === 'running');
  protected readonly showLog = signal(false);
  /** Log filter: only entries for this node id, or all when null. */
  protected readonly logFilter = signal<string | null>(null);
  private readonly logScroll =
    viewChild<ElementRef<HTMLElement>>('logScroll');
  /** Node id → title, for resolving log entry / filter labels. */
  private readonly nodeTitles = computed(() => {
    const m = new Map<string, string>();
    for (const n of this.store.nodes()) m.set(n.id, n.title);
    return m;
  });
  /** Distinct nodes that appear in the current run log (for the filter). */
  protected readonly logNodes = computed(() => {
    const r = this.run();
    if (!r) return [];
    const titles = this.nodeTitles();
    const ids = new Set<string>();
    for (const e of r.log) if (e.nodeId) ids.add(e.nodeId);
    return [...ids].map((id) => ({ id, title: titles.get(id) ?? id }));
  });
  /** Log entries after applying the node filter, with resolved titles. */
  protected readonly logEntries = computed(() => {
    const r = this.run();
    if (!r) return [];
    const filter = this.logFilter();
    const titles = this.nodeTitles();
    return r.log
      .filter((e) => !filter || e.nodeId === filter)
      .map((e) => ({
        at: e.at,
        message: e.message,
        node: e.nodeId ? (titles.get(e.nodeId) ?? e.nodeId) : undefined,
      }));
  });
  /** Auto-scroll the log to the newest entry as it grows. */
  private readonly _logAutoscroll = effect(() => {
    const count = this.logEntries().length;
    const el = this.logScroll()?.nativeElement;
    if (el && count) {
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    }
  });
  /** Per-node run status, applied over each node as an overlay. */
  protected readonly runStatuses = computed<Record<string, NodeStatus>>(() => {
    const r = this.run();
    if (!r) return {};
    const map: Record<string, NodeStatus> = {};
    for (const [id, nr] of Object.entries(r.nodes)) map[id] = nr.status;
    return map;
  });
  /** Per-node fan-out progress (e.g. 7/10) during a run. */
  protected readonly runProgress = computed<
    Record<string, { done: number; total: number }>
  >(() => {
    const r = this.run();
    if (!r) return {};
    const map: Record<string, { done: number; total: number }> = {};
    for (const [id, nr] of Object.entries(r.nodes)) {
      if (nr.progress) map[id] = nr.progress;
    }
    return map;
  });
  /** Per-node error message from the current run (for the on-node overlay). */
  protected readonly runErrors = computed<Record<string, string>>(() => {
    const r = this.run();
    if (!r) return {};
    const map: Record<string, string> = {};
    for (const [id, nr] of Object.entries(r.nodes)) {
      if (nr.error) map[id] = nr.error;
    }
    return map;
  });
  /** Edges whose data is currently in transit (source done → target running). */
  protected readonly activeEdgeIds = computed<ReadonlySet<string>>(() => {
    const rs = this.runStatuses();
    const ids = new Set<string>();
    for (const e of this.store.edges()) {
      if (rs[e.source.nodeId] === 'success' && rs[e.target.nodeId] === 'running') {
        ids.add(e.id);
      }
    }
    return ids;
  });
  private paletteDrag: {
    kind: NodeKind;
    category?: ActionCategory;
    type?: string;
    label: string;
  } | null = null;

  /** Live bezier path while drawing a connection. */
  protected readonly draftPath = signal<string | null>(null);
  protected readonly menu = signal<ContextMenu | null>(null);
  /** Whether the delete-confirmation dialog is open. */
  protected readonly confirmOpen = signal(false);
  /** Message shown in the delete-confirmation dialog. */
  protected readonly confirmMessage = signal('');
  /** The deletion to perform if the confirmation is accepted. */
  private pendingDelete: (() => void) | null = null;
  /** Rubber-band selection rectangle, in local (screen) pixels. */
  protected readonly marquee = signal<Rect | null>(null);
  /** Alignment guide lines (world coords) shown while dragging a node. */
  protected readonly guides = signal<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  /** Whether the validation issues panel is open. */
  protected readonly showIssues = signal(false);
  /** True while a connection is being drawn (lights up input ports). */
  protected readonly isConnecting = computed(() => this.draftPath() !== null);
  /** The input port a dragged connection will magnet-snap onto. */
  protected readonly snapTarget = signal<{ nodeId: string; portId: string } | null>(
    null,
  );
  /** The node currently open in the inspector panel. */
  protected readonly inspectId = signal<string | null>(null);
  protected readonly inspectNode = computed(() => {
    const id = this.inspectId();
    return id ? (this.store.nodes().find((n) => n.id === id) ?? null) : null;
  });

  private mmDragging = false;

  protected readonly errorCount = computed(
    () => this.store.issues().filter((i) => i.severity === 'error').length,
  );
  protected readonly warningCount = computed(
    () => this.store.issues().filter((i) => i.severity === 'warning').length,
  );

  /** Nodes with the selected ones last, so selection paints on top. */
  protected readonly orderedNodes = computed(() => {
    const sel = this.store.selection();
    return [...this.store.nodes()].sort(
      (a, b) => Number(sel.has(a.id)) - Number(sel.has(b.id)),
    );
  });

  /** Minimap geometry: node rects, viewport rect and the world→minimap mapping. */
  protected readonly minimap = computed(() => {
    const bounds = this.store.contentBounds();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const { width: mw, height: mh, pad } = MINIMAP;
    const scale = Math.min(
      (mw - pad * 2) / bounds.width,
      (mh - pad * 2) / bounds.height,
    );
    const toMini = (x: number, y: number) => ({
      x: (x - bounds.x) * scale + pad,
      y: (y - bounds.y) * scale + pad,
    });
    const nodes = this.store.nodes().map((n) => {
      const r = nodeRect(n);
      const p = toMini(r.x, r.y);
      return {
        x: p.x,
        y: p.y,
        w: r.width * scale,
        h: r.height * scale,
        fill: NODE_META[nodeType(n)].color,
        selected: this.store.isSelected(n.id),
      };
    });
    const size = this.size();
    const vp = this.store.viewport;
    const tl = vp.screenToBoard({ x: 0, y: 0 });
    const view = {
      ...toMini(tl.x, tl.y),
      w: (size.width / vp.zoom()) * scale,
      h: (size.height / vp.zoom()) * scale,
    };
    return { bounds, scale, pad, nodes, view };
  });

  constructor() {
    effect(() => {
      const pipeline = this.pipeline();
      if (pipeline) this.store.load(pipeline);
    });
    inject(DestroyRef).onDestroy(() => this.disposeRun());
  }

  // ── Board-level pointer handling (empty space, pan, drop) ────────────────
  protected onPointerDown(event: PointerEvent): void {
    this.menu.set(null);
    this.hostEl.nativeElement.focus();
    if (this.drag) return; // a node/port handler already claimed this press

    // Right button, middle button, touch, or Space+left → pan.
    const pan =
      event.button === 1 ||
      event.button === 2 ||
      event.pointerType === 'touch' ||
      (event.button === 0 && this.spaceHeld);
    if (pan) {
      if (event.button === 1) event.preventDefault(); // no middle-click autoscroll
      this.drag = {
        mode: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startPan: this.store.viewport.pan(),
        moved: false,
      };
      if (event.pointerType === 'touch') {
        this.scheduleLongPress(this.local(event));
      }
      this.capture(event);
      return;
    }

    // Left button on empty space → rubber-band selection.
    if (event.button === 0) {
      const additive = event.shiftKey || event.metaKey;
      if (!additive) this.store.clearSelection();
      this.drag = { mode: 'select', startLocal: this.local(event), additive };
      this.capture(event);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;

    if (drag.mode === 'pan') {
      const dx = event.clientX - drag.startClient.x;
      const dy = event.clientY - drag.startClient.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        drag.moved = true;
        this.cancelLongPress();
      }
      this.store.viewport.setPan({
        x: drag.startPan.x + dx,
        y: drag.startPan.y + dy,
      });
    } else if (drag.mode === 'move') {
      const board = this.store.viewport.screenToBoard(this.local(event));
      const dx = board.x - drag.startBoard.x;
      const dy = board.y - drag.startBoard.y;
      if (Math.hypot(dx, dy) <= MOVE_THRESHOLD) return; // ignore jitter
      this.cancelLongPress();
      // Snapshot the pre-drag state once, right before the node first moves.
      if (!drag.recorded) {
        this.store.record();
        drag.recorded = true;
      }
      this.store.moveNode(
        drag.nodeId,
        snapToCell({ x: drag.startPx.x + dx, y: drag.startPx.y + dy }),
      );
      this.guides.set(this.computeGuides(drag.nodeId));
    } else if (drag.mode === 'resize') {
      const board = this.store.viewport.screenToBoard(this.local(event));
      const cols = drag.startCols + Math.round((board.x - drag.startBoard.x) / GRID_CELL);
      const rows = drag.startRows + Math.round((board.y - drag.startBoard.y) / GRID_CELL);
      if (cols === drag.startCols && rows === drag.startRows && !drag.recorded) {
        return;
      }
      if (!drag.recorded) {
        this.store.record();
        drag.recorded = true;
      }
      this.store.resizeNode(drag.nodeId, cols, rows);
    } else if (drag.mode === 'connect') {
      this.cancelLongPress();
      const world = this.store.viewport.screenToBoard(this.local(event));
      // Magnet: snap the draft end to the nearest input port within reach.
      const near = this.store.nearestPort(
        world,
        'input',
        drag.from.nodeId,
        SNAP_PX / this.store.viewport.zoom(),
      );
      const valid = near && this.store.canConnect(drag.from, near);
      const end = valid ? near.point : world;
      this.snapTarget.set(
        valid ? { nodeId: near.nodeId, portId: near.portId } : null,
      );
      this.draftPath.set(edgePath(drag.anchor, end, drag.side, 'left'));
    } else {
      // Marquee: update the rectangle and live-select intersecting nodes.
      const now = this.local(event);
      const rect = this.rectFrom(drag.startLocal, now);
      this.marquee.set(rect);
      const a = this.store.viewport.screenToBoard({ x: rect.x, y: rect.y });
      const b = this.store.viewport.screenToBoard({
        x: rect.x + rect.width,
        y: rect.y + rect.height,
      });
      this.store.selectInRect(
        { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
        drag.additive,
      );
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.cancelLongPress();
    const drag = this.drag;
    this.drag = null;
    this.release(event);
    if (this.guides().length) this.guides.set([]);
    if (!drag) return;

    if (drag.mode === 'select') {
      this.marquee.set(null);
    } else if (drag.mode === 'connect') {
      this.draftPath.set(null);
      // Prefer the magnet target; fall back to an exact port hit under the cursor.
      const snap = this.snapTarget();
      this.snapTarget.set(null);
      if (snap) {
        this.store.connect(drag.from, snap);
      } else {
        const hit = this.portAt(event.clientX, event.clientY);
        if (hit && hit.role === 'input') {
          this.store.connect(drag.from, {
            nodeId: hit.nodeId,
            portId: hit.portId,
          });
        }
      }
    } else if (drag.mode === 'pan' && !drag.moved && event.button === 2) {
      // Right-click without a drag → context menu.
      this.openMenu(
        this.local(event),
        this.nodeAt(event.clientX, event.clientY),
      );
    }
  }

  protected onContextMenu(event: MouseEvent): void {
    // We drive the menu ourselves (pointerup / long-press); never the browser's.
    event.preventDefault();
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.store.viewport.zoomAround(this.local(event), factor);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const ro = this.readonly();

    if (mod) {
      switch (key) {
        case 'z':
          if (ro) return;
          event.preventDefault();
          if (event.shiftKey) this.store.redo();
          else this.store.undo();
          return;
        case 'y':
          if (ro) return;
          event.preventDefault();
          this.store.redo();
          return;
        case '=':
        case '+':
          event.preventDefault();
          this.zoomIn();
          return;
        case '-':
        case '_':
          event.preventDefault();
          this.zoomOut();
          return;
        case 'c':
          event.preventDefault();
          this.store.copySelection();
          return;
        case 'v':
          if (ro) return;
          event.preventDefault();
          this.store.paste();
          return;
        case 'd':
          if (ro) return;
          event.preventDefault();
          this.store.copySelection();
          this.store.paste();
          return;
        case 'a':
          event.preventDefault();
          this.store.selectMany(this.store.nodes().map((n) => n.id));
          return;
      }
      return;
    }

    switch (event.key) {
      case 'Delete':
        // Backspace deliberately does NOT delete — only the Delete key does.
        if (ro) break;
        event.preventDefault();
        this.requestDeleteSelected();
        break;
      case 'Escape':
        this.menu.set(null);
        this.inspectId.set(null);
        this.showIssues.set(false);
        this.store.clearSelection();
        break;
      case 'f':
      case 'F':
        this.fitView();
        break;
      case ' ':
        this.spaceHeld = true;
        event.preventDefault(); // don't scroll the page
        break;
      case 'Tab':
        event.preventDefault();
        this.cycleSelection(event.shiftKey ? -1 : 1);
        break;
      case 'Enter': {
        const sel = [...this.store.selection()];
        if (sel.length === 1 && this.store.nodes().some((n) => n.id === sel[0])) {
          this.openInspector(sel[0]);
        }
        break;
      }
      case 'ArrowUp':
        if (ro) break;
        event.preventDefault();
        this.store.nudgeSelected(0, -1);
        break;
      case 'ArrowDown':
        if (ro) break;
        event.preventDefault();
        this.store.nudgeSelected(0, 1);
        break;
      case 'ArrowLeft':
        if (ro) break;
        event.preventDefault();
        this.store.nudgeSelected(-1, 0);
        break;
      case 'ArrowRight':
        if (ro) break;
        event.preventDefault();
        this.store.nudgeSelected(1, 0);
        break;
    }
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') this.spaceHeld = false;
  }

  /** Move the selection to the next/previous node (keyboard navigation). */
  private cycleSelection(dir: 1 | -1): void {
    const nodes = this.store.nodes();
    if (!nodes.length) return;
    const sel = [...this.store.selection()];
    const current = nodes.findIndex((n) => n.id === sel[sel.length - 1]);
    const next = nodes[(current + dir + nodes.length) % nodes.length];
    this.store.select(next.id);
    this.ensureVisible(next.id);
  }

  /** Pan so a node is comfortably within view (used by keyboard navigation). */
  private ensureVisible(nodeId: string): void {
    const node = this.store.nodes().find((n) => n.id === nodeId);
    if (!node) return;
    const r = nodeRect(node);
    const vp = this.store.viewport;
    const tl = vp.screenToBoard({ x: 0, y: 0 });
    const size = this.size();
    const br = vp.screenToBoard({ x: size.width, y: size.height });
    const margin = 40 / vp.zoom();
    if (
      r.x >= tl.x + margin &&
      r.y >= tl.y + margin &&
      r.x + r.width <= br.x - margin &&
      r.y + r.height <= br.y - margin
    ) {
      return; // already visible
    }
    const zoom = vp.zoom();
    vp.setPan({
      x: size.width / 2 - (r.x + r.width / 2) * zoom,
      y: size.height / 2 - (r.y + r.height / 2) * zoom,
    });
  }

  protected undo(): void {
    this.store.undo();
  }

  protected redo(): void {
    this.store.redo();
  }

  // ── Node palette (drag-and-drop create + click-to-add) ───────────────────
  protected onPaletteDragStart(item: PaletteItem, event: DragEvent): void {
    this.paletteDrag = {
      kind: item.kind,
      category: item.category,
      type: item.type,
      label: item.label,
    };
    event.dataTransfer?.setData('text/plain', item.type ?? item.label);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  /** Click a palette item to drop a node at the current viewport center. */
  protected onPaletteClick(item: PaletteItem): void {
    if (this.readonly()) return;
    const cell = snapToCell(this.store.viewport.screenToBoard(this.center()));
    this.store.addNode({
      kind: item.kind,
      category: item.category,
      type: item.type,
      title: item.label,
      pos: cell,
    });
  }

  protected onDragOver(event: DragEvent): void {
    if (this.readonly() || !this.paletteDrag) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  protected onDrop(event: DragEvent): void {
    const spec = this.paletteDrag;
    this.paletteDrag = null;
    if (this.readonly() || !spec) return;
    event.preventDefault();
    const cell = snapToCell(this.store.viewport.screenToBoard(this.local(event)));
    this.store.addNode({
      kind: spec.kind,
      category: spec.category,
      type: spec.type,
      title: spec.label,
      pos: cell,
    });
  }

  // ── Minimap ──────────────────────────────────────────────────────────────
  protected onMinimapDown(event: PointerEvent): void {
    event.stopPropagation();
    this.mmDragging = true;
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
    this.panFromMinimap(event);
  }

  protected onMinimapMove(event: PointerEvent): void {
    if (this.mmDragging) this.panFromMinimap(event);
  }

  protected onMinimapUp(event: PointerEvent): void {
    this.mmDragging = false;
    try {
      (event.currentTarget as SVGElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  /** Recenter the viewport on the world point under a minimap pointer. */
  private panFromMinimap(event: PointerEvent): void {
    const mm = this.minimap();
    if (!mm) return;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const world = {
      x: mm.bounds.x + (event.clientX - rect.left - mm.pad) / mm.scale,
      y: mm.bounds.y + (event.clientY - rect.top - mm.pad) / mm.scale,
    };
    const size = this.size();
    const zoom = this.store.viewport.zoom();
    this.store.viewport.setPan({
      x: size.width / 2 - world.x * zoom,
      y: size.height / 2 - world.y * zoom,
    });
  }

  // ── Inspector (edit node) ────────────────────────────────────────────────
  protected openInspector(nodeId: string): void {
    this.inspectId.set(nodeId);
    this.store.select(nodeId);
    this.menu.set(null);
  }

  protected closeInspector(): void {
    this.inspectId.set(null);
  }

  protected editNodeFromMenu(): void {
    const id = this.menu()?.nodeId;
    if (id) this.openInspector(id);
  }

  protected patchTitle(value: string): void {
    const id = this.inspectId();
    if (id) this.store.updateNode(id, { title: value });
  }

  protected patchSubtitle(value: string): void {
    const id = this.inspectId();
    if (id) this.store.updateNode(id, { subtitle: value });
  }

  protected patchBuffer(value: string): void {
    const id = this.inspectId();
    const n = Number(value);
    if (id && Number.isFinite(n)) this.store.updateNode(id, { bufferSize: n });
  }

  protected patchRequired(value: boolean): void {
    const id = this.inspectId();
    if (id) this.store.updateNode(id, { required: value });
  }

  // ── Control-flow configuration ───────────────────────────────────────────
  /** Upstream nodes (pipeline context) whose variables an expression may use. */
  protected readonly context = computed<BoardNode[]>(() => {
    const id = this.inspectId();
    return id ? this.store.ancestorsOf(id) : [];
  });

  protected isCf(node: BoardNode): boolean {
    return isControlFlow(node);
  }

  protected readonly cfTypes: ControlFlowKind[] = ['if', 'switch', 'filter'];
  private readonly cfg = computed(() => this.inspectNode()?.config ?? null);
  /** Narrowed to the if/filter variants (both hold a single `expression`). */
  protected readonly exprCfg = computed(() => {
    const c = this.cfg();
    return c && (c.type === 'if' || c.type === 'filter') ? c : null;
  });
  protected readonly switchCfg = computed(() => {
    const c = this.cfg();
    return c && c.type === 'switch' ? c : null;
  });
  protected cfType(): ControlFlowKind | undefined {
    return this.cfg()?.type;
  }

  protected cfTypeClass(type: ControlFlowKind): string {
    const base =
      'flex-1 h-8 text-xs font-medium rounded-[var(--r-sm)] border transition-colors capitalize disabled:opacity-50';
    return this.cfType() === type
      ? `${base} border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-quiet)]`
      : `${base} border-[var(--border)] text-text-2 enabled:hover:bg-[var(--surface-3)]`;
  }

  private setConfig(config: ControlFlowConfig): void {
    const id = this.inspectId();
    if (id && !this.readonly()) this.store.applyConfig(id, config);
  }

  protected setControlFlowType(type: ControlFlowKind): void {
    this.setConfig(defaultControlFlowConfig(type));
  }

  protected patchExpression(value: string): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'if' || c?.type === 'filter') {
      this.setConfig({ ...c, expression: value });
    }
  }

  protected patchDiscriminant(value: string): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'switch') this.setConfig({ ...c, discriminant: value });
  }

  protected addCase(): void {
    const c = this.inspectNode()?.config;
    if (c?.type !== 'switch') return;
    const id = `${Date.now().toString(36)}`;
    this.setConfig({
      ...c,
      cases: [...c.cases, { id, label: `Case ${c.cases.length + 1}`, value: '' }],
    });
  }

  protected removeCase(caseId: string): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'switch') {
      this.setConfig({ ...c, cases: c.cases.filter((x) => x.id !== caseId) });
    }
  }

  protected patchCaseLabel(caseId: string, value: string): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'switch') {
      this.setConfig({
        ...c,
        cases: c.cases.map((x) => (x.id === caseId ? { ...x, label: value } : x)),
      });
    }
  }

  protected patchCaseValue(caseId: string, value: string): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'switch') {
      this.setConfig({
        ...c,
        cases: c.cases.map((x) => (x.id === caseId ? { ...x, value } : x)),
      });
    }
  }

  protected toggleDefault(hasDefault: boolean): void {
    const c = this.inspectNode()?.config;
    if (c?.type === 'switch') this.setConfig({ ...c, hasDefault });
  }

  /**
   * Variable paths an expression may pull from an upstream node — derived from
   * the shape of what that node produced in the current run. Empty until a run
   * has output for it (then the editor only offers the bare node reference).
   */
  protected varPaths(node: BoardNode): string[] {
    // Prefer the node's real run output; before a run, fall back to the catalog's
    // illustrative output shape so variables are offered while building.
    const output =
      this.run()?.nodes[node.id]?.output ?? catalogEntry(node.type)?.output;
    return output === undefined ? [] : variablePaths(output);
  }

  /** An n8n-style reference to an upstream node, optionally to a variable path. */
  private contextRef(title: string, path?: string): string {
    const accessor = !path ? '' : path.startsWith('[') ? path : `.${path}`;
    return `{{ $node["${title}"]${accessor} }}`;
  }

  /** Append an upstream reference (node, or a variable path) to the config. */
  protected insertContext(node: BoardNode, path?: string): void {
    const c = this.inspectNode()?.config;
    if (!c) return;
    const ref = this.contextRef(node.title, path);
    if (c.type === 'switch') {
      this.setConfig({ ...c, discriminant: `${c.discriminant} ${ref}`.trim() });
    } else {
      this.setConfig({ ...c, expression: `${c.expression} ${ref}`.trim() });
    }
  }

  // ── Generic node parameters (from the catalog) + run data ────────────────
  protected params(node: BoardNode): ParamField[] {
    return paramSchema(node);
  }

  protected catalogLabel(node: BoardNode): string {
    return catalogEntry(node.type)?.label ?? node.category ?? node.kind;
  }

  protected paramValue(node: BoardNode, key: string): string {
    const v = node.data?.[key];
    return v == null ? '' : String(v);
  }

  protected paramChecked(node: BoardNode, key: string): boolean {
    return node.data?.[key] === true;
  }

  protected patchParam(key: string, value: unknown): void {
    const id = this.inspectId();
    const n = this.inspectNode();
    if (id && !this.readonly()) {
      this.store.updateNode(id, { data: { ...(n?.data ?? {}), [key]: value } });
    }
  }

  protected insertParamContext(key: string, node: BoardNode, path?: string): void {
    const current = String(this.inspectNode()?.data?.[key] ?? '');
    const ref = this.contextRef(node.title, path);
    this.patchParam(key, `${current} ${ref}`.trim());
  }

  /** The inspected node's state in the current run (for the Data section). */
  protected readonly inspectedRun = computed(() => {
    const id = this.inspectId();
    const r = this.run();
    return id && r ? (r.nodes[id] ?? null) : null;
  });

  protected json(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  /** `HH:MM:SS.mmm` timestamp for a log entry. */
  protected formatLogTime(at: number): string {
    const d = new Date(at);
    const p = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
      d.getMilliseconds(),
      3,
    )}`;
  }

  // ── Run (via the injected backend) ───────────────────────────────────────
  protected toggleRun(): void {
    if (this.running()) this.stopRun();
    else this.startRun();
  }

  private startRun(): void {
    if (!this.backend) return;
    this.disposeRun();
    this.showLog.set(true);
    const runId = this.backend.startRun(this.store.toPipeline());
    this.runUnsub = this.backend.observe(runId, (snapshot) =>
      this.run.set(snapshot),
    );
  }

  protected stopRun(): void {
    const r = this.run();
    if (r && this.backend && r.status === 'running') this.backend.stop(r.runId);
  }

  protected clearRun(): void {
    this.disposeRun();
    this.run.set(null);
    this.showLog.set(false);
    this.logFilter.set(null);
  }

  private disposeRun(): void {
    this.runUnsub?.();
    this.runUnsub = undefined;
  }

  // ── Save / load / validation ─────────────────────────────────────────────
  protected exportJson(): void {
    const pipeline = this.store.toPipeline();
    const blob = new Blob([JSON.stringify(pipeline, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(pipeline.name || 'pipeline').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const pipeline = JSON.parse(await file.text()) as Pipeline;
      if (Array.isArray(pipeline.nodes) && Array.isArray(pipeline.edges)) {
        this.store.load(pipeline);
        this.fitView();
      }
    } catch {
      /* ignore malformed JSON */
    }
  }

  // ── Persistence (via the injected store) ─────────────────────────────────
  /** Save the current pipeline to the store, flashing a brief confirmation. */
  protected async savePipeline(): Promise<void> {
    if (!this.persistence || this.readonly()) return;
    await this.persistence.save(this.store.toPipeline());
    this.justSaved.set(true);
    clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.justSaved.set(false), 1500);
  }

  /** Load the saved-pipeline list and open the picker dialog. */
  protected async openPicker(): Promise<void> {
    if (!this.persistence) return;
    this.savedPipelines.set(await this.persistence.list());
    this.showOpen.set(true);
  }

  /** Load a saved pipeline into the board and close the picker. */
  protected async loadSaved(id: string): Promise<void> {
    if (!this.persistence) return;
    const pipeline = await this.persistence.load(id);
    if (pipeline) {
      this.store.load(pipeline);
      this.fitView();
    }
    this.showOpen.set(false);
  }

  /** Human-readable "last saved" time for a summary row. */
  protected savedWhen(at: number): string {
    return at ? new Date(at).toLocaleString() : '—';
  }

  /** Delete a saved pipeline, refreshing the list in place. */
  protected async deleteSaved(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.persistence) return;
    await this.persistence.remove(id);
    this.savedPipelines.set(await this.persistence.list());
  }

  protected toggleIssues(): void {
    this.showIssues.update((v) => !v);
  }

  protected focusIssue(issue: ValidationIssue): void {
    const id = issue.nodeId ?? issue.edgeId;
    if (id) this.store.select(id);
  }

  // ── Toolbar / view controls ──────────────────────────────────────────────
  protected zoomIn(): void {
    this.store.viewport.zoomAround(this.center(), ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.store.viewport.zoomAround(this.center(), 1 / ZOOM_STEP);
  }

  protected fitView(): void {
    this.store.viewport.fitTo(this.store.contentBounds(), this.size());
  }

  protected resetView(): void {
    this.store.viewport.reset();
    this.menu.set(null);
  }

  // ── Node / port / edge intents (from pe-node + the edge layer) ───────────
  protected onNodeDown(node: BoardNode, event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    this.store.select(node.id, event.shiftKey || event.metaKey);
    if (this.readonly()) return; // view-only: select but don't move
    const rect = nodeRect(node);
    this.drag = {
      mode: 'move',
      nodeId: node.id,
      startBoard: this.store.viewport.screenToBoard(this.local(event)),
      startPx: { x: rect.x, y: rect.y },
      recorded: false,
    };
    if (event.pointerType === 'touch') {
      this.scheduleLongPress(this.local(event), node.id);
    }
    this.capture(event);
  }

  protected onResizeDown(node: BoardNode, event: PointerEvent): void {
    if (this.readonly()) return;
    this.store.select(node.id);
    this.drag = {
      mode: 'resize',
      nodeId: node.id,
      startBoard: this.store.viewport.screenToBoard(this.local(event)),
      startCols: node.size.cols,
      startRows: node.size.rows,
      recorded: false,
    };
    this.capture(event);
  }

  protected onResizeAuto(node: BoardNode): void {
    if (!this.readonly()) this.store.autoSizeNode(node.id);
  }

  protected onPortDown(node: BoardNode, pointer: PortPointer): void {
    if (this.readonly() || pointer.port.role !== 'output') return;
    const anchor = portAnchor(node, pointer.port);
    this.drag = {
      mode: 'connect',
      from: { nodeId: node.id, portId: pointer.port.id },
      anchor,
      side: pointer.port.side,
    };
    this.draftPath.set(edgePath(anchor, anchor, pointer.port.side, 'left'));
    this.capture(pointer.event);
  }

  protected onEdgeDown(id: string, event: PointerEvent): void {
    event.stopPropagation();
    this.store.select(id, event.shiftKey || event.metaKey);
  }

  // ── Context-menu actions ─────────────────────────────────────────────────
  protected addNode(kind: NodeKind, category?: ActionCategory): void {
    const menu = this.menu();
    if (this.readonly() || !menu) return;
    this.store.addNode({
      kind,
      category,
      title: this.titleCase(category ?? kind),
      pos: menu.cell,
    });
    this.menu.set(null);
  }

  protected deleteNode(): void {
    const id = this.menu()?.nodeId;
    this.menu.set(null);
    if (!id || this.readonly()) return;
    const node = this.store.nodes().find((n) => n.id === id);
    this.askDelete(this.nodeLabel(node), () => this.store.removeNode(id));
  }

  // ── Delete safety ────────────────────────────────────────────────────────
  /**
   * Delete the current selection. Removing a node is destructive, so it must be
   * confirmed first; a selection of only connections is removed straight away.
   */
  protected requestDeleteSelected(): void {
    if (this.readonly()) return;
    const sel = this.store.selection();
    if (!sel.size) return;
    const nodes = this.store.nodes().filter((n) => sel.has(n.id));
    if (!nodes.length) {
      this.store.removeSelected(); // edges only — no confirmation needed
      return;
    }
    const label =
      nodes.length === 1 ? this.nodeLabel(nodes[0]) : `${nodes.length} nodes`;
    this.askDelete(label, () => this.store.removeSelected());
  }

  /** Open the confirmation dialog for a pending deletion. */
  private askDelete(label: string, action: () => void): void {
    this.pendingDelete = action;
    this.confirmMessage.set(
      `Delete ${label}? This also removes its connections. You can undo this.`,
    );
    this.confirmOpen.set(true);
  }

  /** Confirm and perform the pending deletion. */
  protected confirmDelete(): void {
    this.pendingDelete?.();
    this.pendingDelete = null;
    this.confirmOpen.set(false);
  }

  /** Discard a pending deletion (dialog dismissed / cancelled). */
  protected cancelDelete(): void {
    this.pendingDelete = null;
    this.confirmOpen.set(false);
  }

  private nodeLabel(node: BoardNode | undefined): string {
    const title = node?.title?.trim();
    return title ? `"${title}"` : 'this node';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private openMenu(local: Point, nodeId?: string): void {
    this.menu.set({
      x: local.x,
      y: local.y,
      cell: snapToCell(this.store.viewport.screenToBoard(local)),
      nodeId,
    });
  }

  private scheduleLongPress(local: Point, nodeId?: string): void {
    this.cancelLongPress();
    this.longPress = setTimeout(() => {
      this.drag = null;
      this.draftPath.set(null);
      this.openMenu(local, nodeId);
    }, LONG_PRESS_MS);
  }

  private cancelLongPress(): void {
    if (this.longPress) {
      clearTimeout(this.longPress);
      this.longPress = undefined;
    }
  }

  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.hostEl.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private size(): Size {
    const el = this.hostEl.nativeElement;
    return { width: el.clientWidth, height: el.clientHeight };
  }

  /**
   * Alignment guides for the dragged node: vertical lines where its left / centre
   * / right matches another node's, and horizontal lines for top / centre /
   * bottom. Each line spans the two aligned nodes.
   */
  private computeGuides(
    draggedId: string,
  ): { x1: number; y1: number; x2: number; y2: number }[] {
    const nodes = this.store.nodes();
    const dragged = nodes.find((n) => n.id === draggedId);
    if (!dragged) return [];
    const d = nodeRect(dragged);
    const dV = [d.x, d.x + d.width / 2, d.x + d.width];
    const dH = [d.y, d.y + d.height / 2, d.y + d.height];
    const seen = new Set<string>();
    const guides: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const node of nodes) {
      if (node.id === draggedId) continue;
      const r = nodeRect(node);
      for (const v of [r.x, r.x + r.width / 2, r.x + r.width]) {
        if (dV.some((x) => Math.abs(x - v) < 0.5)) {
          const key = `v${v}`;
          if (seen.has(key)) continue;
          seen.add(key);
          guides.push({
            x1: v,
            y1: Math.min(d.y, r.y),
            x2: v,
            y2: Math.max(d.y + d.height, r.y + r.height),
          });
        }
      }
      for (const h of [r.y, r.y + r.height / 2, r.y + r.height]) {
        if (dH.some((y) => Math.abs(y - h) < 0.5)) {
          const key = `h${h}`;
          if (seen.has(key)) continue;
          seen.add(key);
          guides.push({
            x1: Math.min(d.x, r.x),
            y1: h,
            x2: Math.max(d.x + d.width, r.x + r.width),
            y2: h,
          });
        }
      }
    }
    return guides;
  }

  private center(): Point {
    const { width, height } = this.size();
    return { x: width / 2, y: height / 2 };
  }

  /** Normalized rectangle (positive width/height) between two local points. */
  private rectFrom(a: Point, b: Point): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }

  private portAt(clientX: number, clientY: number): PortHit | null {
    const el = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('.pe-port');
    if (!el) return null;
    const { node: nodeId, port: portId, role } = el.dataset;
    return nodeId && portId && role ? { nodeId, portId, role } : null;
  }

  private nodeAt(clientX: number, clientY: number): string | undefined {
    return document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('pe-node')?.dataset['nodeId'];
  }

  private capture(event: PointerEvent): void {
    this.hostEl.nativeElement.setPointerCapture(event.pointerId);
  }

  private release(event: PointerEvent): void {
    try {
      this.hostEl.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  protected titleCase(value: string): string {
    return value
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }
}
