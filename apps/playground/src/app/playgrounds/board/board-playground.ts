import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Board, PIPELINE_BACKEND, PIPELINE_STORE } from '@tsai-pe/board';
import { Button, DialogService, ToastService } from '@tsai-pe/ui-kit';
import { type BoardNode, type Pipeline } from '@tsai-pe/models';
import { derivePorts } from '@tsai-pe/nodes';
import {
  LocalStoragePipelineStore,
  type MockSideEffect,
  TestBackendSystem,
} from '@tsai-pe/workflow-mock';

/** Build a node, deriving its port layout from its kind/config. */
function node(spec: Omit<BoardNode, 'ports'>): BoardNode {
  return { ...spec, ports: derivePorts({ ...spec, ports: [] }) };
}

const SIZE = { cols: 8, rows: 2 } as const;
const TELEGRAM_PROMPT = 'Draw 10 cats and 20 elephants';
const TELEGRAM_MEDIA_COMMANDS = [
  ...Array.from({ length: 10 }, (_, index) => ({
    subject: 'cat',
    index: index + 1,
    prompt: `Cat ${index + 1}: playful studio portrait, warm light`,
  })),
  ...Array.from({ length: 20 }, (_, index) => ({
    subject: 'elephant',
    index: index + 1,
    prompt: `Elephant ${index + 1}: cinematic safari scene, soft dust`,
  })),
];
const TELEGRAM_MEDIA_PLAN = {
  count: TELEGRAM_MEDIA_COMMANDS.length,
  commands: TELEGRAM_MEDIA_COMMANDS,
};

/**
 * Multi-trigger demo: two channel triggers feed one switch via `$trigger.channel`.
 * Telegram takes the media fan-out path; WhatsApp takes a direct reply path; the
 * default branch logs unknown triggers. The editor still only talks to the
 * backend abstraction — this seed just makes the mock backend's live states easy
 * to inspect.
 */
