import { ChangeDetectionStrategy, Component } from '@angular/core';

/** `tsai-sidebar` — a vertical navigation rail. Fill with `tsai-sidebar-item`. */
@Component({
  selector: 'tsai-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside
    class="flex w-56 shrink-0 flex-col gap-0.5 rounded-lg border border-border bg-surface-1/60 p-2"
  >
    <ng-content />
  </aside>`,
})
export class Sidebar {}
