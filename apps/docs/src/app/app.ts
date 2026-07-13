import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  Board,
  PIPELINE_BACKEND,
  PIPELINE_NODE_CATALOG,
  PIPELINE_STORE,
} from '@tsai-pe/board';
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
  Table,
  type TableColumn,
  type TableRow,
  Tag,
} from '@tsai-pe/ui-kit';

interface NavItem {
  id: string;
  label: string;
}

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
    Board,
    Button,
    Card,
    Alert,
    Badge,
    Tag,
    Input,
    Select,
    Table,
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
  protected readonly isLight = signal(false);
  protected readonly active = signal('start');
  protected readonly search = signal('customer.email');
  protected readonly backendMode = signal<string[]>(['rest-ws']);
  protected readonly pipeline = signal(STARTER_PIPELINE);

  protected readonly nav: NavItem[] = [
    { id: 'start', label: 'Start' },
    { id: 'install', label: 'Install' },
    { id: 'board', label: 'Board' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'backend', label: 'Backend' },
    { id: 'ui-kit', label: 'UI Kit' },
    { id: 'publish', label: 'Publish' },
  ];

  protected readonly packageColumns: TableColumn[] = [
    { key: 'name', label: 'Package' },
    { key: 'purpose', label: 'Purpose' },
  ];

  protected readonly packages: TableRow[] = [
    { name: '@tsai-pe/board', purpose: '<pe-board> editor and tokens' },
    { name: '@tsai-pe/ui-kit', purpose: 'Reusable Angular UI controls' },
    { name: '@tsai-pe/theme', purpose: 'Tailwind v4 tokens and global CSS' },
    {
      name: '@tsai-pe/models',
      purpose: 'Pipeline, store and backend contracts',
    },
    { name: '@tsai-pe/nodes', purpose: 'Node catalog and parameter schemas' },
  ];

  protected readonly backendOptions: SelectOption[] = [
    { value: 'rest-ws', label: 'REST + WebSocket adapter' },
    { value: 'local', label: 'Local prototype backend' },
    { value: 'readonly', label: 'Read-only catalog viewer' },
  ];

  protected readonly installSnippet = `npm install @tsai-pe/board @tsai-pe/ui-kit @tsai-pe/theme @tsai-pe/models @tsai-pe/nodes lucide-angular @angular/cdk @angular/aria`;

  protected readonly stylesSnippet = `/* src/styles.css */
@import '@tsai-pe/theme';
@import '@angular/cdk/overlay-prebuilt.css';

@source '../node_modules/@tsai-pe/board';
@source '../node_modules/@tsai-pe/ui-kit';`;

  protected readonly boardSnippet = `import { Component, signal } from '@angular/core';
import { Board, PIPELINE_BACKEND, PIPELINE_NODE_CATALOG, PIPELINE_STORE } from '@tsai-pe/board';
import type { Pipeline } from '@tsai-pe/models';

@Component({
  standalone: true,
  selector: 'app-workflow-builder',
  imports: [Board],
  providers: [
    { provide: PIPELINE_BACKEND, useExisting: MyPipelineBackend },
    { provide: PIPELINE_STORE, useExisting: MyPipelineStore },
    { provide: PIPELINE_NODE_CATALOG, useValue: MY_NODE_CATALOG },
  ],
  template: \`<pe-board class="block h-dvh" [pipeline]="pipeline()" />\`,
})
export class WorkflowBuilder {
  readonly pipeline = signal<Pipeline>(initialPipeline);
}`;

  protected readonly catalogSnippet = `import { createNodeCatalog } from '@tsai-pe/nodes';

export const MY_NODE_CATALOG = createNodeCatalog([
  {
    id: 'crm-create-lead',
    label: 'Create CRM Lead',
    section: 'CRM',
    kind: 'effect',
    params: [
      { key: 'email', label: 'Email', type: 'expression', required: true },
      { key: 'priority', label: 'Priority', type: 'select', options: [
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
      ] },
    ],
    outputExample: { leadId: 'lead_123', status: 'created' },
  },
]);`;

  protected readonly backendSnippet = `import type { Pipeline, PipelineBackend, RunListener, Unsubscribe } from '@tsai-pe/models';

export class RestPipelineBackend implements PipelineBackend {
  startRun(pipeline: Pipeline): string {
    return crypto.randomUUID();
  }

  observe(runId: string, listener: RunListener): Unsubscribe {
    const socket = new WebSocket(\`/api/runs/\${runId}/events\`);
    socket.onmessage = (event) => listener(JSON.parse(event.data));
    return () => socket.close();
  }

  stop(runId: string): void {
    void fetch(\`/api/runs/\${runId}/stop\`, { method: 'POST' });
  }
}`;

  protected readonly publishSnippet = `npm exec -- nx run-many -t lint typecheck test vite:test build
npm exec -- nx release
npm exec -- nx build docs --base-href=/pipeline-editor/docs/`;

  protected go(id: string): void {
    this.active.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  protected toggleTheme(): void {
    const next = !this.isLight();
    this.isLight.set(next);
    document.documentElement.classList.toggle('light', next);
  }
}
