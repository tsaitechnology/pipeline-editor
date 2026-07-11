# Backlog

Actionable, not-yet-done work only. No history.

## board / workflow — next

- [ ] Extract the node-type registry (control-flow + catalog + param schemas +
      `derivePorts`) out of `shared/models` into its own `shared/nodes` lib — it
      has outgrown models.
- [ ] Backend contract maturity (beyond run lifecycle): persistence (save / load /
      list pipelines, run history), node catalog supplied by the backend,
      credentials/secrets model, validation from the backend.
- [ ] A real `PipelineBackend` adapter skeleton (REST/WS) to prove the contract
      against reality (only `TestBackendSystem` exists today).
- [ ] Expression help: derive available variable paths from upstream node output
      shapes (today the inspector only offers ancestor-node chips).
- [ ] Run UX polish: distinct `skipped` node state (not `idle`); show a node's
      error on the node / inspector; log timestamps + per-node filter + autoscroll;
      optional ticking progress (1→N) instead of instant n/n.
- [ ] Delete safety: Backspace must NOT delete nodes (only the Delete key);
      deleting a node requires a confirmation modal first.

## quality / docs

- [ ] Unit tests: BoardStore, geometry, routing, registry (`derivePorts` /
      `controlFlowOutputs` / `paramSchema`), validation, `TestBackendSystem`.
- [ ] Refresh ARCHITECTURE.md — registry, node catalog, backend contract,
      `workflow/mock`, control-flow, the styling decision (Tailwind everywhere,
      component CSS only for host/SVG state).

## ui-kit

- [ ] Extract a shared **anchored-overlay** helper (`tsai-popover`) once Select /
      Menu / Tooltip patterns converge.
- [ ] Dialog **imperative service** (`open(component)` → ref + `afterClosed()`).
- [ ] Menu: checkbox / radio items and submenus.
- [ ] Tooltip arrow.
- [ ] Combobox async options (fold onto Aria Combobox).
- [ ] DatePicker date range + min/max.
- [ ] Input prefix / suffix **text** addons.
- [ ] Auto-wire `Field` error text / `aria-describedby` from signal-form state.
- [ ] Table `@angular/cdk` virtual scroll for long lists.
- [ ] Avatar group / stacked; image fallback on load error.
- [ ] Full keyboard + screen-reader audit (Menu submenus, Drawer, Toast focus).
- [ ] Contrast check all text tiers ≥ 4.5:1 in both themes.
- [ ] Overlay tests (Dialog / Menu / Toast) with TestBed + fake async.
- [ ] Storybook (or docs route) with per-component variant matrices.
- [ ] Self-host Geist / Inter.
- [ ] Lib README (theming / `@source` / usage); CDK + Aria notes in ARCHITECTURE.
