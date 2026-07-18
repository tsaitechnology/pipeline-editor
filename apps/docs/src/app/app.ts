import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { BoardStore } from '@tsai-pe/board-core';
import {
  Board,
  PIPELINE_BACKEND,
  PIPELINE_NODE_CATALOG,
  PIPELINE_STORE,
} from '@tsai-pe/board';
import {
  BoardSurface,
  NodeInspector,
  PipelineEdgeLayer,
  PipelineNode,
} from '@tsai-pe/pipeline-ui-kit';
import type { BoardNode, Pipeline } from '@tsai-pe/models';
import { MOCK_NODE_CATALOG, TestBackendSystem } from '@tsai-pe/workflow-mock';
import { InMemoryPipelineStore } from '@tsai-pe/workflow-mock';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Select,
  type SelectOption,
  Tag,
} from '@tsai-pe/ui-kit';
import { LucideAngularModule, Moon, Sun } from 'lucide-angular';
import { CodeBlock } from './code-block';
import { DocInlinePipe } from './doc-inline.pipe';
import { DOC_SECTIONS, type DocSection, type DocToken } from './generated-docs';

const DEMO_BACKEND = new TestBackendSystem({
  stepDelayMs: 350,
  tickProgressMs: 100,
});
const DEMO_STORE = new InMemoryPipelineStore();

const SIZE = { cols: 7, rows: 2 } as const;

function node(spec: Omit<BoardNode, 'ports'>): BoardNode {
  return { ...spec, ports: MOCK_NODE_CATALOG.ports({ ...spec, ports: [] }) };
}

function edge(id: string, from: string, fromPort: string, to: string) {
  return {
    id,
    source: { nodeId: from, portId: fromPort },
    target: { nodeId: to, portId: 'in' },
  };
}

const STARTER_PIPELINE: Pipeline = {
  id: 'docs-starter',
  name: 'Docs starter pipeline',
  nodes: [
    node({
      id: 'trigger',
      type: 'webhook-trigger',
      kind: 'trigger',
      title: 'Webhook',
      subtitle: 'POST /lead',
      pos: { col: 2, row: 3 },
      size: SIZE,
      data: {
        method: 'POST',
        path: '/lead',
        body: { email: 'ada@example.com', plan: 'pro' },
      },
    }),
    node({
      id: 'score',
      type: 'llm-agent',
      kind: 'action',
      category: 'integration',
      title: 'Score Lead',
      subtitle: 'classify intent',
      pos: { col: 13, row: 3 },
      size: SIZE,
      data: {
        model: 'mock-llm',
        prompt: 'Score lead quality from {{ $json.body.email }}',
        mockOutput: { score: 0.91, segment: 'enterprise' },
      },
    }),
    node({
      id: 'branch',
      type: 'if',
      kind: 'action',
      category: 'control-flow',
      title: 'High intent?',
      subtitle: '$json.score > 0.8',
      pos: { col: 24, row: 3 },
      size: { cols: 8, rows: 3 },
      data: { expression: '$json.score > 0.8' },
    }),
    node({
      id: 'notify',
      type: 'toast-effect',
      kind: 'effect',
      title: 'Notify Sales',
      subtitle: 'required',
      pos: { col: 36, row: 2 },
      size: SIZE,
      required: true,
      data: {
        title: 'Hot lead',
        message: '{{ $json.segment }} lead is ready for sales',
        variant: 'success',
      },
    }),
  ],
  edges: [
    edge('e1', 'trigger', 'out-right', 'score'),
    edge('e2', 'score', 'out-right', 'branch'),
    edge('e3', 'branch', 'true', 'notify'),
  ],
};

DEMO_STORE.save(STARTER_PIPELINE);

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgClass,
    NgTemplateOutlet,
    Board,
    BoardSurface,
    PipelineEdgeLayer,
    PipelineNode,
    NodeInspector,
    Button,
    Card,
    Alert,
    Badge,
    Tag,
    Input,
    Select,
    LucideAngularModule,
    CodeBlock,
    DocInlinePipe,
  ],
  providers: [
    { provide: PIPELINE_BACKEND, useValue: DEMO_BACKEND },
    { provide: PIPELINE_STORE, useValue: DEMO_STORE },
    { provide: PIPELINE_NODE_CATALOG, useValue: MOCK_NODE_CATALOG },
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly Sun = Sun;
  protected readonly Moon = Moon;
  protected readonly isLight = signal(false);
  protected readonly active = signal('start');
  protected readonly search = signal('customer.email');
  protected readonly backendMode = signal<string[]>(['rest-ws']);
  protected readonly pipeline = signal(STARTER_PIPELINE);
  protected readonly nodeCatalog = MOCK_NODE_CATALOG;
  protected readonly kitStore = new BoardStore(MOCK_NODE_CATALOG);
  protected readonly kitSelectedId = signal('score');
  protected readonly kitStatus = signal<'idle' | 'running' | 'success'>('idle');

  protected readonly sections = DOC_SECTIONS;
  protected readonly startSection = DOC_SECTIONS[0];
  protected readonly contentSections = DOC_SECTIONS.slice(1);

  protected readonly kitSelectedNode = computed(() =>
    this.kitStore.nodes().find((node) => node.id === this.kitSelectedId()),
  );

  protected readonly backendOptions: SelectOption[] = [
    { value: 'rest-ws', label: 'REST + WebSocket adapter' },
    { value: 'local', label: 'Local prototype backend' },
    { value: 'readonly', label: 'Read-only catalog viewer' },
  ];

  constructor() {
    this.kitStore.load(STARTER_PIPELINE);
    this.kitStore.viewport.fitTo(this.kitStore.contentBounds(), {
      width: 760,
      height: 300,
    });
  }

  protected go(id: string): void {
    this.active.set(id);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }

  protected toggleTheme(): void {
    const light = !this.isLight();
    this.isLight.set(light);
    document.documentElement.classList.toggle('light', light);
  }

  protected selectKitNode(id: string): void {
    this.kitSelectedId.set(id);
    this.kitStore.select(id);
  }

  protected updateKitNode(node: BoardNode): void {
    this.kitStore.updateNode(node.id, node);
  }

  protected cycleKitStatus(): void {
    this.kitStatus.update((status) =>
      status === 'idle' ? 'running' : status === 'running' ? 'success' : 'idle',
    );
  }

  protected tableColumns(token: Extract<DocToken, { type: 'table' }>) {
    return token.columns.map((column, index) => ({ column, index }));
  }

  protected sectionNumber(section: DocSection): string {
    return String(section.order / 10).padStart(2, '0');
  }

  protected sectionHref(section: DocSection): string {
    return `#${section.id}`;
  }
}
