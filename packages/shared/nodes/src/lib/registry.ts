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
} from '@tsai-pe/shared/models';

/**
 * Node-type registry (n8n-style descriptions) shared by the editor and the
 * future execution engine. For now it covers control-flow: mapping a node's
 * configuration to its named output ports, and the default config per subtype.
 *
 * Lives in `shared` (its own lib) so both `board` (editor) and the `workflow`
 * engine can depend on it without crossing scope boundaries.
 */

/** Whether a node is a control-flow node (if / switch / filter). */
export function isControlFlow(node: Pick<BoardNode, 'kind' | 'category'>): boolean {
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
      ...controlFlowOutputs(node.config).map(
        (o): NodePort => ({
          id: o.id,
          role: 'output',
          side: 'right',
          label: o.label,
        }),
      ),
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
  | 'expression';

/** One configurable parameter of a node type. */
export interface ParamField {
  key: string;
  label: string;
  type: ParamType;
  placeholder?: string;
  help?: string;
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
    { key: 'event', label: 'Event', type: 'text', placeholder: 'message.received' },
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
    { key: 'target', label: 'Target', type: 'text', placeholder: 'chat id / url' },
    { key: 'message', label: 'Message', type: 'expression' },
  ],
  split: [],
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
}

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
];

/** Seed node catalog. Grouped by category via `nodeType`. */
export const NODE_CATALOG: NodeTypeSpec[] = [
  // Triggers — each channel emits a different message shape, so downstream
  // transforms must normalize (see `output`, used by expression help).
  {
    id: 'telegram-trigger',
    label: 'Telegram',
    kind: 'trigger',
    params: [{ key: 'chat', label: 'Chat / bot', type: 'text' }],
    output: { source: 'telegram', message: 'Hello from Telegram', chatId: 4242 },
  },
  {
    id: 'whatsapp-trigger',
    label: 'WhatsApp',
    kind: 'trigger',
    params: [{ key: 'number', label: 'Number / bot', type: 'text' }],
    output: { source: 'whatsapp', chat: { text: 'Hi via WhatsApp', from: '+15550101' } },
  },
  {
    id: 'slack-trigger',
    label: 'Slack',
    kind: 'trigger',
    params: [{ key: 'channel', label: 'Channel', type: 'text', placeholder: '#general' }],
    output: {
      source: 'slack',
      event: { text: 'Yo from Slack', user: 'U0421', channel: 'C7' },
    },
  },
  {
    id: 'webhook-trigger',
    label: 'Webhook',
    kind: 'trigger',
    params: [{ key: 'path', label: 'Path', type: 'text', placeholder: '/hook' }],
    output: { source: 'webhook', body: { text: 'payload' } },
  },
  {
    id: 'schedule-trigger',
    label: 'Schedule',
    kind: 'trigger',
    params: [
      { key: 'cron', label: 'Cron', type: 'text', placeholder: '*/5 * * * *' },
    ],
    output: { source: 'schedule', firedAt: 0 },
  },
  // Integrations
  {
    id: 'http-request',
    label: 'HTTP Request',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'method', label: 'Method', type: 'select', options: METHOD_OPTIONS },
      { key: 'url', label: 'URL', type: 'expression' },
      { key: 'body', label: 'Body', type: 'expression' },
    ],
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
        type: 'select',
        options: [
          { value: 'gpt', label: 'GPT' },
          { value: 'claude', label: 'Claude' },
          { value: 'llama', label: 'Llama' },
        ],
      },
      { key: 'prompt', label: 'Prompt', type: 'expression' },
    ],
  },
  {
    id: 'image-gen',
    label: 'Image Generator',
    kind: 'action',
    category: 'integration',
    params: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'prompt', label: 'Prompt', type: 'expression' },
    ],
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
      { key: 'code', label: 'JS', type: 'textarea', placeholder: 'return items;' },
    ],
  },
  // Split / merge
  { id: 'split', label: 'Split', kind: 'action', category: 'split', params: [] },
  { id: 'merge', label: 'Merge', kind: 'action', category: 'merge', params: [] },
  // Effects
  {
    id: 'telegram-send',
    label: 'Telegram Send',
    kind: 'effect',
    params: [
      { key: 'chat', label: 'Chat', type: 'expression' },
      { key: 'text', label: 'Text', type: 'expression' },
    ],
  },
  {
    id: 'http-effect',
    label: 'HTTP Call',
    kind: 'effect',
    params: [
      { key: 'url', label: 'URL', type: 'expression' },
      { key: 'method', label: 'Method', type: 'select', options: METHOD_OPTIONS },
    ],
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
  },
];

const CATALOG_BY_ID = new Map(NODE_CATALOG.map((spec) => [spec.id, spec]));

/** Look up a concrete catalog type. */
export function catalogEntry(type: string | undefined): NodeTypeSpec | undefined {
  return type ? CATALOG_BY_ID.get(type) : undefined;
}

/**
 * Parameter schema for a node: its concrete catalog type's params if it has one,
 * otherwise a coarse per-category fallback. Empty for control-flow (bespoke form).
 */
export function paramSchema(
  node: Pick<BoardNode, 'kind' | 'category' | 'type'>,
): ParamField[] {
  return catalogEntry(node.type)?.params ?? PARAM_SCHEMAS[nodeType(node)];
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
