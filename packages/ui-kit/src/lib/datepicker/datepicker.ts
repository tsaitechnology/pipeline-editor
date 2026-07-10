import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import type { FormValueControl } from '@angular/forms/signals';

interface Day {
  iso: string;
  label: number;
  inMonth: boolean;
}

const POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 4,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -4,
  },
];

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (iso: string): Date | null => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/**
 * `tsai-datepicker` — a trigger that opens a month-grid calendar in a popover
 * (CDK Overlay). Value is an ISO `yyyy-mm-dd` string. Keyboard: arrows move by
 * day/week, PageUp/PageDown change month, Enter selects, Escape closes.
 * (The lighter `tsai-date-input` — a native `<input type="date">` — remains
 * available for simpler cases.)
 */
@Component({
  selector: 'tsai-datepicker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin],
  template: `<button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [disabled]="disabled()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [class]="triggerClasses()"
      (click)="toggle()"
    >
      <span [class.text-text-3]="!value()">{{
        display() || placeholder()
      }}</span>
      <svg
        class="size-4 shrink-0 text-text-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18M8 2v4M16 2v4" />
      </svg>
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
    >
      <div
        class="tsai-dialog-enter w-64 rounded-md border border-border bg-surface-2 p-2 text-sm shadow-elev-2"
        role="dialog"
        aria-label="Choose date"
      >
        <div class="mb-1 flex items-center justify-between">
          <button
            type="button"
            class="grid size-7 place-items-center rounded-sm text-text-2 hover:bg-surface-3 hover:text-text focus-visible:outline-none"
            aria-label="Previous month"
            (click)="shiftMonth(-1)"
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
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span class="font-medium text-text">{{ monthLabel() }}</span>
          <button
            type="button"
            class="grid size-7 place-items-center rounded-sm text-text-2 hover:bg-surface-3 hover:text-text focus-visible:outline-none"
            aria-label="Next month"
            (click)="shiftMonth(1)"
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <div role="grid">
          <div role="row" class="mb-1 grid grid-cols-7">
            @for (w of weekdays; track w) {
              <span
                role="columnheader"
                class="grid h-7 place-items-center text-xs text-text-3"
                >{{ w }}</span
              >
            }
          </div>
          <div class="grid grid-cols-7 gap-0.5">
            @for (day of days(); track day.iso) {
              <button
                type="button"
                role="gridcell"
                [attr.data-iso]="day.iso"
                [attr.aria-selected]="day.iso === value()"
                [tabindex]="day.iso === focused() ? 0 : -1"
                [class]="dayClasses(day)"
                (click)="select(day.iso)"
                (keydown)="onGridKeydown($event)"
              >
                {{ day.label }}
              </button>
            }
          </div>
        </div>
      </div>
    </ng-template>`,
})
export class DatePicker implements FormValueControl<string> {
  readonly placeholder = input('Pick a date');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly value = model<string>('');

  protected readonly weekdays = WEEKDAYS;
  protected readonly positions = POSITIONS;
  protected readonly open = signal(false);
  /** First day of the displayed month. */
  protected readonly view = signal(startOfMonth(new Date()));
  /** The keyboard-focused day (ISO). */
  protected readonly focused = signal(toIso(new Date()));

  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly display = computed(() => {
    const date = this.value() ? parseIso(this.value()) : null;
    return date
      ? date.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
  });

  protected readonly monthLabel = computed(() =>
    this.view().toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
  );

  protected readonly days = computed<Day[]>(() => {
    const first = this.view();
    const month = first.getMonth();
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(first);
    start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        iso: toIso(d),
        label: d.getDate(),
        inMonth: d.getMonth() === month,
      };
    });
  });

  protected readonly triggerClasses = computed(
    () =>
      `flex h-9 w-full items-center justify-between gap-2 rounded-sm border bg-surface-2 px-3 text-sm text-text transition-colors focus-visible:outline-none focus-visible:border-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${
        this.invalid() ? 'border-danger' : 'border-border'
      }`,
  );

  protected dayClasses(day: Day): string {
    const selected = day.iso === this.value();
    return `grid h-8 place-items-center rounded-sm text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent ${
      selected
        ? 'bg-accent text-accent-fg'
        : day.inMonth
          ? 'text-text hover:bg-surface-3'
          : 'text-text-3 hover:bg-surface-3'
    }`;
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) this.close();
    else this.openPanel();
  }

  protected openPanel(): void {
    const base = (this.value() && parseIso(this.value())) || new Date();
    this.view.set(startOfMonth(base));
    this.focused.set(toIso(base));
    this.open.set(true);
    this.focusDay(toIso(base));
  }

  protected close(): void {
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }

  protected select(iso: string): void {
    this.value.set(iso);
    this.close();
  }

  protected shiftMonth(delta: number): void {
    const next = new Date(this.view());
    next.setMonth(next.getMonth() + delta);
    this.view.set(startOfMonth(next));
  }

  protected onGridKeydown(event: KeyboardEvent): void {
    const current = parseIso(this.focused());
    if (!current) return;
    let delta = 0;
    switch (event.key) {
      case 'ArrowLeft':
        delta = -1;
        break;
      case 'ArrowRight':
        delta = 1;
        break;
      case 'ArrowUp':
        delta = -7;
        break;
      case 'ArrowDown':
        delta = 7;
        break;
      case 'PageUp':
        this.shiftMonth(-1);
        event.preventDefault();
        return;
      case 'PageDown':
        this.shiftMonth(1);
        event.preventDefault();
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(this.focused());
        return;
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = new Date(current);
    target.setDate(current.getDate() + delta);
    const iso = toIso(target);
    this.focused.set(iso);
    if (target.getMonth() !== this.view().getMonth()) {
      this.view.set(startOfMonth(target));
    }
    this.focusDay(iso);
  }

  private focusDay(iso: string): void {
    setTimeout(() => {
      (
        document.querySelector(`[data-iso="${iso}"]`) as HTMLElement | null
      )?.focus();
    });
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
