import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastData {
  id: number;
  message: string;
  title?: string;
  variant: ToastVariant;
}

export interface ToastOptions {
  message: string;
  title?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after N ms (0 to keep until dismissed). Default 4000. */
  duration?: number;
}

const DOT: Record<ToastVariant, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * Toast notifications. Inject `ToastService` and call `show(...)`; the service
 * lazily mounts a single bottom-right `aria-live` region (via CDK Overlay) that
 * stacks toasts and auto-dismisses them.
 *
 * ```ts
 * private toasts = inject(ToastService);
 * this.toasts.show({ message: 'Saved', variant: 'success' });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastData[]>([]);

  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private overlayRef?: OverlayRef;
  private counter = 0;

  show(options: ToastOptions): number {
    this.ensureOutlet();
    const id = ++this.counter;
    this.toasts.update((list) => [
      ...list,
      {
        id,
        message: options.message,
        title: options.title,
        variant: options.variant ?? 'info',
      },
    ]);
    const duration = options.duration ?? 4000;
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private ensureOutlet(): void {
    if (this.overlayRef) return;
    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .global()
        .bottom('1rem')
        .right('1rem'),
    });
    this.overlayRef.attach(
      new ComponentPortal(ToastOutlet, null, this.injector),
    );
  }
}

/** A single toast card. */
@Component({
  selector: 'tsai-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="tsai-dialog-enter flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 shadow-elev-2"
  >
    <span
      class="mt-1.5 size-2 shrink-0 rounded-full"
      [class]="dot()"
      aria-hidden="true"
    ></span>
    <div class="min-w-0 flex-1 text-sm">
      @if (data().title) {
        <div class="font-medium text-text">{{ data().title }}</div>
      }
      <div class="text-text-2">{{ data().message }}</div>
    </div>
    <button
      type="button"
      aria-label="Dismiss"
      class="grid size-5 shrink-0 place-items-center rounded-sm text-text-3 transition-colors hover:text-text focus-visible:outline-none"
      (click)="dismissed.emit()"
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
  </div>`,
})
export class Toast {
  readonly data = input.required<ToastData>();
  readonly dismissed = output<void>();
  protected readonly dot = computed(() => DOT[this.data().variant]);
}

/** Internal: the stacked, live region that renders active toasts. */
@Component({
  selector: 'tsai-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toast],
  host: {
    class:
      'pointer-events-none flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  },
  template: `@for (t of service.toasts(); track t.id) {
    <tsai-toast
      class="pointer-events-auto"
      [data]="t"
      (dismissed)="service.dismiss(t.id)"
    />
  }`,
})
export class ToastOutlet {
  protected readonly service = inject(ToastService);
}
