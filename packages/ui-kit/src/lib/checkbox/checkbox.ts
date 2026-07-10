import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import type { FormCheckboxControl } from '@angular/forms/signals';

/** `tsai-checkbox` — native checkbox with a projected label. */
@Component({
  selector: 'tsai-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label
    class="inline-flex cursor-pointer items-center gap-2 text-sm text-text select-none"
    [class.opacity-50]="disabled()"
  >
    <input
      type="checkbox"
      class="size-4 accent-accent"
      [checked]="checked()"
      [disabled]="disabled()"
      (change)="checked.set($any($event.target).checked)"
    />
    <ng-content />
  </label>`,
})
export class Checkbox implements FormCheckboxControl {
  readonly checked = model(false);
  readonly disabled = input(false);
}
