import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * `tsai-glow-surface` — a premium container: hairline-bordered surface with an
 * ambient top wash, two large blurred accent glows, and a fine grain overlay.
 *
 * This is the "hero" surface for placing content, forms or the AI assistant on.
 * The plain `tsai-card` intentionally stays flat; reach for this when a section
 * should feel elevated and alive (Linear/Vercel-style depth from light, not
 * from material drop-shadows).
 */
@Component({
  selector: 'tsai-glow-surface',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="grain relative isolate overflow-hidden rounded-xl border border-border bg-surface-1"
  >
    <!-- ambient wash from the top -->
    <div
      class="pointer-events-none absolute inset-0 -z-10"
      style="background: radial-gradient(120% 90% at 50% -10%, rgba(124,92,255,0.10), transparent 60%);"
      aria-hidden="true"
    ></div>
    <!-- accent glow -->
    <div
      class="pointer-events-none absolute -left-24 -top-28 -z-10 h-72 w-72 rounded-full"
      style="background: var(--accent-glow); filter: blur(120px);"
      aria-hidden="true"
    ></div>
    <!-- secondary (analogous) glow -->
    <div
      class="pointer-events-none absolute -bottom-32 -right-16 -z-10 h-72 w-72 rounded-full"
      style="background: rgba(59,130,246,0.22); filter: blur(140px);"
      aria-hidden="true"
    ></div>
    <div [class]="padded() ? 'relative p-6' : 'relative'">
      <ng-content />
    </div>
  </div>`,
})
export class GlowSurface {
  readonly padded = input(true);
}
