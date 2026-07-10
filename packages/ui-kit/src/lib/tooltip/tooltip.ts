import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
} from '@angular/core';

/** Internal container rendered inside the tooltip overlay. */
@Component({
  selector: 'tsai-tooltip-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tooltip',
    '[id]': 'id',
    class:
      'tsai-dialog-enter block max-w-xs rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text shadow-elev-2',
  },
  template: `{{ text }}`,
})
export class TooltipContainer {
  text = '';
  id = '';
}

let tooltipId = 0;

/**
 * `[tsaiTooltip]` — a small label shown on hover / focus, built on CDK Overlay.
 * Accessible: the tooltip is wired to the host via `aria-describedby`, shows on
 * keyboard focus (not just hover) and hides on Escape.
 */
@Directive({
  selector: '[tsaiTooltip]',
  host: {
    '(mouseenter)': 'scheduleShow()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class Tooltip implements OnDestroy {
  readonly text = input.required<string>({ alias: 'tsaiTooltip' });
  readonly delay = input(300, { alias: 'tsaiTooltipDelay' });

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private overlayRef?: OverlayRef;
  private timer?: ReturnType<typeof setTimeout>;

  protected scheduleShow(): void {
    this.timer = setTimeout(() => this.show(), this.delay());
  }

  protected show(): void {
    clearTimeout(this.timer);
    if (this.overlayRef || !this.text()) return;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.host)
      .withPositions([
        {
          originX: 'center',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom',
          offsetY: -6,
        },
        {
          originX: 'center',
          originY: 'bottom',
          overlayX: 'center',
          overlayY: 'top',
          offsetY: 6,
        },
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
    const ref = this.overlayRef.attach(new ComponentPortal(TooltipContainer));
    const id = `tsai-tooltip-${tooltipId++}`;
    ref.instance.text = this.text();
    ref.instance.id = id;
    ref.changeDetectorRef.detectChanges();
    this.host.nativeElement.setAttribute('aria-describedby', id);
  }

  protected hide(): void {
    clearTimeout(this.timer);
    this.host.nativeElement.removeAttribute('aria-describedby');
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
