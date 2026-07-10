import { TestBed } from '@angular/core/testing';
import { DatePicker } from './datepicker';

describe('DatePicker', () => {
  it('formats the selected ISO value in the trigger', async () => {
    const fixture = TestBed.createComponent(DatePicker);
    fixture.componentRef.setInput('value', '2026-01-15');
    await fixture.whenStable();

    const text =
      (fixture.nativeElement.querySelector('button')?.textContent as string) ??
      '';
    expect(text).toContain('2026');
    expect(text).toContain('15');
  });
});
