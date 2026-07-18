---
id: model
label: Model
title: Model pipelines and node catalogs
order: 40
---

A pipeline is a serializable graph: nodes, edges and domain-specific `data`.
Keep IDs stable, store snapshots as JSON and run exactly the graph the user
saved or submitted.

```typescript title="Pipeline document"
import type { Pipeline } from '@tsai-pe/models';

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
};
```

The editor does not hard-code integrations. Each node type declares params,
ports and output examples. Those fields drive palette groups, inspector forms,
dynamic switch outputs and expression help.

```typescript title="Catalog entry"
import { createNodeCatalog } from '@tsai-pe/nodes';

export const MY_NODE_CATALOG = createNodeCatalog([
  {
    id: 'crm-create-lead',
    label: 'Create CRM Lead',
    section: 'CRM',
    kind: 'effect',
    params: [
      { key: 'email', label: 'Email', type: 'expression', required: true },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' },
        ],
      },
    ],
    outputExample: { leadId: 'lead_123', status: 'created' },
  },
]);
```

```typescript title="NodeTypeSpec"
export interface NodeTypeSpec {
  id: string;
  label: string;
  section?: string;
  kind: 'trigger' | 'action' | 'effect';
  category?: 'control-flow' | 'transform' | 'integration' | 'split' | 'merge';
  params: ParamField[];
  ports?: NodePortSpec;
  outputSchema?: OutputSchema;
  outputExample?: Record<string, unknown>;
}
```

| Piece             | Owner                                          | Why it matters                                                         |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Pipeline document | Host app                                       | Serializable graph you can store, diff, import and run.                |
| Node catalog      | Product/backend team                           | Controls palette entries, inspector fields, ports and expression help. |
| Board UI          | `@tsai-pe/board` or `@tsai-pe/pipeline-ui-kit` | Canvas, editing primitives, validation display and user intents.       |
| Runtime backend   | Your system                                    | Executes semantics, credentials, logs, retries and side effects.       |
