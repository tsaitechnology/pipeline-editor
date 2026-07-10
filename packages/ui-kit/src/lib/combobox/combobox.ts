import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
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

let comboId = 0;

/**
 * `tsai-combobox` — a single-select, type-to-filter dropdown.
 *
 * Follows the ARIA combobox pattern: focus stays in the text input, options are
 * filtered as you type, and the active option is tracked via
 * `aria-activedescendant` (not focus movement). Keyboard: Arrow up/down to move,
 * Enter to pick, Escape to close.
 */
@Component({
  selector: 'tsai-combobox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin],
  template: `<div [class]="wrapClasses()">
      <input
        #trigger
        cdkOverlayOrigin
        #origin="cdkOverlayOrigin"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="
          open() && active() >= 0 ? listId + '-' + active() : null
        "
        [value]="query()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() || null"
        class="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-3 focus-visible:shadow-none disabled:cursor-not-allowed"
        (input)="onInput($event)"
        (focus)="openPanel()"
        (blur)="onBlur()"
        (keydown)="onKeydown($event)"
      />
      <button
        type="button"
        tabindex="-1"
        aria-label="Toggle options"
        class="grid size-5 shrink-0 place-items-center text-text-3"
        (mousedown)="$event.preventDefault(); toggle()"
      >
        <svg
          class="size-4 transition-transform duration-200"
          [class.rotate-180]="open()"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayWidth]="triggerWidth()"
      [cdkConnectedOverlayPositions]="positions"
    >
      <ul
        [id]="listId"
        role="listbox"
        class="flex max-h-64 flex-col gap-0.5 overflow-auto rounded-md border border-border bg-surface-2 p-1 text-sm text-text shadow-elev-2"
        (mousedown)="onOptionMousedown($event)"
      >
        @for (opt of filtered(); track opt.value; let i = $index) {
          <li
            [id]="listId + '-' + i"
            role="option"
            [attr.data-index]="i"
            [attr.aria-selected]="opt.value === value()"
            [attr.aria-disabled]="opt.disabled || null"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 transition-colors aria-disabled:pointer-events-none aria-disabled:opacity-40 aria-selected:text-text"
            [class.bg-surface-3]="i === active()"
          >
            <span class="truncate">{{ opt.label }}</span>
            @if (opt.value === value()) {
              <svg
                class="size-4 shrink-0 text-accent"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            }
          </li>
        } @empty {
          <li class="px-2.5 py-1.5 text-text-3">No results</li>
        }
      </ul>
    </ng-template>`,
})
export class Combobox implements FormValueControl<string> {
  readonly options = input<ComboboxOption[]>([]);
  readonly placeholder = input('Search…');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly value = model('');

  protected readonly positions = POSITIONS;
  protected readonly listId = `tsai-combobox-${comboId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly query = signal('');
  protected readonly triggerWidth = signal(0);

  private readonly trigger =
    viewChild.required<ElementRef<HTMLInputElement>>('trigger');

  constructor() {
    // Keep the input text in sync with the selected value while closed.
    effect(() => {
      if (!this.open()) this.query.set(this.selectedLabel());
    });
  }

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const options = this.options();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  });

  protected readonly wrapClasses = computed(
    () =>
      `flex items-center gap-2 rounded-sm border bg-surface-2 px-3 transition-colors focus-within:border-accent-hover h-9 ${
        this.invalid() ? 'border-danger' : 'border-border'
      } ${this.disabled() ? 'opacity-50' : ''}`,
  );

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
    this.openPanel();
  }

  protected openPanel(): void {
    if (this.disabled() || this.open()) return;
    this.triggerWidth.set(this.trigger().nativeElement.offsetWidth);
    this.open.set(true);
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else {
      this.trigger().nativeElement.focus();
      this.openPanel();
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onBlur(): void {
    this.close();
    this.query.set(this.selectedLabel());
  }

  protected onOptionMousedown(event: MouseEvent): void {
    // Keep focus in the input; select via event delegation.
    event.preventDefault();
    const el = (event.target as HTMLElement).closest('[data-index]');
    if (!el) return;
    const opt = this.filtered()[Number(el.getAttribute('data-index'))];
    if (opt) this.select(opt);
  }

  protected select(opt: ComboboxOption): void {
    if (opt.disabled) return;
    this.value.set(opt.value);
    this.query.set(opt.label);
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) this.openPanel();
        else this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        if (!this.open()) return;
        event.preventDefault();
        const opt = this.filtered()[this.active()];
        if (opt) this.select(opt);
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
          this.query.set(this.selectedLabel());
        }
        break;
      default:
        break;
    }
  }

  private move(direction: 1 | -1): void {
    const count = this.filtered().length;
    if (!count) return;
    this.active.set((this.active() + direction + count) % count);
  }

  private selectedLabel(): string {
    return this.options().find((o) => o.value === this.value())?.label ?? '';
  }
}