const CAT_PIPELINE: Pipeline = {
  id: 'demo-multi-trigger',
  name: 'Multi-channel support flow',
  nodes: [
    node({
      id: 'tg-trigger',
      type: 'telegram-trigger',
      kind: 'trigger',
      title: 'Telegram',
      subtitle: 'message.received',
      pos: { col: 2, row: 4 },
      size: SIZE,
      data: {
        chat: '@support_bot',
        event: 'message.received',
        sampleOutput: {
          source: 'telegram',
          message: TELEGRAM_PROMPT,
          chatId: 4242,
        },
      },
    }),
    node({
      id: 'wa-trigger',
      type: 'whatsapp-trigger',
      kind: 'trigger',
      title: 'WhatsApp',
      subtitle: 'message.received',
      pos: { col: 2, row: 13 },
      size: SIZE,
      data: { number: '+15550101', event: 'message.received' },
    }),
    node({
      id: 'norm-tg',
      type: 'set-fields',
      kind: 'action',
      category: 'transform',
      title: 'Normalize Telegram',
      subtitle: '$json.message → text',
      pos: { col: 12, row: 4 },
      size: SIZE,
      data: { field: 'text', value: '{{ $json.message }}' },
    }),
    node({
      id: 'norm-wa',
      type: 'set-fields',
      kind: 'action',
      category: 'transform',
      title: 'Normalize WhatsApp',
      subtitle: '$json.chat.text → text',
      pos: { col: 12, row: 13 },
      size: SIZE,
      data: { field: 'text', value: '{{ $json.chat.text }}' },
    }),
    node({
      id: 'switch-trigger',
      kind: 'action',
      category: 'control-flow',
      title: 'Switch by Trigger',
      subtitle: '$trigger.channel',
      pos: { col: 23, row: 8 },
      size: { cols: 9, rows: 4 },
      config: {
        type: 'switch',
        discriminant: '$trigger.channel',
        cases: [
          { id: 'tg', label: 'telegram', value: 'telegram' },
          { id: 'wa', label: 'whatsapp', value: 'whatsapp' },
        ],
        hasDefault: true,
      },
    }),
    node({
      id: 'llm',
      type: 'llm-agent',
      kind: 'action',
      category: 'integration',
      title: 'Plan Telegram Media',
      subtitle: 'text → commands[30]',
      pos: { col: 35, row: 2 },
      size: SIZE,
      data: {
        model: 'mock-llm',
        prompt:
          'Parse the user request and produce one image command per requested image: {{ $json.text }}',
        mockOutput: TELEGRAM_MEDIA_PLAN,
      },
    }),
    node({
      id: 'split',
      type: 'split',
      kind: 'action',
      category: 'split',
      title: 'Split Commands',
      subtitle: 'commands → items',
      pos: { col: 45, row: 2 },
      size: SIZE,
      data: { items: '{{ $json.commands }}', mode: 'sequential' },
    }),
    node({
      id: 'download-plan',
      type: 'download-file',
      kind: 'effect',
      title: 'Download Plan',
      subtitle: '30 commands JSON',
      pos: { col: 45, row: 6 },
      size: SIZE,
      required: false,
      data: {
        fileName: 'telegram-plan.json',
        content: '{{ $node["Plan Telegram Media"] }}',
        mimeType: 'application/json',
      },
    }),
    node({
      id: 'parse-plan-csv',
      type: 'csv-parse',
      kind: 'action',
      category: 'transform',
      title: 'Parse CSV Sample',
      subtitle: 'request totals',
      pos: { col: 45, row: -2 },
      size: SIZE,
      data: {
        csv: 'subject,count\ncats,10\nelephants,20',
        delimiter: ',',
        headers: true,
      },
    }),
    node({
      id: 'render-plan',
      type: 'markdown-render',
      kind: 'action',
      category: 'transform',
      title: 'Render Summary',
      subtitle: 'markdown → html',
      pos: { col: 55, row: -2 },
      size: SIZE,
      data: {
        markdown:
          '## Telegram plan\n\n- Request: {{ $node["Plan Telegram Media"].prompt }}\n- Total images: {{ $node["Plan Telegram Media"].count }}\n- First prompt: {{ $node["Plan Telegram Media"].commands[0].prompt }}',
      },
    }),
    node({
      id: 'image',
      type: 'image-gen',
      kind: 'action',
      category: 'integration',
      title: 'Image Generator',
      subtitle: 'one render per command',
      pos: { col: 55, row: 2 },
      size: SIZE,
      data: {
        model: 'mock-image-v1',
        prompt: '{{ $json.prompt }}',
      },
    }),
    node({
      id: 'merge',
      type: 'merge',
      kind: 'action',
      category: 'merge',
      title: 'Merge Renders',
      subtitle: 'buffer ×30 → batch',
      pos: { col: 65, row: 2 },
      size: SIZE,
      data: {
        expectedCount: '{{ $node["Plan Telegram Media"].count }}',
      },
    }),
    node({
      id: 'send-tg',
      type: 'telegram-send',
      kind: 'effect',
      title: 'Telegram Send',
      subtitle: 'required',
      pos: { col: 75, row: -2 },
      size: SIZE,
      required: true,
      data: {
        chat: '{{ $node["Telegram"].chatId }}',
        text: 'Generated {{ $node["Plan Telegram Media"].count }} images for {{ $trigger.title }}',
      },
    }),
    node({
      id: 'preview-tg',
      type: 'image-preview',
      kind: 'effect',
      title: 'Image Preview',
      subtitle: 'browser modal',
      pos: { col: 75, row: 2 },
      size: SIZE,
      required: true,
      data: {
        title: 'Generated images',
        images: '{{ $json.batch }}',
        caption:
          '{{ $node["Plan Telegram Media"].count }} generated images for {{ $trigger.title }}',
      },
    }),
    node({
      id: 'wa-format',
      type: 'set-fields',
      kind: 'action',
      category: 'transform',
      title: 'Format WhatsApp Reply',
      subtitle: 'fan out effects',
      pos: { col: 35, row: 13 },
      size: SIZE,
      data: {
        field: 'reply',
        value: 'Thanks, we received: {{ $json.text }}',
      },
    }),
    node({
      id: 'send-wa',
      type: 'whatsapp-send',
      kind: 'effect',
      title: 'WhatsApp Send',
      subtitle: 'direct response',
      pos: { col: 65, row: 10 },
      size: SIZE,
      required: true,
      data: {
        number: '{{ $node["WhatsApp"].chat.from }}',
        text: '{{ $json.reply }}',
      },
    }),
    node({
      id: 'wa-delay',
      type: 'delay',
      kind: 'action',
      category: 'transform',
      title: 'Typing Delay',
      subtitle: '800 ms',
      pos: { col: 55, row: 13 },
      size: SIZE,
      data: {
        duration: 800,
      },
    }),
    node({
      id: 'wa-query',
      type: 'json-query',
      kind: 'action',
      category: 'transform',
      title: 'Extract Reply',
      subtitle: 'reply → preview',
      pos: { col: 65, row: 16 },
      size: SIZE,
      data: {
        mode: 'pick',
        expression: '{{ $json.reply }}',
        field: 'preview',
      },
    }),
    node({
      id: 'unknown-log',
      type: 'logger',
      kind: 'effect',
      title: 'Unknown Trigger Log',
      subtitle: 'default branch',
      pos: { col: 35, row: 24 },
      size: SIZE,
      required: false,
      data: {
        level: 'warn',
        message: 'Unhandled trigger {{ $trigger.type }}',
      },
    }),
    node({
      id: 'sla-filter',
      kind: 'action',
      category: 'control-flow',
      title: 'VIP Filter',
      subtitle: 'optional alert',
      pos: { col: 45, row: 19 },
      size: { cols: 8, rows: 3 },
      config: { type: 'filter', expression: '$trigger.channel == "whatsapp"' },
    }),
    node({
      id: 'sla-log',
      type: 'toast-effect',
      kind: 'effect',
      title: 'WhatsApp Toast',
      subtitle: 'fast lane notice',
      pos: { col: 58, row: 19 },
      size: SIZE,
      required: false,
      data: {
        title: 'WhatsApp fast lane',
        message: '{{ $json.reply }}',
        variant: 'info',
        duration: 5000,
      },
    }),
  ],
  edges: [
    edge('e1', 'tg-trigger', 'out-right', 'norm-tg'),
    edge('e2', 'wa-trigger', 'out-right', 'norm-wa'),
    edge('e3', 'norm-tg', 'out-right', 'switch-trigger'),
    edge('e4', 'norm-wa', 'out-right', 'switch-trigger'),
    edge('e5', 'switch-trigger', 'case-tg', 'llm'),
    edge('e6', 'llm', 'out-right', 'split'),
    edge('e17', 'llm', 'out-bottom', 'download-plan'),
    edge('e21', 'llm', 'out-top', 'parse-plan-csv'),
    edge('e22', 'parse-plan-csv', 'out-right', 'render-plan'),
    edge('e7', 'split', 'out-right', 'image'),
    edge('e8', 'image', 'out-right', 'merge'),
    edge('e9', 'merge', 'out-top', 'send-tg'),
    edge('e16', 'merge', 'out-right', 'preview-tg'),
    edge('e11', 'switch-trigger', 'case-wa', 'wa-format'),
    edge('e12', 'wa-format', 'out-right', 'wa-delay'),
    edge('e19', 'wa-delay', 'out-right', 'send-wa'),
    edge('e20', 'wa-delay', 'out-bottom', 'wa-query'),
    edge('e15', 'wa-format', 'out-bottom', 'sla-filter'),
    edge('e13', 'sla-filter', 'pass', 'sla-log'),
    edge('e14', 'switch-trigger', 'default', 'unknown-log'),
  ],
};

