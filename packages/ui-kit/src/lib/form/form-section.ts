import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** `tsai-form-section` — a titled group of fields with an optional description. */
@Component({
  selector: 'tsai-form-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="flex flex-col gap-4">
    @if (heading() || description()) {
      <div class="flex flex-col gap-1">
        @if (heading()) {
          <h3 class="text-sm font-semibold text-text">{{ heading() }}</h3>
        }
        @if (description()) {
          <p class="text-xs text-text-3">{{ description() }}</p>
        }
      </div>
    }
    <div class="flex flex-col gap-4">
      <ng-content />
    </div>
  </section>`,
})
export class FormSection {
  readonly heading = input<string>();
  readonly description = input<string>();
}
