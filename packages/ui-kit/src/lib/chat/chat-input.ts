import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';

/**
 * `tsai-chat-input` — composer for the AI assistant: an auto-sizing-ish textarea
 * plus a send button. Emits `send` with the trimmed text; Enter sends,
 * Shift+Enter inserts a newline.
 */
@Component({
  selector: 'tsai-chat-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="glass flex items-end gap-2 rounded-xl p-2 transition-colors focus-within:border-accent"
  >
    <textarea
      rows="1"
      [placeholder]="placeholder()"
      [value]="value()"
      class="max-h-40 min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-text-3 focus-visible:shadow-none"
      (input)="value.set($any($event.target).value)"
      (keydown.enter)="onEnter($event)"
    ></textarea>
    <button
      type="button"
      class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
      [disabled]="!value().trim()"
      (click)="send()"
      aria-label="Send"
    >
      ↑
    </button>
  </div>`,
})
export class ChatInput {
  readonly placeholder = input('Спросите AI-помощника…');
  readonly value = model('');
  readonly sent = output<string>();

  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.send();
  }

  protected send(): void {
    const text = this.value().trim();
    if (!text) return;
    this.sent.emit(text);
    this.value.set('');
  }
}
