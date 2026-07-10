import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `tsai-navbar` — a glass top bar with brand / center / actions slots.
 *
 * ```html
 * <tsai-navbar>
 *   <span brand>Pipeline Editor</span>
 *   <nav center>…</nav>
 *   <tsai-button actions size="sm">New</tsai-button>
 * </tsai-navbar>
 * ```
 */
@Component({
  selector: 'tsai-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="glass flex h-14 items-center gap-4 rounded-lg px-4">
    <div class="flex items-center gap-2 font-semibold text-text">
      <ng-content select="[brand]" />
    </div>
    <nav class="flex flex-1 items-center gap-1">
      <ng-content select="[center]" />
    </nav>
    <div class="flex items-center gap-2">
      <ng-content select="[actions]" />
    </div>
  </header>`,
})
export class Navbar {}
