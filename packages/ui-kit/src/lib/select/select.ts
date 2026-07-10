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
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import { Listbox, Option } from '@angular/aria/listbox';
import type { FormValueControl } from '@angular/forms/signals';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const PANEL_POSITIONS: ConnectedPosition[] = [
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

/**
 * `tsai-select` — a proper dropdown select: a trigger showing the current
 * selection that opens a floating panel (CDK Overlay) containing an Angular Aria
 * listbox. Supports single and multiple selection (`multi`); in single mode the
 * panel closes on pick, in multi mode it stays open to toggle several options.
 */
@Component({
  selector: 'tsai-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    Listbox,
    Option,
  ],
  template: `<button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-expanded]="open()"
      aria-haspopup="listbox"
      class="flex h-9 w-full items-center justify-between gap-2 rounded-sm border bg-surface-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:border-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      [class.border-danger]="invalid()"
      [class.border-border]="!invalid()"
      [class.text-text]="hasSelection()"
      [class.text-text-3]="!hasSelection()"
      (click)="toggle()"
    >
      <span class="truncate">{{ displayLabel() }}</span>
      <svg
        class="size-4 shrink-0 text-text-3 transition-transform duration-200"
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

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayWidth]="triggerWidth()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (detach)="close()"
      (overlayKeydown)="onKeydown($event)"
    >
      <ul
        ngListbox
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        [values]="value()"
        (valuesChange)="onValues($event)"
        [multi]="multi()"
        [selectionMode]="multi() ? 'explicit' : 'follow'"
        class="flex max-h-64 flex-col gap-0.5 overflow-auto rounded-md border border-border bg-surface-2 p-1 text-sm text-text shadow-elev-2 focus-visible:outline-none"
      >
        @for (opt of options(); track opt.value) {
          <li
            ngOption
            [value]="opt.value"
            [label]="opt.label"
            [disabled]="opt.disabled ?? false"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 transition-colors hover:bg-surface-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-selected:bg-accent-quiet aria-selected:text-text"
          >
            <span class="truncate">{{ opt.label }}</span>
            @if (isSelected(opt.value)) {
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
        }
      </ul>
    </ng-template>`,
})
export class Select implements FormValueControl<string[]> {
  readonly options = input<SelectOption[]>([]);
  readonly multi = input(false);
  readonly placeholder = input('Select…');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly value = model<string[]>([]);

  protected readonly positions = PANEL_POSITIONS;
  protected readonly open = signal(false);
  protected readonly triggerWidth = signal(0);
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly hasSelection = computed(() => this.value().length > 0);

  protected readonly displayLabel = computed(() => {
    const values = this.value();
    if (!values.length) return this.placeholder();
    const labels = this.options()
      .filter((o) => values.includes(o.value))
      .map((o) => o.label);
    if (this.multi() && labels.length > 2) return `${labels.length} selected`;
    return labels.join(', ') || this.placeholder();
  });

  protected isSelected(value: string): boolean {
    return this.value().includes(value);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (!this.open()) {
      this.triggerWidth.set(this.trigger().nativeElement.offsetWidth);
    }
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onValues(values: string[]): void {
    this.value.set(values);
    if (!this.multi()) this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
