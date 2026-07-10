import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<AlertVariant, { box: string; icon: string }> = {
  info: { box: 'border-info/30 bg-info/10', icon: 'text-info' },
  success: { box: 'border-success/30 bg-success/10', icon: 'text-success' },
  warning: { box: 'border-warning/30 bg-warning/10', icon: 'text-warning' },
  danger: { box: 'border-danger/30 bg-danger/10', icon: 'text-danger' },
};

/**
 * `tsai-alert` — an inline status banner (info / success / warning / danger)
 * with an optional title and dismiss button. `role="alert"` announces it to
 * assistive tech.
 */
@Component({
  selector: 'tsai-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (!hidden()) {
    <div role="alert" [class]="boxClasses()">
      <span
        class="mt-px shrink-0"
        [class]="TONE[variant()].icon"
        aria-hidden="true"
      >
        @switch (variant()) {
          @case ('success') {
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
          }
          @case ('warning') {
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
              />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          }
          @case ('danger') {
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6M9 9l6 6" />
            </svg>
          }
          @default {
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          }
        }
      </span>
      <div class="min-w-0 flex-1">
        @if (title()) {
          <div class="font-medium text-text">{{ title() }}</div>
        }
        <div class="text-text-2"><ng-content /></div>
      </div>
      @if (dismissible()) {
        <button
          type="button"
          aria-label="Dismiss"
          class="mt-px grid size-5 shrink-0 place-items-center rounded-sm text-text-3 transition-colors hover:text-text focus-visible:outline-none"
          (click)="dismiss()"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      }
    </div>
  }`,
})
export class Alert {
  readonly variant = input<AlertVariant>('info');
  readonly title = input<string>();
  readonly dismissible = input(false);
  readonly dismissed = output<void>();

  protected readonly TONE = TONE;
  protected readonly hidden = signal(false);

  protected readonly boxClasses = computed(
    () =>
      `flex gap-3 rounded-md border px-3.5 py-3 text-sm ${TONE[this.variant()].box}`,
  );

  protected dismiss(): void {
    this.hidden.set(true);
    this.dismissed.emit();
  }
}