const BOARD_STORAGE = new LocalStoragePipelineStore(
  browserStorage(),
  `tsai-pe:board-playground:${playgroundBuildCommit()}`,
);
BOARD_STORAGE.seed(CAT_PIPELINE);
const DEMO_BACKEND = new TestBackendSystem({
  stepDelayMs: 550,
  tickProgressMs: 120,
  firingTrigger: 'tg-trigger',
});

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
  imports: [Board, Button],
  host: { class: 'block h-full min-h-0' },
  providers: [
    {
      provide: PIPELINE_BACKEND,
      useValue: DEMO_BACKEND,
    },
    {
      provide: PIPELINE_STORE,
      useValue: BOARD_STORAGE,
    },
  ],
  template: `<div class="flex h-full flex-col gap-3">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-text-2">
        Drag from the palette to add nodes · drag a node to move it · drag a
        right / top / bottom port onto a left port to connect · rubber-band to
        multi-select · right mouse / middle / Space+drag pans, scroll or
        <kbd>⌘/Ctrl</kbd>+<kbd>±</kbd> zooms · minimap navigates · arrows nudge
        · <kbd>⌘/Ctrl+Z</kbd> undo, <kbd>C</kbd>/<kbd>V</kbd> copy-paste,
        <kbd>Del</kbd> delete, <kbd>F</kbd> fit.
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
      <tsai-button variant="secondary" size="sm" (click)="resetInitial()">
        Reset to initial
      </tsai-button>
    </div>
    <pe-board
      [pipeline]="pipeline()"
      [readonly]="readonly()"
      class="min-h-0 flex-1 overflow-hidden rounded-xl border border-border"
    />
  </div>`,
})
export class BoardPlayground {
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  protected readonly pipeline = signal(
    clone(BOARD_STORAGE.loadSync(CAT_PIPELINE.id) ?? CAT_PIPELINE),
  );
  protected readonly readonly = signal(false);

  constructor() {
    const unsub = DEMO_BACKEND.observeSideEffects((event) => {
      if (event.kind === 'toast') {
        this.toasts.show({
          title: event.title,
          message: event.message,
          variant: event.variant,
          duration: event.duration,
        });
      } else if (event.kind === 'dialog') {
        this.dialogs.show({
          title: event.title,
          body: event.body,
          imageUrl: event.imageUrl,
          images: event.images,
          json: event.json,
          size: 'lg',
        });
      } else if (event.kind === 'download') {
        this.download(event);
      }
    });
    inject(DestroyRef).onDestroy(unsub);
  }

  protected resetInitial(): void {
    BOARD_STORAGE.clear();
    BOARD_STORAGE.seed(CAT_PIPELINE);
    this.pipeline.set(clone(CAT_PIPELINE));
  }

  private download(event: Extract<MockSideEffect, { kind: 'download' }>): void {
    const blob = new Blob([event.content], { type: event.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = event.fileName;
    a.click();
    URL.revokeObjectURL(url);
    this.toasts.show({
      title: 'Download ready',
      message: event.fileName,
      variant: 'success',
    });
  }
}

function browserStorage(): Storage {
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage;
  }
  return new MemoryStorage();
}

function playgroundBuildCommit(): string {
  const global = globalThis as { __TSAI_PE_PLAYGROUND_COMMIT__?: unknown };
  const commit = global.__TSAI_PE_PLAYGROUND_COMMIT__;
  return typeof commit === 'string' && commit.trim() ? commit.trim() : 'dev';
}

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function clone(pipeline: Pipeline): Pipeline {
  return JSON.parse(JSON.stringify(pipeline)) as Pipeline;
}
