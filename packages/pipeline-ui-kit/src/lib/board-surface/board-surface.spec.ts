import { TestBed } from '@angular/core/testing';
import { BoardSurface } from './board-surface';

describe('BoardSurface', () => {
  it('renders the transformed world layer', async () => {
    const fixture = TestBed.createComponent(BoardSurface);
    fixture.componentRef.setInput('pan', { x: 10, y: 20 });
    fixture.componentRef.setInput('zoom', 1.5);
    fixture.detectChanges();
    await fixture.whenStable();

    const world = fixture.nativeElement.querySelector(
      '.origin-top-left',
    ) as HTMLElement;
    expect(world.style.transform).toBe('translate(10px, 20px) scale(1.5)');
  });

  it('renders the dot grid layer with viewport-bound sizing', async () => {
    const fixture = TestBed.createComponent(BoardSurface);
    fixture.componentRef.setInput('pan', { x: 12, y: 18 });
    fixture.componentRef.setInput('zoom', 2);
    fixture.detectChanges();
    await fixture.whenStable();

    const grid = fixture.nativeElement.querySelector(
      'pe-board-grid div',
    ) as HTMLElement;
    expect(grid.classList).toContain('pe-board-grid-dots');
    expect(grid.classList).not.toContain('opacity-80');
    expect(grid.style.backgroundSize).toBe('64px 64px');
    expect(grid.style.backgroundPosition).toBe('12px 18px');
  });

  it('emits surface pointer events', async () => {
    const fixture = TestBed.createComponent(BoardSurface);
    fixture.detectChanges();
    await fixture.whenStable();

    let pointerId = 0;
    fixture.componentInstance.surfacePointerDown.subscribe((event) => {
      pointerId = event.pointerId;
    });
    const event = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    fixture.nativeElement.dispatchEvent(event);

    expect(pointerId).toBe(7);
  });
});
