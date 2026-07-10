import { TestBed } from '@angular/core/testing';
import { Tag } from './tag';

describe('Tag', () => {
  it('shows a remove button only when removable and emits on click', async () => {
    const fixture = TestBed.createComponent(Tag);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();

    fixture.componentRef.setInput('removable', true);
    let removed = false;
    fixture.componentInstance.removed.subscribe(() => (removed = true));
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    button.click();
    expect(removed).toBe(true);
  });
});
