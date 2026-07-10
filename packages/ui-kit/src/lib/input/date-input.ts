import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

const CONTROL =
  'w-full rounded-sm border bg-surface-2 px-3 text-sm text-text transition-colors outline-none focus-visible:border-accent-hover disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100';

/**
 * `tsai-date-input` — date picker over a native `<input type="date">`.
 * Value is an ISO `yyyy-mm-dd` string. A richer popover calendar can layer on
 * later via `@angular/cdk` Overlay without changing this API.
 */
@Component({
  selector: 'tsai-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    type="date"
    [min]="minDate()"
    [max]="maxDate()"
    [disabled]="disabled()"
    [value]="value()"
    [attr.aria-invalid]="invalid() || null"
    [class]="classes()"
    (input)="value.set($any($event.target).value)"
  />`,
})
export class DateInput implements FormValueControl<string> {
  readonly minDate = input<string>();
  readonly maxDate = input<string>();
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly value = model('');

  protected readonly classes = computed(
    () =>
      `${CONTROL} h-9 ${this.invalid() ? 'border-danger' : 'border-border'}`,
  );
}
