import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** `tsai-sidebar-item` — a single navigation entry inside `tsai-sidebar`. */
@Component({
  selector: 'tsai-sidebar-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    [attr.aria-current]="active() ? 'page' : null"
    [class]="classes()"
  >
    <ng-content />
  </button>`,
})
export class SidebarItem {
  readonly active = input(false);

  protected readonly classes = computed(
    () =>
      `flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
        this.active()
          ? 'bg-accent-quiet text-text'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
      }`,
  );
}
