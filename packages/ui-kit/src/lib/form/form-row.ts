import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

const COLS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

/**
 * `tsai-form-row` — responsive column grid for laying fields side by side.
 * Fine-grained / bespoke grids stay in the feature; this covers the common
 * 1–3 column cases.
 */
@Component({
  selector: 'tsai-form-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="classes()"><ng-content /></div>`,
})
export class FormRow {
  readonly cols = input<1 | 2 | 3>(2);
  protected readonly classes = computed(
    () => `grid gap-4 ${COLS[this.cols()]}`,
  );
}
