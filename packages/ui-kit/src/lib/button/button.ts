import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { Spinner } from '../spinner/spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-sm font-medium select-none transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-press',
  secondary: 'bg-surface-2 text-text border border-border hover:bg-surface-3',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger text-white hover:brightness-110',
};

/**
 * `tsai-button` — the ui-kit's baseline action control.
 *
 * A thin, fully-styled wrapper over a native `<button>` (already accessible).
 * Projects optional leading / trailing icons via the `[icon-left]` / `[icon-right]`
 * slots — the slot wrappers collapse (`empty:hidden`) when unused, so the flex
 * `gap` only appears when an icon is present. When `loading` is set the button
 * dims, blocks interaction and shows a centered spinner over the hidden label.
 */
@Component({
  selector: 'tsai-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  template: `<button
    [type]="type()"
    [disabled]="disabled() || loading()"
    [attr.aria-busy]="loading() || null"
    [class]="classes()"
  >
    <span
      class="inline-flex shrink-0 empty:hidden"
      [class.invisible]="loading()"
    >
      <ng-content select="[icon-left]" />
    </span>
    <span
      class="inline-flex items-center empty:hidden"
      [class.invisible]="loading()"
    >
      <ng-content />
    </span>
    <span
      class="inline-flex shrink-0 empty:hidden"
      [class.invisible]="loading()"
    >
      <ng-content select="[icon-right]" />
    </span>
    @if (loading()) {
      <span class="absolute inset-0 grid place-items-center">
        <tsai-spinner size="sm" />
      </span>
    }
  </button>`,
  host: {
    '[attr.data-variant]': 'variant()',
  },
})
export class Button {
  /** Visual emphasis of the button. */
  readonly variant = input<ButtonVariant>('primary');
  /** Control height / padding. */
  readonly size = input<ButtonSize>('md');
  /** Native button `type`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Disable interaction and dim the control. */
  readonly disabled = input(false);
  /** Show a spinner and block interaction while an action is in flight. */
  readonly loading = input(false);

  protected readonly classes = computed(
    () => `${BASE} ${SIZES[this.size()]} ${VARIANTS[this.variant()]}`,
  );
}
