---
id: production
label: Production
title: Style, secure and ship production integrations
order: 70
---

Styling is token-driven. Import `@tsai-pe/theme`, scan the shipped Tailwind
classes and override CSS variables in your product shell. Board, nodes, forms
and UI kit controls read the same tokens.

```css title="Theme overrides"
@import '@tsai-pe/theme';
@import '@angular/cdk/overlay-prebuilt.css';

@source '../node_modules/@tsai-pe/board';
@source '../node_modules/@tsai-pe/pipeline-ui-kit';
@source '../node_modules/@tsai-pe/ui-kit';

:root {
  --accent: #22b8cf;
  --node-integration: #845ef7;
  --node-effect: #f06595;
}

.light {
  --accent: #0b7285;
}
```

| Token                 | Description                                     |
| --------------------- | ----------------------------------------------- |
| `--accent`            | Primary actions, focus and selected state.      |
| `--canvas-bg`         | Board well behind nodes and connection routing. |
| `--node-trigger`      | Trigger rail, icon and port accent.             |
| `--node-integration`  | Integration/action node accent.                 |
| `--node-control-flow` | If, switch, filter and router accent.           |
| `--node-effect`       | Terminal side-effect node accent.               |

The editor can render credential selectors, but secret material should never be
serialized into `Pipeline.data`. Store references in the pipeline and resolve
them inside the backend runtime with the current user's permissions.

```typescript title="Credential reference"
export const SEND_EMAIL_NODE: NodeTypeSpec = {
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

const credential = await credentialVault.resolve(node.data.credentialId);
```

:::callout warning Trust boundary
Treat every submitted pipeline as user input. Revalidate graph shape, node
permissions, credential access and expression safety before starting a run.
:::

Good host apps usually ship a small catalog of domain recipes instead of
exposing generic building blocks first. Model the common flows your users
already understand, then let advanced users compose lower-level transform,
routing and effect nodes.

```typescript title="Recipe catalog"
export const SUPPORT_TRIAGE = createNodeCatalog([
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
]);
```

| Area               | Check                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| Catalog versioning | Keep stable `id`s; migrate saved pipelines when params or ports change.            |
| Credentials        | Store secret values outside the pipeline document; nodes reference credential ids. |
| Validation         | Reject invalid graphs server-side even if the editor already warns users.          |
| Run isolation      | Submit an immutable pipeline snapshot and label updates with one run id.           |
| Observability      | Persist logs, terminal status and run history for later inspection.                |
| Permissions        | Filter catalog entries and credential pickers by the current user/team.            |
