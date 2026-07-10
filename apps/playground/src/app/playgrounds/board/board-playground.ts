import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Board } from '@tsai-pe/board/feature';
import {
  type BoardNode,
  defaultPorts,
  type Pipeline,
} from '@tsai-pe/shared/models';

/** Build a node, deriving its default port layout from its kind. */
function node(spec: Omit<BoardNode, 'ports'>): BoardNode {
  return { ...spec, ports: defaultPorts(spec.kind) };
}

const SIZE = { cols: 8, rows: 2 } as const;

/**
 * The "draw 10 cats" demo pipeline — the canonical example of the split/merge
 * buffer semantics, all wired with strict 1:1 connections. Nodes are laid out in
 * two dimensions so the orthogonal router visibly bends edges around nodes, and
 * merge fans out to a required `send` effect and an optional `logger`:
 *
 *   Telegram → LLM agent → split → Image generator → merge(10) ┬→ Telegram send
 *                                                              └→ Logger (optional)
 */
const CAT_PIPELINE: Pipeline = {
  id: 'demo-cats',
  name: 'Draw 10 cats',
  nodes: [
    node({
      id: 'node-1',
      kind: 'trigger',
      title: 'Telegram',
      subtitle: '"draw 10 cats"',
      pos: { col: 2, row: 8 },
      size: SIZE,
      status: 'success',
    }),
    node({
      id: 'node-2',
      kind: 'action',
      category: 'integration',
      title: 'LLM Agent',
      subtitle: '→ { count: 10, commands }',
      pos: { col: 12, row: 8 },
      size: SIZE,
    }),
    node({
      id: 'node-3',
      kind: 'action',
      category: 'split',
      title: 'Split',
      subtitle: 'array → per element',
      pos: { col: 22, row: 8 },
      size: SIZE,
    }),
    node({
      id: 'node-4',
      kind: 'action',
      category: 'integration',
      title: 'Image Generator',
      subtitle: 'one cat per command',
      pos: { col: 32, row: 3 },
      size: SIZE,
      status: 'running',
    }),
    node({
      id: 'node-5',
      kind: 'action',
      category: 'merge',
      title: 'Merge',
      subtitle: 'buffer until complete',
      pos: { col: 42, row: 8 },
      size: SIZE,
      bufferSize: 10,
    }),
    node({
      id: 'node-6',
      kind: 'effect',
      title: 'Telegram',
      subtitle: 'send 10 cats',
      pos: { col: 54, row: 3 },
      size: SIZE,
      required: true,
    }),
    node({
      id: 'node-7',
      kind: 'effect',
      title: 'Logger',
      subtitle: 'best-effort',
      pos: { col: 54, row: 13 },
      size: SIZE,
      required: false,
      status: 'error',
    }),
  ],
  edges: [
    edge('e1', 'node-1', 'out-right', 'node-2'),
    edge('e2', 'node-2', 'out-right', 'node-3'),
    edge('e3', 'node-3', 'out-right', 'node-4'),
    edge('e4', 'node-4', 'out-right', 'node-5'),
    edge('e5', 'node-5', 'out-top', 'node-6'),
    edge('e6', 'node-5', 'out-bottom', 'node-7'),
  ],
};

// Label the merge node's fan-out ports so their connections show branch names.
for (const p of CAT_PIPELINE.nodes.find((n) => n.id === 'node-5')?.ports ?? []) {
  if (p.id === 'out-top') p.label = 'primary';
  if (p.id === 'out-bottom') p.label = 'fallback';
}

/** A 1:1 connection from a node's output port onto the next node's input. */
function edge(id: string, from: string, fromPort: string, to: string) {
  return {
    id,
    source: { nodeId: from, portId: fromPort },
    target: { nodeId: to, portId: 'in' },
  };
}

/** Playground for the `board` (canvas) domain: the interactive `<pe-board>` editor. */
@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Board],
  template: `<div class="flex h-[75dvh] flex-col gap-3">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-text-2">
        Drag from the palette to add nodes · drag a node to move it · drag a right /
        top / bottom port onto a left port to connect · rubber-band to multi-select ·
        right mouse / middle / Space+drag pans, scroll or <kbd>⌘/Ctrl</kbd>+<kbd>±</kbd>
        zooms · minimap navigates · arrows nudge · <kbd>⌘/Ctrl+Z</kbd> undo,
        <kbd>C</kbd>/<kbd>V</kbd> copy-paste, <kbd>Del</kbd> delete, <kbd>F</kbd> fit.
      </p>
      <label
        class="flex shrink-0 items-center gap-2 text-sm text-text-2 select-none"
      >
        <input
          type="checkbox"
          [checked]="readonly()"
          (change)="readonly.set($any($event.target).checked)"
        />
        Read-only
      </label>
    </div>
    <pe-board
      [pipeline]="pipeline"
      [readonly]="readonly()"
      class="min-h-0 flex-1 overflow-hidden rounded-xl border border-border"
    />
  </div>`,
})
export class BoardPlayground {
  protected readonly pipeline = CAT_PIPELINE;
  protected readonly readonly = signal(false);
}
