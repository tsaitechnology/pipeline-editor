import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * `tsai-skeleton` — a shimmering placeholder for loading content. Size it with
 * Tailwind utilities via `class` (e.g. `class="h-4 w-32"`); set `circle` for a
 * round avatar/thumbnail placeholder. Decorative (`aria-hidden`).
 */
@Component({
  selector: 'tsai-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()" aria-hidden="true"></span>`,
})
export class Skeleton {
  readonly circle = input(false);
  /** Extra sizing classes, e.g. `h-4 w-32`. */
  readonly class = input('');

  protected readonly classes = computed(
    () =>
      `tsai-skeleton block ${this.circle() ? 'rounded-full' : 'rounded-md'} ${this.class()}`,
  );
}
