---
id: params
label: Params & Ports
title: Build forms, ports and expressions from schemas
order: 50
---

`ParamField` is the schema for the inspector. Use sections to group advanced
settings, `visibleWhen` to keep forms short and object/array fields for
structured configuration without writing a custom inspector.

```typescript title="ParamField"
{
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
} satisfies ParamField;
```

| Type                            | Use                                         |
| ------------------------------- | ------------------------------------------- |
| `text` / `textarea` / `url`     | Plain user-entered strings.                 |
| `number` / `boolean` / `select` | Typed configuration controls.               |
| `expression`                    | `$json`, `$trigger` and upstream node refs. |
| `json` / `object` / `array`     | Structured payloads and repeaters.          |
| `secret` / `credential`         | Backend-owned sensitive references.         |
| `code`                          | Sandboxed transform snippets.               |
| `model` / `resource-picker`     | Product-specific selectors.                 |

Nodes can expose fixed ports, generate outputs from user-entered array data and
reveal conditional outputs when a setting is enabled. This is enough for
if/switch nodes, fan-out, split/merge workflows, optional fallbacks and
product-specific routing rules.

```typescript title="Dynamic ports"
import type { NodeTypeSpec } from '@tsai-pe/nodes';

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
    dynamic: [{ from: 'routes', id: '{{ id }}', label: '{{ label }}', role: 'output' }],
    conditional: [{ when: 'fallback', id: 'fallback', label: 'Fallback', role: 'output' }],
  },
  outputExample: { segment: 'enterprise', matched: true },
} satisfies NodeTypeSpec;
```

Expression fields can be used inside your own inspectors and side panels.
Provide a scope from trigger payloads, current `$json` data and upstream node
outputs so users get autocomplete for valid references.

```typescript title="Expression field"
import type { ExpressionScope } from '@tsai-pe/ui-kit';

readonly scope: ExpressionScope = {
  trigger: ['body.email', 'headers.authorization'],
  json: ['customer.email', 'customer.plan', 'score'],
  nodes: [
    { title: 'Score Lead', paths: ['score', 'segment', 'reason'] },
    { title: 'Create CRM Lead', paths: ['leadId', 'status'] },
  ],
};

template: `
  <tsai-expression-field
    [value]="message"
    [scope]="scope"
    [template]="true"
    (valueChange)="message = $event"
  />
`;
```

:::demo expression-tags
:::
