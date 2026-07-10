import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

export interface SegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * `tsai-segmented` — an iOS-style single-select segmented control with proper
 * `radiogroup` / `radio` semantics and arrow-key navigation (roving tabindex).
 */
@Component({
  selector: 'tsai-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    role="radiogroup"
    class="inline-flex gap-0.5 rounded-sm border border-border bg-surface-2 p-0.5"
  >
    @for (opt of options(); track opt.value) {
      <button
        type="button"
        role="radio"
        [attr.aria-checked]="value() === opt.value"
        [disabled]="opt.disabled || disabled()"
        [tabindex]="value() === opt.value ? 0 : -1"
        [class]="segClasses(value() === opt.value)"
        (click)="value.set(opt.value)"
        (keydown)="onKeydown($event)"
      >
        {{ opt.label }}
      </button>
    }
  </div>`,
})
export class Segmented implements FormValueControl<string | undefined> {
  readonly options = input<SegmentOption[]>([]);
  readonly disabled = input(false);
  readonly value = model<string>();

  protected segClasses(active: boolean): string {
    return `rounded-[5px] px-3 py-1 text-sm font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-40 ${
      active
        ? 'bg-surface-3 text-text shadow-elev-1'
        : 'text-text-2 hover:text-text'
    }`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    if (!options.length) return;
    const dir =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!dir) return;
    event.preventDefault();

    let index = options.findIndex((o) => o.value === this.value());
    if (index < 0) index = 0;
    for (let step = 0; step < options.length; step++) {
      index = (index + dir + options.length) % options.length;
      if (!options[index].disabled && !this.disabled()) break;
    }
    this.value.set(options[index].value);
    const group = (event.currentTarget as HTMLElement).parentElement;
    (
      group?.querySelectorAll('button')[index] as HTMLElement | undefined
    )?.focus();
  }
}
