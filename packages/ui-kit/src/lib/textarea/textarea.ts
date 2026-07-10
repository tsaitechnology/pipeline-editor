import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

const CONTROL =
  'w-full resize-y rounded-sm border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-3 transition-colors outline-none focus-visible:border-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * `tsai-textarea` — multi-line text input over a native `<textarea>`.
 * Set `mono` for a code-friendly variant (monospace font, no spellcheck).
 */
@Component({
  selector: 'tsai-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea
    [placeholder]="placeholder()"
    [disabled]="disabled()"
    [rows]="rows()"
    [attr.aria-invalid]="invalid() || null"
    [attr.spellcheck]="mono() ? 'false' : null"
    [value]="value()"
    [class]="classes()"
    (input)="value.set($any($event.target).value)"
  ></textarea>`,
})
export class Textarea implements FormValueControl<string> {
  readonly placeholder = input('');
  readonly rows = input(3);
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Code-friendly monospace variant for pasting snippets. */
  readonly mono = input(false);
  readonly value = model('');

  protected readonly classes = computed(
    () =>
      `${CONTROL} ${this.invalid() ? 'border-danger' : 'border-border'} ${
        this.mono() ? 'font-mono text-[13px] leading-relaxed' : ''
      }`,
  );
}
