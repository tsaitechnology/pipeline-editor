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
import { LucideAngularModule, Moon, Sun } from 'lucide-angular';
import { CodeBlock } from './code-block';

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
    LucideAngularModule,
    CodeBlock,
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

  protected readonly nav: NavItem[] = [
    { id: 'start', label: 'Start' },
    { id: 'install', label: 'Install' },
    { id: 'board', label: 'Board' },
    { id: 'concepts', label: 'Concepts' },
    { id: 'model', label: 'Model' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'params', label: 'Params' },
    { id: 'ports', label: 'Ports' },
    { id: 'styling', label: 'Styling' },
    { id: 'expressions', label: 'Expressions' },
    { id: 'backend', label: 'Backend' },
    { id: 'security', label: 'Security' },
    { id: 'recipes', label: 'Recipes' },
    { id: 'reference', label: 'Reference' },
    { id: 'ui-kit', label: 'UI Kit' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
    { id: 'production', label: 'Production' },
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

  protected readonly paramColumns: TableColumn[] = [
    { key: 'type', label: 'Type' },
    { key: 'use', label: 'Use' },
  ];

  protected readonly conceptColumns: TableColumn[] = [
    { key: 'piece', label: 'Piece' },
    { key: 'owner', label: 'Owner' },
    { key: 'why', label: 'Why it matters' },
  ];

  protected readonly concepts: TableRow[] = [
    {
      piece: 'Pipeline document',
      owner: 'Host app',
      why: 'Serializable graph you can store, diff, import and run.',
    },
    {
      piece: 'Node catalog',
      owner: 'Product/backend team',
      why: 'Controls palette entries, inspector fields, ports and expression help.',
    },
    {
      piece: 'Board UI',
      owner: '@tsai-pe/board',
      why: 'Canvas, editing, validation, inspector, run overlay and persistence controls.',
    },
    {
      piece: 'Runtime backend',
      owner: 'Your system',
      why: 'Executes semantics, credentials, logs, retries and side effects.',
    },
  ];

  protected readonly lifecycleColumns: TableColumn[] = [
    { key: 'step', label: 'Step' },
    { key: 'contract', label: 'Contract' },
  ];

  protected readonly lifecycle: TableRow[] = [
    {
      step: '1. Catalog',
      contract: 'Describe what users can add and configure.',
    },
    {
      step: '2. Edit',
      contract: '`pe-board` updates the graph and validates wiring.',
    },
    {
      step: '3. Save',
      contract: '`PipelineStore.save()` persists the serializable document.',
    },
    {
      step: '4. Run',
      contract: '`PipelineBackend.startRun()` submits a snapshot.',
    },
    {
      step: '5. Observe',
      contract:
        '`observe()` streams node status, outputs, edge activity and logs.',
    },
  ];

  protected readonly params: TableRow[] = [
    { type: 'text / textarea / url', use: 'Plain user-entered strings' },
    { type: 'number / boolean / select', use: 'Typed configuration controls' },
    { type: 'expression', use: '$json, $trigger and upstream node refs' },
    { type: 'json / object / array', use: 'Structured payloads and repeaters' },
    { type: 'secret / credential', use: 'Backend-owned sensitive references' },
    { type: 'code', use: 'Sandboxed transform snippets' },
    { type: 'model / resource-picker', use: 'Product-specific selectors' },
  ];

  protected readonly apiColumns: TableColumn[] = [
    { key: 'name', label: 'API' },
    { key: 'contract', label: 'Contract' },
  ];

  protected readonly apis: TableRow[] = [
    {
      name: 'Board',
      contract: '`pipeline`, `readonly`, injected capabilities',
    },
    {
      name: 'NodeTypeSpec',
      contract: 'Palette entry, params, ports and output help',
    },
    {
      name: 'ParamField',
      contract: 'Inspector field schema and visibility rules',
    },
    { name: 'PipelineBackend', contract: '`startRun`, `observe`, `stop`' },
    {
      name: 'PipelineStore',
      contract: '`save`, `load`, `list`, `remove`, `runHistory`',
    },
  ];

  protected readonly issueColumns: TableColumn[] = [
    { key: 'symptom', label: 'Symptom' },
    { key: 'fix', label: 'Fix' },
  ];

  protected readonly tokenColumns: TableColumn[] = [
    { key: 'token', label: 'Token' },
    { key: 'description', label: 'Description' },
  ];

  protected readonly tokens: TableRow[] = [
    {
      token: '--accent',
      description: 'Primary actions, focus and selected state.',
    },
    {
      token: '--canvas-bg',
      description: 'Board well behind nodes and connection routing.',
    },
    {
      token: '--node-trigger',
      description: 'Trigger rail, icon and port accent.',
    },
    {
      token: '--node-integration',
      description: 'Integration/action node accent.',
    },
    {
      token: '--node-control-flow',
      description: 'If, switch, filter and router accent.',
    },
    {
      token: '--node-effect',
      description: 'Terminal side-effect node accent.',
    },
  ];

  protected readonly componentColumns: TableColumn[] = [
    { key: 'component', label: 'Component' },
    { key: 'use', label: 'Use' },
  ];

  protected readonly components: TableRow[] = [
    {
      component: 'tsai-button / badge / tag',
      use: 'Actions, status, filters and compact metadata.',
    },
    {
      component: 'tsai-input / select / textarea',
      use: 'Host settings panels and custom node forms.',
    },
    {
      component: 'tsai-expression-field',
      use: 'Expression authoring with scoped autocomplete.',
    },
    {
      component: 'tsai-json-view / variable',
      use: 'Output inspection and draggable references.',
    },
    {
      component: 'tsai-dialog / modal-overlay / toast',
      use: 'Confirmation, import/export and runtime feedback.',
    },
    {
      component: 'tsai-sidebar / navbar / actionbar',
      use: 'Product shell around the board.',
    },
  ];

  protected readonly productionColumns: TableColumn[] = [
    { key: 'area', label: 'Area' },
    { key: 'check', label: 'Check' },
  ];

  protected readonly production: TableRow[] = [
    {
      area: 'Catalog versioning',
      check:
        'Keep stable `id`s; migrate saved pipelines when params or ports change.',
    },
    {
      area: 'Credentials',
      check:
        'Store secret values outside the pipeline document; nodes reference credential ids.',
    },
    {
      area: 'Validation',
      check:
        'Reject invalid graphs server-side even if the editor already warns users.',
    },
    {
      area: 'Run isolation',
      check:
        'Submit an immutable pipeline snapshot and label updates with one run id.',
    },
    {
      area: 'Observability',
      check:
        'Persist logs, terminal status and run history for later inspection.',
    },
    {
      area: 'Permissions',
      check:
        'Filter catalog entries and credential pickers by the current user/team.',
    },
  ];

  protected readonly issues: TableRow[] = [
    {
      symptom: 'Board is invisible',
      fix: 'Give the host a real height, for example `h-dvh` or a flex child with `min-h-0`.',
    },
    {
      symptom: 'Styles are missing',
      fix: 'Import `@tsai-pe/theme` and include `@source ../node_modules/@tsai-pe` in Tailwind v4 styles.',
    },
    {
      symptom: 'Palette is empty',
      fix: 'Provide `PIPELINE_NODE_CATALOG` with at least one `NodeTypeSpec`.',
    },
    {
      symptom: 'Run button is missing',
      fix: 'Provide `PIPELINE_BACKEND`; omit it intentionally for design-only editors.',
    },
    {
      symptom: 'Save/Open are missing',
      fix: 'Provide `PIPELINE_STORE`; read-only viewers usually omit it.',
    },
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

  protected readonly pipelineSnippet = `import type { Pipeline } from '@tsai-pe/models';

export const leadPipeline: Pipeline = {
  id: 'lead-intake',
  name: 'Lead intake',
  nodes: [
    {
      id: 'webhook',
      type: 'webhook-trigger',
      kind: 'trigger',
      title: 'Webhook',
      pos: { col: 2, row: 2 },
      size: { cols: 7, rows: 2 },
      ports: [{ id: 'out-right', role: 'output', side: 'right' }],
      data: { path: '/lead' },
    },
  ],
  edges: [],
};`;

  protected readonly nodeSpecSnippet = `export interface NodeTypeSpec {
  id: string;
  label: string;
  section?: string;
  kind: 'trigger' | 'action' | 'effect';
  category?: 'control-flow' | 'transform' | 'integration' | 'split' | 'merge';
  params: ParamField[];
  ports?: NodePortSpec;
  outputSchema?: OutputSchema;
  outputExample?: Record<string, unknown>;
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

  protected readonly paramSnippet = `{
  key: 'body',
  label: 'Request body',
  type: 'object',
  section: 'HTTP',
  fields: [
    { key: 'url', label: 'URL', type: 'url', required: true },
    { key: 'method', label: 'Method', type: 'select', options: [
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
    ] },
    { key: 'payload', label: 'Payload', type: 'json', visibleWhen: {
      key: 'method',
      equals: 'POST',
    } },
  ],
} satisfies ParamField;`;

  protected readonly portSnippet = `import type { NodeTypeSpec } from '@tsai-pe/nodes';

export const ROUTER_NODE = {
  id: 'route-by-segment',
  label: 'Route by segment',
  section: 'Logic',
  kind: 'action',
  category: 'control-flow',
  params: [
    { key: 'field', label: 'Field', type: 'expression', defaultValue: '$json.segment' },
    {
      key: 'routes',
      label: 'Routes',
      type: 'array',
      item: [
        { key: 'id', label: 'Port id', type: 'text', required: true },
        { key: 'label', label: 'Label', type: 'text', required: true },
      ],
    },
  ],
  ports: {
    static: [{ id: 'in', role: 'input', side: 'left' }],
    dynamic: [
      { from: 'routes', id: '{{ id }}', label: '{{ label }}', role: 'output' },
    ],
    conditional: [
      { when: 'fallback', id: 'fallback', label: 'Fallback', role: 'output' },
    ],
  },
  outputExample: { segment: 'enterprise', matched: true },
} satisfies NodeTypeSpec;`;

  protected readonly stylingSnippet = `/* app styles */
@import '@tsai-pe/theme';
@import '@angular/cdk/overlay-prebuilt.css';

@source '../node_modules/@tsai-pe/board';
@source '../node_modules/@tsai-pe/ui-kit';

:root {
  --accent: #22b8cf;
  --node-integration: #845ef7;
  --node-effect: #f06595;
}

.light {
  --accent: #0b7285;
}`;

  protected readonly credentialSnippet = `export const SEND_EMAIL_NODE: NodeTypeSpec = {
  id: 'send-email',
  label: 'Send Email',
  kind: 'effect',
  section: 'Messaging',
  params: [
    { key: 'credentialId', label: 'SMTP account', type: 'credential', required: true },
    { key: 'to', label: 'To', type: 'expression', required: true },
    { key: 'subject', label: 'Subject', type: 'expression', required: true },
    { key: 'body', label: 'Body', type: 'textarea', required: true },
  ],
  outputExample: { messageId: 'msg_123', accepted: true },
};

// Runtime rule: the pipeline stores credential ids, never secret values.
const credential = await credentialVault.resolve(node.data.credentialId);`;

  protected readonly expressionSnippet = `import type { ExpressionScope } from '@tsai-pe/ui-kit';

readonly scope: ExpressionScope = {
  trigger: ['body.email', 'headers.authorization'],
  json: ['customer.email', 'customer.plan', 'score'],
  nodes: [
    { title: 'Score Lead', paths: ['score', 'segment', 'reason'] },
    { title: 'Create CRM Lead', paths: ['leadId', 'status'] },
  ],
};

template: \`
  <tsai-expression-field
    [value]="message"
    [scope]="scope"
    [template]="true"
    (valueChange)="message = $event"
  />
\`;`;

  protected readonly recipeSnippet = `export const SUPPORT_TRIAGE = createNodeCatalog([
  webhookTrigger(),
  llmClassifier({
    id: 'classify-ticket',
    labels: ['billing', 'bug', 'feature'],
    outputExample: { label: 'billing', priority: 'high' },
  }),
  router({
    id: 'route-ticket',
    routes: ['billing', 'bug', 'feature'],
  }),
  effect({
    id: 'create-linear-issue',
    params: ['title', 'description', 'teamId'],
  }),
]);`;

  protected readonly eventSnippet = `backend.observe(runId, (snapshot) => {
  for (const [nodeId, run] of Object.entries(snapshot.nodes)) {
    updateNodeStatus(nodeId, run.status);
    if (run.output) cacheOutputForInspector(nodeId, run.output);
  }

  appendLogs(snapshot.log);
});`;

  protected readonly snapshotSnippet = `export interface RunSnapshot {
  runId: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'canceled';
  nodes: Record<string, {
    nodeId: string;
    status: 'idle' | 'running' | 'success' | 'error' | 'skipped';
    output?: unknown;
    error?: string;
    buffer?: { done: number; total: number };
  }>;
  edges?: Record<string, { edgeId: string; status: 'idle' | 'active' }>;
  log: { at: number; nodeId?: string; message: string }[];
  passes?: { triggerIndex: number; outputs: Record<string, unknown> }[];
}`;

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

  protected readonly storeSnippet = `import type { Pipeline, PipelineStore, PipelineSummary, RunSummary } from '@tsai-pe/models';

export class HttpPipelineStore implements PipelineStore {
  async list(): Promise<PipelineSummary[]> {
    return fetch('/api/pipelines').then((res) => res.json());
  }

  async load(id: string): Promise<Pipeline | null> {
    const res = await fetch(\`/api/pipelines/\${id}\`);
    if (res.status === 404) return null;
    return res.json();
  }

  async save(pipeline: Pipeline): Promise<void> {
    await fetch(\`/api/pipelines/\${pipeline.id}\`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pipeline),
    });
  }

  async remove(id: string): Promise<void> {
    await fetch(\`/api/pipelines/\${id}\`, { method: 'DELETE' });
  }

  async runHistory(pipelineId: string): Promise<RunSummary[]> {
    return fetch(\`/api/pipelines/\${pipelineId}/runs\`).then((res) => res.json());
  }
}`;

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
