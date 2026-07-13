# Pipeline Editor

> An embeddable Angular editor for visual AI-agent pipelines.

**🔗 [Live demo](https://tsai-tech.github.io/pipeline-editor/board)** ·
**[Documentation](https://tsai-tech.github.io/pipeline-editor/docs/)** — build a
pipeline, wire it up, and learn how to embed the components in your app.

A canvas where a pipeline is assembled from nodes (**trigger → action → effect**,
plus if/switch/filter control-flow and split/merge buffers): nodes connect with
edges, drag around, and the canvas pans and zooms. It has a parameter inspector,
graph validation, export/import, persistence, and a run driven by a pluggable
backend. Inspired by [n8n](https://n8n.io).

The project is an Nx monorepo; the deliverable is a set of publishable Angular
libraries (Angular 21, signals, standalone, OnPush, Tailwind v4). The `playground`
app is a local-development harness only and is not published.

> **The frontend does not execute pipelines** — the backend owns semantics. The
> editor talks to it through the vendor-neutral `PipelineBackend` port (`startRun`
> / `observe` / `stop`). An in-browser mock with a real expression evaluator ships
> for development.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the domains, layers, and module
boundaries.

## Packages

| Package               | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `@tsai-pe/board`      | The `<pe-board>` editor — the main package         |
| `@tsai-pe/board-core` | Board store, geometry, A\* edge routing            |
| `@tsai-pe/board-ui`   | Presentational canvas components (nodes, grid)     |
| `@tsai-pe/ui-kit`     | Headless (Angular Aria) + Tailwind components      |
| `@tsai-pe/models`     | Data model, validation, backend contract           |
| `@tsai-pe/nodes`      | Node-type registry (ports, catalog, param schemas) |
| `@tsai-pe/theme`      | Tailwind tokens and global CSS                     |

`@tsai-pe/workflow-mock` (mock backend) and `@tsai-pe/workflow-http` (REST/WS
adapter skeleton) are dev/reference packages and are not published to npm.

## Quick start

```bash
npm install
npx nx serve playground        # → http://localhost:4200/board
```

## Tasks

```bash
npx nx run-many -t vite:test         # unit tests
npx nx affected -t lint test build   # only what changed (CI)
npx nx run-many -t build             # build all libraries
npx nx release                       # version + publish (independent, conv. commits)
npx nx graph                         # dependency graph
```

## Stack

Angular 21 · Angular Aria + CDK · Tailwind CSS v4 (custom dark-first theme) · Nx 23 ·
Vite + Vitest · Playwright (playground e2e).

## License

[MIT](./LICENSE) © Mikhail Tsai
