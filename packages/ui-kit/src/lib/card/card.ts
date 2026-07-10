import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** `tsai-card` — a surface container with an optional title header. */
@Component({
  selector: 'tsai-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="rounded-lg border border-border bg-surface-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
  >
    @if (title()) {
      <div
        class="border-b border-border px-4 py-3 text-sm font-semibold text-text"
      >
        {{ title() }}
      </div>
    }
    <div class="p-4">
      <ng-content />
    </div>
  </div>`,
})
export class Card {
  readonly title = input<string>();
}
