import {
  type ActionCategory,
  type BoardNode,
  type ControlFlowConfig,
  type ControlFlowKind,
  defaultPorts,
  type NodeKind,
  type NodePort,
  type NodeType,
  nodeType,
} from '@tsai-pe/models';

/**
 * Node-type registry (n8n-style descriptions) shared by the editor and the
 * future execution engine. For now it covers control-flow: mapping a node's
 * configuration to its named output ports, and the default config per subtype.
 *
 * Lives in `shared` (its own lib) so both `board` (editor) and the `workflow`
 * engine can depend on it without crossing scope boundaries.
 */

/** Whether a node is a control-flow node (if / switch / filter). */
export function isControlFlow(
  node: Pick<BoardNode, 'kind' | 'category'>,
): boolean {
  return node.kind === 'action' && node.category === 'control-flow';
}

/** The named branch outputs implied by a control-flow configuration. */
export function controlFlowOutputs(
  config: ControlFlowConfig,
): { id: string; label: string }[] {
  switch (config.type) {
    case 'if':
      return [
        { id: 'true', label: 'true' },
        { id: 'false', label: 'false' },
      ];
    case 'switch':
      return [
        ...config.cases.map((c) => ({
          id: `case-${c.id}`,
          label: c.label || c.value || 'case',
        })),
        ...(config.hasDefault ? [{ id: 'default', label: 'default' }] : []),
      ];
    case 'filter':
      return [{ id: 'pass', label: 'pass' }];
  }
}

/**
 * Ports for a node. Control-flow nodes derive named output ports (stacked on the
 * right) from their config; everything else uses the default 3-anchor layout.
 */
export function derivePorts(node: BoardNode): NodePort[] {
  if (isControlFlow(node) && node.config) {
    return [
      { id: 'in', role: 'input', side: 'left' },
      ...controlFlowOutputs(node.config).map((o): NodePort => ({
        id: o.id,
        role: 'output',
        side: 'right',
        label: o.label,
      })),
    ];
  }
  return defaultPorts(node.kind);
}

/** The kind of input a node parameter takes (drives the inspector form). */
export type ParamType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'boolean'
  | 'select'
  | 'expression'
  | 'file'
  | 'json'
  | 'array'
  | 'object'
  | 'secret'
  | 'credential'
  | 'code'
  | 'url'
  | 'model'
  | 'resource-picker';

/** One configurable parameter of a node type. */
export interface ParamField {
  key: string;
  label: string;
  type: ParamType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  accept?: string;
  multiple?: boolean;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  language?: 'json' | 'javascript' | 'typescript' | 'markdown' | 'text';
  defaultValue?: unknown;
  visibleWhen?: { key: string; equals: unknown };
  /** Options for `select`. */
  options?: { value: string; label: string }[];
}

/**
 * Illustrative parameter schema per node type. A real backend would supply this
 * (its node catalog); here it stands in so the inspector renders meaningful,
 * type-specific forms. Values are stored in `BoardNode.data`. Control-flow uses
 * its own dedicated config form, so it has no generic params here.
 */
const PARAM_SCHEMAS: Record<NodeType, ParamField[]> = {
  trigger: [
    {
      key: 'event',
      label: 'Event',
      type: 'text',
      placeholder: 'message.received',
    },
  ],
  integration: [
    {
      key: 'service',
      label: 'Service',
      type: 'select',
      options: [
        { value: 'http', label: 'HTTP' },
        { value: 'llm', label: 'LLM' },
        { value: 'image', label: 'Image generation' },
      ],
    },
    { key: 'endpoint', label: 'Endpoint / model', type: 'text' },
    { key: 'prompt', label: 'Prompt / body', type: 'expression' },
  ],
  transform: [
    {
      key: 'expression',
      label: 'Expression',
      type: 'expression',
      placeholder: 'item.value * 2',
    },
  ],
  effect: [
    {
      key: 'target',
      label: 'Target',
      type: 'text',
      placeholder: 'chat id / url',
    },
    { key: 'message', label: 'Message', type: 'expression' },
  ],
  split: [
    {
      key: 'items',
      label: 'Items',
      type: 'expression',
      placeholder: '{{ $json.commands }}',
      help: 'Array expression to fan out; mock uses its length when available.',
      required: true,
    },
  ],
  merge: [],
  'control-flow': [],
};

