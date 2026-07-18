---
id: reference
label: Reference
title: Reference, UI kit and troubleshooting
order: 80
---

The public surface is intentionally small. Most custom behavior comes from
catalog metadata, injected backend/store adapters and shared tokens, not from
subclassing visual components.

| API               | Contract                                                 |
| ----------------- | -------------------------------------------------------- |
| `Board`           | `pipeline`, `readonly`, injected capabilities.           |
| `BoardStore`      | Nodes, edges, selection, history, viewport and geometry. |
| `NodeTypeSpec`    | Palette entry, params, ports and output help.            |
| `ParamField`      | Inspector field schema and visibility rules.             |
| `PipelineBackend` | `startRun`, `observe`, `stop`.                           |
| `PipelineStore`   | `save`, `load`, `list`, `remove`, `runHistory`.          |

Use the UI kit around the editor for buttons, fields, selects, menus, dialogs,
tabs, alerts, badges, tables and layout primitives. They share the same tokens
as the canvas.

:::demo ui-kit-controls
:::

| Component                                      | Use                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| `tsai-button` / `tsai-badge` / `tsai-tag`      | Actions, status, filters and compact metadata.    |
| `tsai-input` / `tsai-select` / `tsai-textarea` | Host settings panels and custom node forms.       |
| `tsai-expression-field`                        | Expression authoring with scoped autocomplete.    |
| `tsai-json-view` / variable helpers            | Output inspection and draggable references.       |
| `tsai-dialog` / `tsai-modal-overlay` / toast   | Confirmation, import/export and runtime feedback. |
| `tsai-sidebar` / `tsai-navbar` / actionbar     | Product shell around the board.                   |

Most integration failures are host-app wiring problems: missing height, missing
Tailwind source scanning or intentionally omitted injection tokens.

| Symptom               | Fix                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Board is invisible    | Give the host a real height, for example `h-dvh` or a flex child with `min-h-0`.              |
| Styles are missing    | Import `@tsai-pe/theme` and include `@source ../node_modules/@tsai-pe` in Tailwind v4 styles. |
| Palette is empty      | Provide `PIPELINE_NODE_CATALOG` with at least one `NodeTypeSpec`.                             |
| Run button is missing | Provide `PIPELINE_BACKEND`; omit it intentionally for design-only editors.                    |
| Save/Open are missing | Provide `PIPELINE_STORE`; read-only viewers usually omit it.                                  |

```bash title="Verification"
npm exec -- nx test pipeline-ui-kit
npm exec -- nx test feature
npm exec -- nx build docs
npm exec -- nx build playground
npm exec -- nx e2e playground-e2e -- --project=chromium
```
