import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

/**
 * `tsai-number-input` — numeric input with decrement / increment steppers.
 *
 * Handles both small integer counters and large floating-point values. Set
 * `decimals` to fix the number of fraction digits (the displayed value is
 * always formatted to that precision, e.g. `1000.50`), and `stepBy` for the
 * stepper increment. A comma is accepted as the decimal separator.
 */
@Component({
  selector: 'tsai-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="wrapClasses()">
    <button
      type="button"
      class="grid w-9 shrink-0 place-items-center text-text-2 transition-colors hover:text-text disabled:opacity-40"
      [disabled]="disabled() || !canStep(-1)"
      (click)="step(-1)"
      aria-label="Decrease"
    >
      −
    </button>
    <input
      type="text"
      inputmode="decimal"
      class="w-full min-w-0 bg-transparent py-2 text-center text-sm text-text tabular-nums outline-none disabled:opacity-50"
      [value]="display()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      (change)="onChange($event)"
    />
    <button
      type="button"
      class="grid w-9 shrink-0 place-items-center text-text-2 transition-colors hover:text-text disabled:opacity-40"
      [disabled]="disabled() || !canStep(1)"
      (click)="step(1)"
      aria-label="Increase"
    >
      +
    </button>
  </div>`,
})
export class NumberInput implements FormValueControl<number> {
  readonly min = input<number>();
  readonly max = input<number>();
  /** Stepper increment. */
  readonly stepBy = input(1);
  /** Fixed number of fraction digits shown and rounded to. */
  readonly decimals = input(0);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly value = model(0);

  protected readonly display = computed(() =>
    this.value().toFixed(this.decimals()),
  );

  protected readonly wrapClasses = computed(
    () =>
      `flex items-stretch overflow-hidden rounded-sm border bg-surface-2 transition-colors focus-within:border-accent-hover ${
        this.invalid() ? 'border-danger' : 'border-border'
      }`,
  );

  protected onChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    const parsed = Number(el.value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) {
      this.value.set(this.round(this.clamp(parsed)));
    }
    // Reflect the normalised value even if the numeric value did not change.
    el.value = this.display();
  }

  protected step(direction: 1 | -1): void {
    this.value.set(
      this.round(this.clamp(this.value() + direction * this.stepBy())),
    );
  }

  protected canStep(direction: 1 | -1): boolean {
    const next = this.value() + direction * this.stepBy();
    const min = this.min();
    const max = this.max();
    if (direction < 0 && min !== undefined) return next >= min;
    if (direction > 0 && max !== undefined) return next <= max;
    return true;
  }

  private clamp(n: number): number {
    const min = this.min();
    const max = this.max();
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }

  private round(n: number): number {
    return Number(n.toFixed(this.decimals()));
  }
}
