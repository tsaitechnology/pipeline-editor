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

export type DrawerSide = 'right' | 'left' | 'bottom';

const PANEL: Record<DrawerSide, string> = {
  right: 'tsai-drawer-right h-screen w-full max-w-md border-l',
  left: 'tsai-drawer-left h-screen w-full max-w-md border-r',
  bottom: 'tsai-drawer-bottom max-h-[85vh] w-screen rounded-t-xl border-t',
};

let nextId = 0;

/**
 * `tsai-drawer` — a slide-over panel (right / left / bottom) on the shared
 * `ModalOverlay` (glass backdrop, focus trap, scroll lock, Escape / backdrop
 * dismiss). Same accessibility contract as `tsai-dialog`.
 */
@Component({
  selector: 'tsai-drawer',
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
      <div class="flex-1 overflow-auto px-5 py-4 text-sm text-text-2">
        <ng-content />
      </div>
      <div
        class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 empty:hidden"
      >
        <ng-content select="[drawer-footer]" />
      </div>
    </div>
  </ng-template>`,
})
export class Drawer {
  readonly open = model(false);
  readonly side = input<DrawerSide>('right');
  readonly title = input<string>();
  readonly dismissible = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `tsai-drawer-${nextId++}`;

  private readonly overlay = inject(Overlay);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private readonly modal = new ModalOverlay(
    this.overlay,
    inject(ViewContainerRef),
  );

  protected readonly panelClasses = computed(
    () =>
      `relative flex flex-col border-border bg-surface-1 shadow-elev-3 ${PANEL[this.side()]}`,
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
      positionStrategy: this.positionStrategy(),
      onDismiss: () => this.close(),
      dismissible: () => this.dismissible(),
    });
  }

  private positionStrategy() {
    const position = this.overlay.position().global();
    switch (this.side()) {
      case 'left':
        return position.top('0').left('0');
      case 'bottom':
        return position.bottom('0').centerHorizontally();
      default:
        return position.top('0').right('0');
    }
  }
}
