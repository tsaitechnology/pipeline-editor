import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, string> = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
};

/**
 * `tsai-spinner` — an indeterminate loading spinner. Inherits the current text
 * color (`border-current`), so wrap it in a `text-*` context to tint it.
 */
@Component({
  selector: 'tsai-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    role="status"
    aria-label="Loading"
    [class]="classes()"
  ></span>`,
  host: {
    class: 'inline-flex leading-none',
  },
})
export class Spinner {
  readonly size = input<SpinnerSize>('md');

  protected readonly classes = computed(
    () =>
      `inline-block animate-spin rounded-full border-current border-t-transparent ${
        SIZES[this.size()]
      }`,
  );
}
