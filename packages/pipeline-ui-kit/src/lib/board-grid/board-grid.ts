import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { GRID_CELL } from '@tsai-pe/board-core';
import type { Point } from '@tsai-pe/models';

/**
 * Infinite dot grid. It follows viewport pan/zoom but owns no board state.
 */
@Component({
  selector: 'pe-board-grid',
  imports: [],
  template: `<div
    class="pe-board-grid-dots absolute inset-0 opacity-80"
    [style.background-size]="cell()"
    [style.background-position]="position()"
  ></div>`,
  styles: `
    .pe-board-grid-dots {
      background-image: radial-gradient(
        circle,
        var(--canvas-grid-dot, rgba(255, 255, 255, 0.06)) 1px,
        transparent 1px
      );
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block absolute inset-0 overflow-hidden' },
})
export class BoardGrid {
  readonly pan = input<Point>({ x: 0, y: 0 });
  readonly zoom = input(1);

  protected readonly cell = computed(() => {
    const size = `${GRID_CELL * this.zoom()}px`;
    return `${size} ${size}`;
  });
  protected readonly position = computed(() => {
    const { x, y } = this.pan();
    return `${x}px ${y}px`;
  });
}