/**
 * A concrete node type in the catalog. Triggers / integrations / effects are
 * open-ended — each type declares its own `params`. A real backend would supply
 * this catalog (its available nodes + credentials); here a seed stands in.
 */
export interface NodeTypeSpec {
  id: string;
  label: string;
  kind: NodeKind;
  category?: ActionCategory;
  params: ParamField[];
  /**
   * Illustrative shape this node produces, used to seed expression help (the
   * variable paths downstream nodes may reference) before a run and, in the mock,
   * as a node's run output. A real backend would supply the true output schema.
   */
  output?: Record<string, unknown>;
  /** Optional typed output schema; static catalog infers this from `output`. */
  outputSchema?: OutputSchema;
}

export type OutputSchema =
  | { type: 'string' | 'number' | 'boolean' | 'null' }
  | { type: 'array'; items?: OutputSchema }
  | { type: 'object'; properties: Record<string, OutputSchema> };

/**
 * Runtime/catalog contract. The static catalog below implements it for the mock
 * and playground; a real backend can provide the same surface from REST/WS
 * metadata without changing the board or runtime consumers.
 */
export interface NodeCatalog {
  /** Catalog version for cache invalidation and compatibility checks. */
  readonly version: string;
  /** All node specs visible to the editor/runtime. */
  specs(): readonly NodeTypeSpec[];
  /** Look up a concrete catalog type. */
  entry(type: string | undefined): NodeTypeSpec | undefined;
  /** Parameter schema for a node, including category fallbacks. */
  params(node: Pick<BoardNode, 'kind' | 'category' | 'type'>): ParamField[];
  /** Typed output schema used for autocomplete/validation by future adapters. */
  outputSchema(type: string | undefined): OutputSchema | undefined;
  /** Demo/sample output used by the mock runtime and fallback autocomplete. */
  sampleOutput(type: string | undefined): Record<string, unknown> | undefined;
}

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
];

/**
 * Seed node catalog. Grouped by category via `nodeType`.
 *
 * @experimental A stand-in for a real backend's node catalog — expect it to be
 * supplied by the backend (and this constant to shrink/move) as the contract
 * matures.
 */
