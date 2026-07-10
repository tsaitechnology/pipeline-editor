import { TestBed } from '@angular/core/testing';
import { Segmented } from './segmented';

const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

describe('Segmented', () => {
  it('selects the clicked segment and marks it checked', async () => {
    const fixture = TestBed.createComponent(Segmented);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('value', 'a');
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[1].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('b');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons[0].getAttribute('aria-checked')).toBe('false');
  });
});
