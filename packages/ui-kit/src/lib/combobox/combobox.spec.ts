import { TestBed } from '@angular/core/testing';
import { Combobox } from './combobox';

describe('Combobox', () => {
  it('reflects the selected option label in the input while closed', async () => {
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('options', [
      { value: 'vue', label: 'Vue' },
      { value: 'react', label: 'React' },
    ]);
    fixture.componentRef.setInput('value', 'vue');
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(input.value).toBe('Vue');
    expect(input.getAttribute('role')).toBe('combobox');
  });
});
