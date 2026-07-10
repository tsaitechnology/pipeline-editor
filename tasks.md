# UI-Kit — status & remaining backlog (temporary working doc)

Tracks `@tsai-pe/ui-kit` toward "premium class". Grounded in the design principles
(dark-first, single accent, borders over material shadows, restrained glass/glow,
grain, 4/8 rhythm) and accessibility-first components.

## Components (implemented)

**Actions:** Button (variants / sizes / loading / icon slots), Spinner.
**Form controls:** Field, Input (icon slots + clearable), NumberInput (fixed
decimals), DateInput, Textarea (+ mono/code), Checkbox, Switch, RadioGroup,
Select (CDK-overlay dropdown, single + multi, focus-trapped), Segmented control.
**Form structure:** Form, FormSection, FormRow.
**Disclosure / nav:** Tabs, Accordion (Angular Aria).
**Surfaces / layout:** Card, GlowSurface, Navbar, Sidebar, Actionbar.
**Overlays:** Dialog, Drawer (both on the shared `ModalOverlay`), Menu (CDK Menu),
Tooltip (directive), Toast + ToastService.
**Feedback / display:** Alert, Toast, Skeleton, Tag, Avatar, Badge.
**Chat:** ChatMessage, ChatInput.

## Architecture in place

- **Overlay split:** _anchored_ overlays use `CdkConnectedOverlay` (Select) or
  `@angular/cdk/menu` (Menu) / CDK Overlay directive (Tooltip); _global_ overlays
  (Dialog, Drawer) share a small `ModalOverlay` controller (glass backdrop, scroll
  lock, Escape / backdrop dismiss). Only styles / motion / focus conventions are
  shared, in the theme.
- **A11y:** focus trap + auto-capture + restore (Dialog, Drawer, Select); ARIA
  roles/labelling on dialogs, menus, alerts, segmented, tooltip; keyboard nav
  (Segmented arrows, CDK Menu, Aria Tabs/Accordion/Listbox); `aria-live` toasts;
  `prefers-reduced-motion` disables all animation globally.
- **Motion / styles** centralized in `@tsai-pe/shared/theme` (overlay backdrop,
  dialog pop, drawer slides, skeleton shimmer, glass).
- **Signal forms:** all value/checkbox controls implement the `@angular/forms/signals`
  `FormValueControl<T>` / `FormCheckboxControl` contracts → usable with `[formField]`.
- **Tests:** unit specs for Button, NumberInput, Segmented, Alert, Avatar, Tag,
  Combobox, DatePicker.

## Remaining backlog

### Overlays / structure

- [ ] Extract a shared **anchored-overlay** helper (`tsai-popover`) once patterns
      across Select / Menu / Tooltip converge (currently each uses the most
      fitting CDK primitive directly — intentional, not yet abstracted).
- [ ] Dialog **imperative service** (`open(component)` → ref + `afterClosed()`) for
      dynamic-component dialogs, on top of the declarative `tsai-dialog`.
- [x] Menu section labels (`tsai-menu-label`). Remaining: checkbox / radio items,
      submenus.
- [x] Tooltip configurable `placement` (top/bottom/left/right). Remaining: arrow.

### Inputs — depth

- [x] `tsai-combobox` — single-select type-to-filter (ARIA activedescendant,
      full keyboard). Remaining: async options + fold onto Aria Combobox.
- [x] `tsai-datepicker` — popover month-grid calendar (keyboard nav). Remaining:
      date range + min/max.
- [x] `tsai-slider` (range, `FormValueControl<number>`).
- [x] Input password reveal toggle (`revealable`). Remaining: prefix/suffix _text_
      addons (icon slots already exist).
- [x] **Signal forms integration** (`@angular/forms/signals`): every value control
      implements `FormValueControl<T>` and checkbox/switch implement
      `FormCheckboxControl`, so they bind with the `[formField]` directive; the
      directive auto-syncs value + pushes `disabled`/`invalid` into the control.
      Showcase has a validated `form()` demo (required/email/minLength + submit).
      Remaining: auto-wire `Field` error text / `aria-describedby` from field state
      (today the demo passes the message into `tsai-field [error]`).

### Data display

- [x] `tsai-table` — data-driven styled table. Remaining: `@angular/cdk` **virtual
      scroll** for very long lists.
- [ ] Avatar group / stacked; image fallback on load error.

### Icons

- [ ] **Decision (current):** ui-kit stays icon-library-agnostic — icons are
      passed via content slots; Lucide lives in the app. Revisit a `tsai-icon`
      wrapper only if a default-size/stroke convention is needed lib-wide.

### Design / a11y / quality

- [x] **Mobile / responsive:** components use fluid widths + responsive grids;
      overlays fit the viewport (Dialog/Drawer full-width, panels width-matched or
      capped, CDK push into view); touch-friendly. Keep verifying on new components.
- [ ] Full keyboard + screen-reader audit (Menu submenus, Drawer, Toast focus).
- [ ] Contrast check all text tiers ≥ 4.5:1 in both themes.
- [ ] Broaden tests to overlays (Dialog/Menu/Toast) with TestBed + fake async.
- [ ] Storybook (or docs route) with per-component variant matrices.
- [ ] Self-host Geist/Inter for the technological type feel.

### DX / docs

- [ ] Document theming (token override), `@source` setup, and component usage in
      the lib README; add `@angular/cdk` + `@angular/aria` notes to ARCHITECTURE.
- [ ] Consider secondary entry points if the kit keeps growing.

## Board domain (canvas)

- [x] Scaffold libs: `shared/models` (@nx/js), `board/core` (@nx/js),
      `board/ui` (@nx/angular, prefix `pe`), `board/feature` (@nx/angular).
- [x] Data model (`shared/models`): `BoardNode` (kind trigger/action/effect +
      `ActionCategory` control-flow/transform/integration/split/merge), **1:1**
      `Edge`, `Pipeline`, 32-grid `GridPos` / 16-subgrid `SubPos`, ports
      (left=input, right/top/bottom=3 outputs), `defaultPorts`, `nodeType`.
      merge/split modelled as buffer/queue *nodes*, not connection cardinality.
- [x] `board/core`: grid consts (`GRID_CELL=32`, `GRID_SUBCELL=16`), geometry
      (cell↔px, snap, `portAnchor`, `edgePath`), signal `Viewport`
      (pan/zoom/zoomAround) + `BoardStore` (nodes/edges/selection, connect,
      add/removeNode, edgeGeometries).
- [x] `board/ui`: infinite `pe-board-grid` (CSS radial-gradient dots follow
      pan/zoom), `pe-node` (per-type rail + Lucide icon + ports), `NODE_META`
      registry; per-node-type theme tints (`--node-*`).
- [x] `pe-board` editor: RMB / touch-swipe pan, wheel zoom, node drag (snap),
      draw connections (drag output→input), select node/edge, right-click /
      long-press context menu (add node / delete / reset). Wired into `/board`
      with the "draw 10 cats" demo pipeline.
- [x] Rubber-band multi-select; z-order (selected node paints on top);
      side-aware edge curves (tangents leave along each port's normal).
- [x] Keyboard: Delete / Backspace removes selection, Escape clears / closes
      menu, F fits; floating zoom / fit / reset toolbar.
- [ ] Connection routing on the 16-subgrid (waypoints) + orthogonal edges.
- [ ] Node palette / drag-from-sidebar; copy / paste; undo / redo.
- [ ] Minimap; DAG + port-compatibility validation; pipeline (de)serialization.
