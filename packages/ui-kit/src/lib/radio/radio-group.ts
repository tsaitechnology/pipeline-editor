import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** `tsai-radio-group` — a data-driven native radio group. */
@Component({
  selector: 'tsai-radio-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div role="radiogroup" class="flex flex-col gap-2">
    @for (opt of options(); track opt.value) {
      <label
        class="inline-flex cursor-pointer items-center gap-2 text-sm text-text select-none"
        [class.opacity-50]="opt.disabled"
      >
        <input
          type="radio"
          class="size-4 accent-accent"
          [name]="name()"
          [value]="opt.value"
          [checked]="value() === opt.value"
          [disabled]="opt.disabled"
          (change)="value.set(opt.value)"
        />
        {{ opt.label }}
      </label>
    }
  </div>`,
})
export class RadioGroup implements FormValueControl<string | undefined> {
  readonly options = input<RadioOption[]>([]);
  readonly name = input('tsai-radio');
  readonly value = model<string>();
}
