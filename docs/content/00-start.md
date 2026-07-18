---
id: start
label: Start
title: Visual pipeline editor for product-grade workflow builders
order: 0
---

Publishable Angular components for building n8n-style editors inside your own
app: canvas, nodes, parameter inspector, validation, run telemetry, persistence
and a backend-neutral execution port.

Use `@tsai-pe/board` when you want the assembled editor. Use
`@tsai-pe/pipeline-ui-kit` when your application wants to own panels, modals,
toolbars, save/run controls or node creation workflow.

:::demo board-readonly
:::

:::callout info Agent-readable source
This documentation is authored from `docs/content/*.md`. The docs build copies
those Markdown files, `llms.txt` and prerendered `/static/*.html` pages into the
static docs output so agents can read generated artifacts from the same source
as humans.
:::

```bash title="Local commands"
npm install
npm exec -- nx serve playground
npm exec -- nx serve docs
```
