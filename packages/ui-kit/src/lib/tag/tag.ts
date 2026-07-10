import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

export type TagVariant = 'neutral' | 'accent';

const VARIANTS: Record<TagVariant, string> = {
  neutral: 'border-border bg-surface-2 text-text-2',
  accent: 'border-accent/30 bg-accent-quiet text-accent',
};

/**
 * `tsai-tag` — a compact, optionally removable chip. Unlike the static `Badge`,
 * a tag can carry a remove affordance (emits `removed`).
 */
@Component({
  selector: 'tsai-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()">
    <ng-content />
    @if (removable()) {
      <button
        type="button"
        aria-label="Remove"
        class="-mr-0.5 grid size-3.5 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none"
        (click)="removed.emit()"
      >
        <svg
          class="size-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    }
  </span>`,
})
export class Tag {
  readonly variant = input<TagVariant>('neutral');
  readonly removable = input(false);
  readonly removed = output<void>();

  protected readonly classes = computed(
    () =>
      `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        VARIANTS[this.variant()]
      }`,
  );
}
