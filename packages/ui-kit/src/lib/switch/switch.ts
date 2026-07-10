import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import type { FormCheckboxControl } from '@angular/forms/signals';

/** `tsai-switch` — an accessible on/off toggle (`role="switch"`). */
@Component({
  selector: 'tsai-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    role="switch"
    [attr.aria-checked]="checked()"
    [disabled]="disabled()"
    (click)="checked.set(!checked())"
    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors focus-visible:outline-none disabled:opacity-50"
    [class.bg-accent]="checked()"
    [class.bg-surface-3]="!checked()"
  >
    <span
      class="pointer-events-none inline-block size-4 rounded-full bg-white transition-transform"
      [class.translate-x-4]="checked()"
      [class.translate-x-0.5]="!checked()"
    ></span>
  </button>`,
})
export class Switch implements FormCheckboxControl {
  readonly checked = model(false);
  readonly disabled = input(false);
}
