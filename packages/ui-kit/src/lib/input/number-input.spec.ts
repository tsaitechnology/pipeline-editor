import { TestBed } from '@angular/core/testing';
import { NumberInput } from './number-input';

async function make(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(NumberInput);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('NumberInput', () => {
  it('formats the value to the fixed number of decimals', async () => {
    const fixture = await make({ value: 1000.5, decimals: 2 });
    const input = fixture.nativeElement.querySelector('input');
    expect(input?.value).toBe('1000.50');
  });

  it('steps up and clamps at max', async () => {
    const fixture = await make({ value: 9, max: 10, stepBy: 1 });
    const inc = fixture.nativeElement.querySelector(
      'button[aria-label="Increase"]',
    ) as HTMLButtonElement;

    inc.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe(10);
    expect(inc.disabled).toBe(true);
  });
});
