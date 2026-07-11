import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { GRID_CELL } from '@tsai-pe/board/core';
import {
  type BoardNode,
  isControlFlow,
  type NodePort,
  type NodeStatus,
  nodeType,
  portFraction,
  type PortSide,
} from '@tsai-pe/shared/models';
import { CONTROL_FLOW_ICONS, NODE_META } from './node-meta';

/** A raw pointer intent originating from a specific port. */
export interface PortPointer {
  port: NodePort;
  event: PointerEvent;
}

/** Perpendicular offset + centring transform per side (the along-side position
 * is set as an inline % so ports on a shared side distribute evenly). */
const PORT_POSITION: Record<PortSide, string> = {
  left: 'left-[-11px] -translate-y-1/2',
  right: 'right-[-11px] -translate-y-1/2',
  top: 'top-[-11px] -translate-x-1/2',
  bottom: 'bottom-[-11px] -translate-x-1/2',
};

/**
 * Presentational node. Positioned in world pixels (absolute, inside the board's
 * transformed world layer). Visually distinct per node type via {@link NODE_META}
 * (rail color + icon). Styled entirely with Tailwind utilities — port
 * prominence / target state are driven by bindings, not host-state CSS.
 */
@Component({
  selector: 'pe-node',
  imports: [LucideAngularModule],
  templateUrl: './node-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block absolute select-none',
    '[attr.data-node-id]': 'node().id',
    '[style.left.px]': 'rect().x',
    '[style.top.px]': 'rect().y',
    '[style.width.px]': 'rect().width',
    '[style.height.px]': 'rect().height',
    '[style.--node-accent]': 'meta().color',
    '(pointerenter)': 'hovered.set(true)',
    '(pointerleave)': 'hovered.set(false)',
    '(dblclick)': 'onOpen($event)',
  },
})
export class NodeView {
  readonly node = input.required<BoardNode>();
  readonly selected = input(false);
  /** True while a connection is being drawn — input ports light up as targets. */
  readonly connecting = input(false);
  /** Id of the port currently being magnet-targeted, if it belongs to this node. */
  readonly targetPort = input<string | null>(null);
  /** Whether the resize handle is shown (disabled in read-only mode). */
  readonly resizable = input(true);
  /** Live run status; overrides the node's own status while a run is active. */
  readonly runStatus = input<NodeStatus | undefined>(undefined);

  /** Pointer went down on the node body (select / start move). */
  readonly bodyPointerDown = output<PointerEvent>();
  /** Pointer went down on a port (start drawing a connection from an output). */
  readonly portPointerDown = output<PortPointer>();
  /** Pointer released over a port (drop a connection onto an input). */
  readonly portPointerUp = output<PortPointer>();
  /** Double-click — request opening the node inspector. */
  readonly openRequested = output<void>();
  /** Pointer went down on the resize handle (start resizing). */
  readonly resizePointerDown = output<PointerEvent>();
  /** Double-click the resize handle — request auto-sizing. */
  readonly resizeAuto = output<void>();

  protected readonly hovered = signal(false);

  protected readonly meta = computed(() => {
    const node = this.node();
    const base = NODE_META[nodeType(node)];
    // Control-flow subtypes (if / switch / filter) get a distinct icon.
    if (isControlFlow(node) && node.config) {
      return { ...base, icon: CONTROL_FLOW_ICONS[node.config.type] };
    }
    return base;
  });

  /** Fractional along-side position of a port (for even distribution). */
  protected fraction(port: NodePort): number {
    return portFraction(this.node(), port) * 100;
  }

  protected isAlongY(side: PortSide): boolean {
    return side === 'left' || side === 'right';
  }

  protected readonly rect = computed(() => {
    const n = this.node();
    return {
      x: n.pos.col * GRID_CELL,
      y: n.pos.row * GRID_CELL,
      width: n.size.cols * GRID_CELL,
      height: n.size.rows * GRID_CELL,
    };
  });

  /** Execution-status overlay classes (border ring + corner badge), or null. */
  protected readonly statusOverlay = computed(() => {
    switch (this.runStatus() ?? this.node().status) {
      case 'running':
        return {
          ring: 'border-2 border-[var(--info)] animate-pulse',
          dot: 'bg-[var(--info)] animate-pulse',
        };
      case 'success':
        return {
          ring: 'border-2 border-[var(--success)]',
          dot: 'bg-[var(--success)]',
        };
      case 'error':
        return {
          ring: 'border-2 border-[var(--danger)]',
          dot: 'bg-[var(--danger)]',
        };
      default:
        return null;
    }
  });

  /** Body classes, with selection accent overriding the resting border/shadow. */
  protected readonly bodyClasses = computed(() => {
    const base =
      'relative flex items-center gap-2.5 h-full pr-3.5 pl-4 overflow-hidden ' +
      'rounded-[var(--r-md)] border bg-[var(--surface-2)] cursor-grab select-none ' +
      'transition-[border-color,box-shadow] duration-150 active:cursor-grabbing';
    return this.selected()
      ? `${base} border-[var(--node-accent)] shadow-[var(--elev-2),0_0_0_1px_var(--node-accent)]`
      : `${base} border-[var(--border)] shadow-[var(--elev-1)]`;
  });

  protected onBodyPointerDown(event: PointerEvent): void {
    this.bodyPointerDown.emit(event);
  }

  protected onPortPointerDown(port: NodePort, event: PointerEvent): void {
    event.stopPropagation();
    this.portPointerDown.emit({ port, event });
  }

  protected onPortPointerUp(port: NodePort, event: PointerEvent): void {
    event.stopPropagation();
    this.portPointerUp.emit({ port, event });
  }

  protected onOpen(event: MouseEvent): void {
    event.preventDefault();
    this.openRequested.emit();
  }

  protected onResizeDown(event: PointerEvent): void {
    event.stopPropagation();
    this.resizePointerDown.emit(event);
  }

  protected onResizeAuto(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizeAuto.emit();
  }

  /** Positioned, generous transparent hit area for a port. */
  protected portClasses(port: NodePort): string {
    return (
      'pe-port group absolute grid place-items-center w-[22px] h-[22px] p-0 ' +
      'bg-transparent cursor-crosshair ' +
      PORT_POSITION[port.side]
    );
  }

  /** The visible dot: shape by role, prominence by node/port state. */
  protected dotClasses(port: NodePort): string {
    const shape =
      port.role === 'output'
        ? 'rounded-full border-[var(--node-accent)] bg-[var(--node-accent)]'
        : 'rounded-[3px] border-[var(--port-border)] bg-[var(--surface-1)]';
    const base =
      'w-[11px] h-[11px] border-2 duration-150 ' +
      'transition-[transform,opacity,border-color,background] ' +
      'group-hover:opacity-100 group-hover:scale-[1.3] group-hover:border-[var(--node-accent)] ' +
      shape;

    if (this.targetPort() === port.id) {
      return `${base} opacity-100 scale-150 border-[var(--node-accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--node-accent)_22%,transparent)]`;
    }
    const reveal =
      this.selected() ||
      this.hovered() ||
      (this.connecting() && port.role === 'input');
    return `${base} ${reveal ? 'opacity-100' : 'opacity-35'}`;
  }

  /** Human tooltip for a port. */
  protected portTitle(port: NodePort): string {
    return port.role === 'input'
      ? 'Input — receives data'
      : `Output (${port.side}) — drag to connect`;
  }
}
