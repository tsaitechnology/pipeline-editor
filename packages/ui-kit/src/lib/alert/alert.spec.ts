import { TestBed } from '@angular/core/testing';
import { Alert } from './alert';

describe('Alert', () => {
  it('renders with role="alert"', async () => {
    const fixture = TestBed.createComponent(Alert);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('removes itself and emits when dismissed', async () => {
    const fixture = TestBed.createComponent(Alert);
    fixture.componentRef.setInput('dismissible', true);
    let emitted = false;
    fixture.componentInstance.dismissed.subscribe(() => (emitted = true));
    await fixture.whenStable();

    const close = fixture.nativeElement.querySelector(
      'button[aria-label="Dismiss"]',
    ) as HTMLButtonElement;
    close.click();
    await fixture.whenStable();

    expect(emitted).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