export const NODE_CATALOG: NodeTypeSpec[] = [
  // Triggers — each channel emits a different message shape, so downstream
  // transforms must normalize (see `output`, used by expression help).
  {
    id: 'telegram-trigger',
    label: 'Telegram',
    kind: 'trigger',
    params: [{ key: 'chat', label: 'Chat / bot', type: 'text' }],
    output: {
      source: 'telegram',
      message: 'Hello from Telegram',
      chatId: 4242,
    },
  },
  {
    id: 'whatsapp-trigger',
    label: 'WhatsApp',
    kind: 'trigger',
    params: [{ key: 'number', label: 'Number / bot', type: 'text' }],
    output: {
      source: 'whatsapp',
      chat: { text: 'Hi via WhatsApp', from: '+15550101' },
    },
  },
  {
    id: 'slack-trigger',
    label: 'Slack',
    kind: 'trigger',
    params: [
      {
        key: 'channel',
        label: 'Channel',
        type: 'text',
        placeholder: '#general',
      },
    ],
    output: {
      source: 'slack',
      event: { text: 'Yo from Slack', user: 'U0421', channel: 'C7' },
    },
  },
  {
    id: 'webhook-trigger',
    label: 'Webhook',
    kind: 'trigger',
    params: [
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: METHOD_OPTIONS,
      },
      { key: 'path', label: 'Path', type: 'text', placeholder: '/hook' },
      { key: 'headers', label: 'Headers', type: 'json' },
      { key: 'body', label: 'Body', type: 'json' },
    ],
    output: {
      source: 'webhook',
      method: 'POST',
      path: '/hook',
      headers: { 'content-type': 'application/json' },
      body: { text: 'payload' },
    },
  },
  {
    id: 'schedule-trigger',
    label: 'Schedule',
    kind: 'trigger',
    params: [
      { key: 'cron', label: 'Cron', type: 'text', placeholder: '*/5 * * * *' },
      {
        key: 'timezone',
        label: 'Timezone',
        type: 'text',
        placeholder: 'UTC',
      },
      {
        key: 'demoTicks',
        label: 'Demo ticks',
        type: 'number',
        min: 1,
        max: 10,
      },
    ],
    output: { source: 'schedule', firedAt: 0, tick: 1 },
  },
  {
    id: 'interval-trigger',
    label: 'Interval',
    kind: 'trigger',
    params: [
      { key: 'intervalMs', label: 'Interval ms', type: 'number', min: 1 },
      { key: 'maxTicks', label: 'Max ticks', type: 'number', min: 1, max: 20 },
      { key: 'startImmediately', label: 'Start immediately', type: 'boolean' },
      { key: 'jitterMs', label: 'Jitter ms', type: 'number', min: 0 },
    ],
    output: { source: 'interval', tick: 1, scheduledAt: 0 },
  },
  {
    id: 'file-trigger',
    label: 'File',
    kind: 'trigger',
    params: [
      { key: 'file', label: 'Sample file', type: 'file', accept: '*/*' },
      {
        key: 'sampleText',
        label: 'Sample text',
        type: 'textarea',
        placeholder: 'hello,file',
        rows: 5,
      },
      { key: 'mime', label: 'MIME type', type: 'text', placeholder: 'text/csv' },
    ],
    output: {
      source: 'file',
      file: { name: 'sample.csv', mime: 'text/csv', size: 18, text: 'id,name' },
    },
  },
  {
    id: 'manual-form-trigger',
    label: 'Manual Form',
    kind: 'trigger',
    params: [
      { key: 'schema', label: 'Form schema', type: 'json' },
      { key: 'samplePayload', label: 'Sample payload', type: 'json' },
    ],
    output: {
      source: 'manual',
      form: { customer: 'Ada', priority: 'high' },
    },
  },
  // Integrations
  {
    id: 'http-request',
    label: 'HTTP Request',
    kind: 'action',
    category: 'integration',
    params: [
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: METHOD_OPTIONS,
      },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'body', label: 'Body', type: 'json', language: 'json' },
    ],
    output: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true, id: 'res_123' },
    },
  },
  {
    id: 'public-api-request',
    label: 'Public API',
    kind: 'action',
    category: 'integration',
    params: [
      {
        key: 'preset',
        label: 'Preset',
        type: 'select',
        options: [
          { value: 'jsonplaceholder', label: 'JSONPlaceholder' },
          { value: 'hacker-news', label: 'Hacker News' },
          { value: 'github-zen', label: 'GitHub Zen' },
          { value: 'custom', label: 'Custom URL' },
        ],
      },
      {
        key: 'url',
        label: 'URL',
        type: 'url',
        placeholder: 'https://jsonplaceholder.typicode.com/todos/1',
        visibleWhen: { key: 'preset', equals: 'custom' },
      },
      { key: 'timeoutMs', label: 'Timeout ms', type: 'number', min: 100 },
    ],
    output: {
      status: 200,
      url: 'https://jsonplaceholder.typicode.com/todos/1',
      body: { id: 1, title: 'delectus aut autem', completed: false },
    },
  },
  {
    id: 'llm-agent',
    label: 'LLM Agent',
    kind: 'action',
    category: 'integration',
    params: [
      {
        key: 'model',
        label: 'Model',
        type: 'model',
        options: [
          { value: 'gpt', label: 'GPT' },
          { value: 'claude', label: 'Claude' },
          { value: 'llama', label: 'Llama' },
        ],
      },
      { key: 'prompt', label: 'Prompt', type: 'expression' },
    ],
    output: {
      text: 'Draw 10 cats',
      count: 10,
      commands: [{ prompt: 'A playful orange cat in watercolor' }],
    },
  },
  {
    id: 'image-gen',
    label: 'Image Generator',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'model' },
      { key: 'prompt', label: 'Prompt', type: 'expression' },
    ],
    output: {
      imageUrl: 'https://example.test/cat.png',
      prompt: 'A playful orange cat in watercolor',
    },
  },
  {
    id: 'text-classification',
    label: 'Text Classification',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'model' },
      {
        key: 'text',
        label: 'Text',
        type: 'expression',
        placeholder: '{{ $json.message }}',
      },
      {
        key: 'labels',
        label: 'Labels',
        type: 'array',
        placeholder: '["sales","support","other"]',
      },
    ],
    output: { label: 'support', confidence: 0.92 },
  },
  {
    id: 'sentiment-classifier',
    label: 'Sentiment / Priority',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'model' },
      { key: 'text', label: 'Text', type: 'expression' },
    ],
    output: {
      sentiment: 'positive',
      priority: 'normal',
      toxicity: 0.01,
      confidence: 0.88,
    },
  },
  {
    id: 'ocr-image-recognition',
    label: 'OCR / Image Recognition',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'model' },
      { key: 'image', label: 'Image file', type: 'file', accept: 'image/*' },
      { key: 'imageUrl', label: 'Image URL', type: 'url' },
    ],
    output: {
      text: 'Invoice #1001',
      classes: [{ label: 'document', confidence: 0.94 }],
    },
  },
  {
    id: 'embedding-similarity',
    label: 'Embedding Similarity',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'model' },
      { key: 'text', label: 'Text', type: 'expression' },
      { key: 'query', label: 'Query', type: 'expression' },
    ],
    output: {
      score: 0.82,
      embedding: [0.12, -0.08, 0.31],
      similar: true,
    },
  },
  // Transforms
  {
    id: 'set-fields',
    label: 'Set Fields',
    kind: 'action',
    category: 'transform',
    // Extract from upstream context into a unified field (an expression param, so
    // the inspector offers context-variable chips) — the normalization step.
    params: [
      { key: 'field', label: 'Field', type: 'text', placeholder: 'message' },
      {
        key: 'value',
        label: 'Value',
        type: 'expression',
        placeholder: '{{ $node["Telegram"].message }}',
      },
    ],
    output: { source: 'telegram', message: 'normalized text' },
  },
  {
    id: 'code',
    label: 'Code',
    kind: 'action',
    category: 'transform',
    params: [
      {
        key: 'code',
        label: 'JS',
        type: 'textarea',
        placeholder: 'return items;',
      },
    ],
    output: { value: 'computed', items: [{ id: 1, value: 'row' }] },
  },
  {
    id: 'delay',
    label: 'Delay',
    kind: 'action',
    category: 'transform',
    params: [
      {
        key: 'duration',
        label: 'Duration ms',
        type: 'number',
        placeholder: '1000',
      },
    ],
    output: { delayed: true },
  },
  {
    id: 'throttle',
    label: 'Throttle',
    kind: 'action',
    category: 'transform',
    params: [
      { key: 'windowMs', label: 'Window ms', type: 'number', min: 1 },
      { key: 'key', label: 'Key', type: 'expression', placeholder: '{{ $trigger.id }}' },
    ],
    output: { throttled: false, windowMs: 1000 },
  },
  {
    id: 'debounce',
    label: 'Debounce',
    kind: 'action',
    category: 'transform',
    params: [
      { key: 'windowMs', label: 'Window ms', type: 'number', min: 1 },
      { key: 'key', label: 'Key', type: 'expression', placeholder: '{{ $trigger.id }}' },
    ],
    output: { debounced: true, windowMs: 1000 },
  },
  {
    id: 'repeat',
    label: 'Repeat',
    kind: 'action',
    category: 'transform',
    params: [
      { key: 'count', label: 'Count', type: 'number', min: 1, max: 100 },
      {
        key: 'item',
        label: 'Item template',
        type: 'expression',
        placeholder: '{{ $json }}',
      },
    ],
    output: { items: [{ index: 0, value: 'demo' }], count: 1 },
  },
  {
    id: 'json-query',
    label: 'JSON Query',
    kind: 'action',
    category: 'transform',
    params: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'pick', label: 'Pick into field' },
          { value: 'replace', label: 'Replace payload' },
          { value: 'filter-items', label: 'Filter items' },
        ],
      },
      {
        key: 'expression',
        label: 'Expression',
        type: 'expression',
        placeholder: '{{ $json.message }}',
      },
      {
        key: 'field',
        label: 'Field',
        type: 'text',
        placeholder: 'result',
      },
    ],
    output: { result: 'selected value' },
  },
  {
    id: 'csv-parse',
    label: 'CSV Parse',
    kind: 'action',
    category: 'transform',
    params: [
      {
        key: 'csv',
        label: 'CSV',
        type: 'textarea',
        placeholder: '{{ $json.file.text }}',
        rows: 5,
      },
      {
        key: 'delimiter',
        label: 'Delimiter',
        type: 'text',
        placeholder: ',',
      },
      {
        key: 'headers',
        label: 'First row is header',
        type: 'boolean',
      },
    ],
    output: { items: [{ name: 'Ada', score: '42' }] },
  },
  {
    id: 'markdown-render',
    label: 'Markdown Render',
    kind: 'action',
    category: 'transform',
    params: [
      {
        key: 'markdown',
        label: 'Markdown',
        type: 'expression',
        placeholder: '## Result\n{{ $json.message }}',
      },
    ],
    output: {
      markdown: '## Result',
      html: '<h2>Result</h2>',
      text: 'Result',
    },
  },
  // Split / merge
  {
    id: 'split',
    label: 'Split',
    kind: 'action',
    category: 'split',
    params: [
      {
        key: 'items',
        label: 'Items',
        type: 'expression',
        placeholder: '{{ $json.commands }}',
      },
    ],
    output: { items: [{ index: 0, value: 'item' }] },
  },
  {
    id: 'merge',
    label: 'Merge',
    kind: 'action',
    category: 'merge',
    params: [],
    output: { batch: [{ index: 0, value: 'item' }] },
  },
  // Effects
  {
    id: 'telegram-send',
    label: 'Telegram Send',
    kind: 'effect',
    params: [
      { key: 'chat', label: 'Chat', type: 'expression' },
      { key: 'text', label: 'Text', type: 'expression' },
    ],
    output: { acknowledged: true, messageId: 1001 },
  },
  {
    id: 'whatsapp-send',
    label: 'WhatsApp Send',
    kind: 'effect',
    params: [
      { key: 'number', label: 'Number', type: 'expression' },
      { key: 'text', label: 'Text', type: 'expression' },
    ],
    output: { acknowledged: true, messageId: 'wamid.1001' },
  },
  {
    id: 'http-effect',
    label: 'HTTP Call',
    kind: 'effect',
    params: [
      { key: 'url', label: 'URL', type: 'url', required: true },
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: METHOD_OPTIONS,
      },
    ],
    output: { acknowledged: true, status: 202 },
  },
  {
    id: 'logger',
    label: 'Logger',
    kind: 'effect',
    params: [
      {
        key: 'level',
        label: 'Level',
        type: 'select',
        options: [
          { value: 'info', label: 'info' },
          { value: 'warn', label: 'warn' },
          { value: 'error', label: 'error' },
        ],
      },
      { key: 'message', label: 'Message', type: 'expression' },
    ],
    output: { acknowledged: true, level: 'info' },
  },
  {
    id: 'toast-effect',
    label: 'Toast',
    kind: 'effect',
    params: [
      { key: 'title', label: 'Title', type: 'expression' },
      { key: 'message', label: 'Message', type: 'expression' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        options: [
          { value: 'info', label: 'info' },
          { value: 'success', label: 'success' },
          { value: 'warning', label: 'warning' },
          { value: 'danger', label: 'danger' },
        ],
      },
      { key: 'duration', label: 'Duration ms', type: 'number' },
    ],
    output: {
      acknowledged: true,
      title: 'Pipeline',
      message: 'Done',
      variant: 'success',
    },
  },
  {
    id: 'dialog-result',
    label: 'Result Dialog',
    kind: 'effect',
    params: [
      { key: 'title', label: 'Title', type: 'expression' },
      { key: 'body', label: 'Body', type: 'expression' },
      { key: 'imageUrl', label: 'Image URL', type: 'url' },
      { key: 'json', label: 'JSON', type: 'json', language: 'json' },
    ],
    output: {
      acknowledged: true,
      title: 'Result',
      body: 'Rendered from pipeline context',
    },
  },
  {
    id: 'image-preview',
    label: 'Image Preview',
    kind: 'effect',
    params: [
      { key: 'title', label: 'Title', type: 'expression' },
      { key: 'imageUrl', label: 'Image URL', type: 'url' },
      { key: 'caption', label: 'Caption', type: 'expression' },
    ],
    output: {
      acknowledged: true,
      title: 'Image preview',
      imageUrl: 'https://example.test/image.png',
      caption: 'Rendered from pipeline context',
    },
  },
  {
    id: 'download-file',
    label: 'Download File',
    kind: 'effect',
    params: [
      { key: 'fileName', label: 'File name', type: 'expression' },
      { key: 'content', label: 'Content', type: 'expression' },
      { key: 'mimeType', label: 'MIME type', type: 'resource-picker' },
    ],
    output: {
      acknowledged: true,
      fileName: 'pipeline-output.txt',
      mimeType: 'text/plain',
    },
  },
  {
    id: 'clipboard-effect',
    label: 'Copy to Clipboard',
    kind: 'effect',
    params: [{ key: 'text', label: 'Text', type: 'expression' }],
    output: {
      acknowledged: true,
      text: 'Copied from pipeline context',
    },
  },
];

