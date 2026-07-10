import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

/** `tsai-avatar` — a circular avatar showing an image or initials fallback. */
@Component({
  selector: 'tsai-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()">
    @if (src()) {
      <img [src]="src()" [alt]="name()" class="size-full object-cover" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  </span>`,
})
export class Avatar {
  readonly name = input('');
  readonly src = input<string>();
  readonly size = input<AvatarSize>('md');

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  protected readonly classes = computed(
    () =>
      `inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 font-medium text-text-2 ${
        SIZES[this.size()]
      }`,
  );
}
