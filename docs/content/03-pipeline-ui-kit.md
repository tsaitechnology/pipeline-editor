---
id: pipeline-ui-kit
label: Pipeline UI Kit
title: Compose your own pipeline UI
order: 30
---

Use `@tsai-pe/pipeline-ui-kit` when the host application wants canvas
primitives but owns the modal, drawer, routing, save controls or node-add
workflow. The primitives render data and emit intents; `BoardStore` and your app
decide what those intents mean.

:::demo pipeline-ui-kit
:::

```typescript title="Custom editor composition"
import { Component, computed } from '@angular/core';
import { BoardStore } from '@tsai-pe/board-core';
import { BoardSurface, NodeInspector, PipelineEdgeLayer, PipelineNode } from '@tsai-pe/pipeline-ui-kit';

@Component({
  standalone: true,
  imports: [BoardSurface, PipelineEdgeLayer, PipelineNode, NodeInspector],
  template: `
    <pe-board-surface [pan]="store.viewport.pan()" [zoom]="store.viewport.zoom()">
      <ng-container pe-board-world>
        <pe-pipeline-edge-layer [edges]="store.edgeGeometries()" />
        @for (node of store.nodes(); track node.id) {
          <pe-pipeline-node [node]="node" [selected]="selectedNode()?.id === node.id" (bodyPointerDown)="select(node.id)" />
        }
      </ng-container>
    </pe-board-surface>

    <app-drawer [open]="!!selectedNode()">
      @if (selectedNode(); as node) {
        <pe-node-inspector [node]="node" [catalog]="catalog" (nodeChange)="store.updateNode($event.id, $event)" />
      }
    </app-drawer>
  `,
})
export class CustomPipelineBuilder {
  readonly store = new BoardStore(catalog);
  readonly selectedNode = computed(() => this.store.nodes().find((node) => this.store.isSelected(node.id)));

  select(id: string): void {
    this.store.select(id);
  }
}
```

| Primitive                | Ownership boundary                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `pe-board-surface`       | Viewport shell, grid/world slots and raw surface events. No persistence or backend. |
| `pe-pipeline-edge-layer` | SVG connections, branch labels, arrows and draft connection path.                   |
| `pe-pipeline-node`       | Node visuals, ports, status overlays and open/resize intents.                       |
| `pe-node-picker`         | Catalog-driven add-node content. The host decides where selected nodes are placed.  |
| `pe-node-inspector`      | Catalog-driven node edit content. The host decides modal/drawer/route presentation. |
