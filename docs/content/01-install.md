---
id: install
label: Install
title: Install the public packages
order: 10
---

The main editor is `@tsai-pe/board`. Add the composable pipeline UI kit, design
tokens, data contracts and node registry because host applications provide their
own catalog, store and backend implementation.

```bash title="Install packages"
npm install @tsai-pe/board @tsai-pe/pipeline-ui-kit @tsai-pe/board-core @tsai-pe/ui-kit @tsai-pe/models @tsai-pe/nodes @tsai-pe/theme lucide-angular @angular/cdk @angular/aria
```

```css title="src/styles.css"
@import '@tsai-pe/theme';
@import '@angular/cdk/overlay-prebuilt.css';

@source '../node_modules/@tsai-pe/board';
@source '../node_modules/@tsai-pe/pipeline-ui-kit';
@source '../node_modules/@tsai-pe/ui-kit';
```

| Package                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `@tsai-pe/board`           | Ready-made `<pe-board>` editor and injection tokens.           |
| `@tsai-pe/pipeline-ui-kit` | Composable board, node, edge, picker and inspector primitives. |
| `@tsai-pe/board-core`      | Board store, geometry, viewport and routing.                   |
| `@tsai-pe/ui-kit`          | Reusable Angular controls around the editor.                   |
| `@tsai-pe/models`          | Pipeline, store and backend contracts.                         |
| `@tsai-pe/nodes`           | Node catalog and parameter schemas.                            |
| `@tsai-pe/theme`           | Tailwind v4 tokens and global CSS.                             |
