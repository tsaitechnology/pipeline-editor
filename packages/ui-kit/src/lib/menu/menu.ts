import { ChangeDetectionStrategy, Component, Directive } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';

/**
 * Dropdown menu built on `@angular/cdk/menu`, which provides the overlay,
 * keyboard navigation (arrows / Home / End / typeahead), focus management,
 * roving tabindex, submenu support and ARIA roles. These thin wrappers only add
 * the theme styling by composing the CDK directives via `hostDirectives`.
 *
 * ```html
 * <tsai-button [tsaiMenuTriggerFor]="menu">Options</tsai-button>
 * <ng-template #menu>
 *   <tsai-menu>
 *     <tsai-menu-item (triggered)="rename()">Rename</tsai-menu-item>
 *     <tsai-menu-separator />
 *     <tsai-menu-item (triggered)="remove()">Delete</tsai-menu-item>
 *   </tsai-menu>
 * </ng-template>
 * ```
 */
@Component({
  selector: 'tsai-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CdkMenu],
  host: {
    class:
      'tsai-dialog-enter block min-w-44 rounded-md border border-border bg-surface-2 p-1 text-sm text-text shadow-elev-2 focus:outline-none',
  },
  template: `<ng-content />`,
})
export class Menu {}

/** A single, activatable menu item. Emits `triggered` when chosen. */
@Component({
  selector: 'tsai-menu-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: CdkMenuItem,
      inputs: ['cdkMenuItemDisabled: disabled'],
      outputs: ['cdkMenuItemTriggered: triggered'],
    },
  ],
  host: {
    class:
      'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-text-2 outline-none transition-colors hover:bg-surface-3 hover:text-text focus:bg-surface-3 focus:text-text data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
  },
  template: `<ng-content />`,
})
export class MenuItem {}

/** A visual divider between groups of menu items. */
@Component({
  selector: 'tsai-menu-separator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'separator', class: 'my-1 block h-px bg-border' },
  template: ``,
})
export class MenuSeparator {}

/** A non-interactive section label inside a menu. */
@Component({
  selector: 'tsai-menu-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'block px-2.5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-3',
  },
  template: `<ng-content />`,
})
export class MenuLabel {}

/**
 * Opens a `<tsai-menu>` template as a dropdown anchored to the host element.
 * Re-exposes CDK's `cdkMenuTriggerFor` as `tsaiMenuTriggerFor` so consumers
 * never touch CDK directly.
 */
@Directive({
  selector: '[tsaiMenuTriggerFor]',
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: ['cdkMenuTriggerFor: tsaiMenuTriggerFor'],
    },
  ],
})
export class MenuTrigger {}
