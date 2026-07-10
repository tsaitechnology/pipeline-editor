import { Overlay, OverlayRef, PositionStrategy } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TemplateRef, ViewContainerRef } from '@angular/core';

export interface ModalOverlayConfig {
  /** Where the panel sits (centered for dialogs, edge-pinned for drawers). */
  positionStrategy: PositionStrategy;
  /** Called when the user requests dismissal (backdrop click / Escape). */
  onDismiss: () => void;
  /** Whether backdrop / Escape should dismiss. */
  dismissible: () => boolean;
}

/**
 * Shared controller for **global** overlays (Dialog, Drawer): a glass backdrop,
 * blocked body scroll, and backdrop / Escape dismissal. Anchored overlays
 * (Select, Menu, Tooltip) use `CdkConnectedOverlay` / CDK Menu instead — see
 * ARCHITECTURE and tasks.md for the split.
 */
export class ModalOverlay {
  private overlayRef?: OverlayRef;

  constructor(
    private readonly overlay: Overlay,
    private readonly viewContainer: ViewContainerRef,
  ) {}

  get isOpen(): boolean {
    return !!this.overlayRef;
  }

  open(panel: TemplateRef<unknown>, config: ModalOverlayConfig): void {
    if (this.overlayRef) return;
    const ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'tsai-overlay-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: config.positionStrategy,
    });
    ref.attach(new TemplatePortal(panel, this.viewContainer));
    ref.backdropClick().subscribe(() => {
      if (config.dismissible()) config.onDismiss();
    });
    ref.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape' && config.dismissible()) {
        event.preventDefault();
        config.onDismiss();
      }
    });
    this.overlayRef = ref;
  }

  close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }
}
