import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `tsai-actionbar` — a floating glass bar for contextual actions (e.g. pinned
 * to the bottom of a canvas). Positioning is left to the consumer; this renders
 * the glass pill. Wrap in a fixed/sticky container to anchor it.
 */
@Component({
  selector: 'tsai-actionbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="glass inline-flex items-center gap-1 rounded-lg px-2 py-1.5"
  >
    <ng-content />
  </div>`,
})
export class Actionbar {}