export function createStaticNodeCatalog(
  specs: readonly NodeTypeSpec[] = NODE_CATALOG,
  version = 'mock-static-v1',
): NodeCatalog {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  return {
    version,
    specs: () => specs,
    entry: (type) => (type ? byId.get(type) : undefined),
    params: (node) => byId.get(node.type ?? '')?.params ?? PARAM_SCHEMAS[nodeType(node)],
    outputSchema: (type) => {
      const spec = type ? byId.get(type) : undefined;
      return spec?.outputSchema ?? inferOutputSchema(spec?.output);
    },
    sampleOutput: (type) => (type ? byId.get(type)?.output : undefined),
  };
}

export function inferOutputSchema(value: unknown): OutputSchema | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return { type: 'array', items: inferOutputSchema(value[0]) };
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
          const schema = inferOutputSchema(child);
          return schema ? [[key, schema]] : [];
        }),
      ),
    };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return undefined;
}

export const STATIC_NODE_CATALOG = createStaticNodeCatalog();

/** Look up a concrete catalog type. */
export function catalogEntry(
  type: string | undefined,
): NodeTypeSpec | undefined {
  return STATIC_NODE_CATALOG.entry(type);
}

/**
 * Parameter schema for a node: its concrete catalog type's params if it has one,
 * otherwise a coarse per-category fallback. Empty for control-flow (bespoke form).
 */
export function paramSchema(
  node: Pick<BoardNode, 'kind' | 'category' | 'type'>,
): ParamField[] {
  return STATIC_NODE_CATALOG.params(node);
}

/** Default configuration when a control-flow subtype is first chosen. */
export function defaultControlFlowConfig(
  type: ControlFlowKind,
): ControlFlowConfig {
  switch (type) {
    case 'if':
      return { type: 'if', expression: '' };
    case 'switch':
      return {
        type: 'switch',
        discriminant: '',
        cases: [{ id: '1', label: 'Case 1', value: '' }],
        hasDefault: true,
      };
    case 'filter':
      return { type: 'filter', expression: '' };
  }
}
