import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Overlay } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';
import { ModalOverlay } from '../overlay/modal-overlay';

export type DialogSize = 'sm' | 'md' | 'lg';

const SIZES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

let nextId = 0;

/**
 * `tsai-dialog` — an accessible modal built on CDK Overlay.
 *
 * Architecture: dialogs are *global* overlays, so this uses the imperative
 * `Overlay` service (centered global position + block scroll) rather than an
 * anchored `CdkConnectedOverlay` (which the anchored overlays like Select use).
 * Usage stays declarative via `[(open)]`.
 *
 * Accessibility: `role="dialog"`, `aria-modal`, labelled by the title, focus is
 * trapped and auto-captured on open and restored to the trigger on close
 * (`cdkTrapFocus`), Escape and backdrop close (unless `dismissible` is false),
 * and body scroll is locked while open.
 *
 * ```html
 * <tsai-button (click)="open.set(true)">Open</tsai-button>
 * <tsai-dialog [(open)]="open" title="Title">
 *   Body…
 *   <ng-container dialog-footer>
 *     <tsai-button variant="ghost" (click)="open.set(false)">Cancel</tsai-button>
 *     <tsai-button (click)="open.set(false)">Confirm</tsai-button>
 *   </ng-container>
 * </tsai-dialog>
 * ```
 */
@Component({
  selector: 'tsai-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus],
  template: `<ng-template #panel>
    <div
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="title() ? titleId : null"
      [class]="panelClasses()"
    >
      @if (title()) {
        <div
          class="flex items-center justify-between gap-3 border-b border-border px-5 py-4"
        >
          <h2 [id]="titleId" class="text-base font-semibold text-text">
            {{ title() }}
          </h2>
          <button
            type="button"
            aria-label="Close"
            class="grid size-7 place-items-center rounded-sm text-text-3 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none"
            (click)="close()"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
      <div class="px-5 py-4 text-sm text-text-2">
        <ng-content />
      </div>
      <div
        class="flex flex-wrap items-center justify-end gap-2 px-5 py-4 empty:hidden"
      >
        <ng-content select="[dialog-footer]" />
      </div>
    </div>
  </ng-template>`,
})
export class Dialog {
  readonly open = model(false);
  readonly title = input<string>();
  readonly size = input<DialogSize>('md');
  /** Allow closing via backdrop click / Escape. */
  readonly dismissible = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `tsai-dialog-${nextId++}`;

  private readonly overlay = inject(Overlay);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private readonly modal = new ModalOverlay(
    this.overlay,
    inject(ViewContainerRef),
  );

  protected readonly panelClasses = computed(
    () =>
      `tsai-dialog-enter relative flex max-h-[85vh] w-[calc(100vw-2rem)] flex-col overflow-auto rounded-xl border border-border bg-surface-1 shadow-elev-3 ${
        SIZES[this.size()]
      }`,
  );

  constructor() {
    effect(() => (this.open() ? this.attach() : this.modal.close()));
    inject(DestroyRef).onDestroy(() => this.modal.close());
  }

  protected close(): void {
    if (this.open()) {
      this.open.set(false);
      this.closed.emit();
    }
  }

  private attach(): void {
    this.modal.open(this.panel(), {
      positionStrategy: this.overlay
        .position()
        .global()
        .centerHorizontally()
        .centerVertically(),
      onDismiss: () => this.close(),
      dismissible: () => this.dismissible(),
    });
  }
}
