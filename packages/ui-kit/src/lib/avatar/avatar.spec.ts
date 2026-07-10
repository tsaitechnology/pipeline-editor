import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('derives two-letter initials from the name', async () => {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', 'John Doe');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent?.trim()).toBe('JD');
  });

  it('renders an image when src is provided', async () => {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', 'Jane');
    fixture.componentRef.setInput('src', 'https://example.com/a.png');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
  });
});
