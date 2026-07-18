---
id: board
label: Board
title: Mount the assembled editor
order: 20
---

`pe-board` receives a serializable `Pipeline`. Runtime capabilities are
injected: catalog for palette/forms/ports, store for save/open and backend for
run/observe/stop. Omit store or backend to hide those controls in read-only or
design-only contexts.

```typescript title="Ready-made editor"
import { Component, signal } from '@angular/core';
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
  template: `<pe-board class="block h-dvh" [pipeline]="pipeline()" />`,
})
export class WorkflowBuilder {
  readonly pipeline = signal<Pipeline>(initialPipeline);
}
```

:::callout info Inputs and tokens
Pass `[pipeline]` to load a document and `[readonly]="true"` to disable editing.
Provide `PIPELINE_NODE_CATALOG`, `PIPELINE_STORE` and `PIPELINE_BACKEND` at the
host component or route level.
:::

| API                     | Contract                                                                |
| ----------------------- | ----------------------------------------------------------------------- |
| `Board`                 | `pipeline`, `readonly`, injected capabilities.                          |
| `PIPELINE_NODE_CATALOG` | Palette entries, inspector fields, port derivation and expression help. |
| `PIPELINE_STORE`        | Optional persistence and run history.                                   |
| `PIPELINE_BACKEND`      | Optional run/observe/stop integration.                                  |
