import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  BoardStore,
  edgePath,
  nodeRect,
  portAnchor,
  snapToCell,
} from '@tsai-pe/board/core';
import { BoardGrid, NodeView, type PortPointer } from '@tsai-pe/board/ui';
import {
  type ActionCategory,
  type BoardNode,
  type EdgeEnd,
  type GridPos,
  type NodeKind,
  type Pipeline,
  type Point,
  type PortSide,
  type Rect,
  type Size,
} from '@tsai-pe/shared/models';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 4;
const ZOOM_STEP = 1.2;

/** A resolved port drop target under the cursor. */
interface PortHit {
  nodeId: string;
  portId: string;
  role: string;
}

type Drag =
  | { mode: 'pan'; startClient: Point; startPan: Point; moved: boolean }
  | { mode: 'move'; nodeId: string; startBoard: Point; startPx: Point }
  | { mode: 'connect'; from: EdgeEnd; anchor: Point; side: PortSide }
  | { mode: 'select'; startLocal: Point; additive: boolean };

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
  imports: [BoardGrid, NodeView],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    tabindex: '0',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
    '(contextmenu)': 'onContextMenu($event)',
    '(wheel)': 'onWheel($event)',
    '(keydown)': 'onKeyDown($event)',
  },
})
export class Board {
  /** Pipeline document to render. Reloaded into the store whenever it changes. */
  readonly pipeline = input<Pipeline | null>(null);

  protected readonly store = new BoardStore();

  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  private drag: Drag | null = null;
  private longPress?: ReturnType<typeof setTimeout>;

  /** Live bezier path while drawing a connection. */
  protected readonly draftPath = signal<string | null>(null);
  protected readonly menu = signal<ContextMenu | null>(null);
  /** Rubber-band selection rectangle, in local (screen) pixels. */
  protected readonly marquee = signal<Rect | null>(null);

  /** Nodes with the selected ones last, so selection paints on top. */
  protected readonly orderedNodes = computed(() => {
    const sel = this.store.selection();
    return [...this.store.nodes()].sort(
      (a, b) => Number(sel.has(a.id)) - Number(sel.has(b.id)),
    );
  });

  constructor() {
    effect(() => {
      const pipeline = this.pipeline();
      if (pipeline) this.store.load(pipeline);
    });
  }

  // ── Board-level pointer handling (empty space, pan, drop) ────────────────
  protected onPointerDown(event: PointerEvent): void {
    this.menu.set(null);
    this.hostEl.nativeElement.focus();
    if (this.drag) return; // a node/port handler already claimed this press

    const pan = event.button === 2 || event.pointerType === 'touch';
    if (pan) {
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
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) this.cancelLongPress();
      this.store.moveNode(
        drag.nodeId,
        snapToCell({ x: drag.startPx.x + dx, y: drag.startPx.y + dy }),
      );
    } else if (drag.mode === 'connect') {
      this.cancelLongPress();
      const board = this.store.viewport.screenToBoard(this.local(event));
      this.draftPath.set(edgePath(drag.anchor, board, drag.side, 'left'));
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
    if (!drag) return;

    if (drag.mode === 'select') {
      this.marquee.set(null);
    } else if (drag.mode === 'connect') {
      this.draftPath.set(null);
      const hit = this.portAt(event.clientX, event.clientY);
      if (hit && hit.role === 'input') {
        this.store.connect(drag.from, {
          nodeId: hit.nodeId,
          portId: hit.portId,
        });
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
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.store.removeSelected();
        break;
      case 'Escape':
        this.menu.set(null);
        this.store.clearSelection();
        break;
      case 'f':
      case 'F':
        this.fitView();
        break;
    }
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
    const rect = nodeRect(node);
    this.drag = {
      mode: 'move',
      nodeId: node.id,
      startBoard: this.store.viewport.screenToBoard(this.local(event)),
      startPx: { x: rect.x, y: rect.y },
    };
    if (event.pointerType === 'touch') {
      this.scheduleLongPress(this.local(event), node.id);
    }
    this.capture(event);
  }

  protected onPortDown(node: BoardNode, pointer: PortPointer): void {
    if (pointer.port.role !== 'output') return;
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
    if (!menu) return;
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
    if (id) this.store.removeNode(id);
    this.menu.set(null);
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

  private local(event: PointerEvent | WheelEvent): Point {
    const rect = this.hostEl.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private size(): Size {
    const el = this.hostEl.nativeElement;
    return { width: el.clientWidth, height: el.clientHeight };
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
