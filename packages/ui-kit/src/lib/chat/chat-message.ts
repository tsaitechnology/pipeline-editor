import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type ChatRole = 'user' | 'assistant';

/**
 * `tsai-chat-message` — a single chat bubble for the AI-assistant surface.
 * Assistant messages read as quiet surfaces on the left; user messages use the
 * accent tint on the right.
 */
@Component({
  selector: 'tsai-chat-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="rowClasses()">
    <div
      class="grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
      [class]="avatarClasses()"
      aria-hidden="true"
    >
      {{ role() === 'assistant' ? 'AI' : 'You' }}
    </div>
    <div [class]="bubbleClasses()">
      <ng-content />
    </div>
  </div>`,
})
export class ChatMessage {
  readonly role = input<ChatRole>('assistant');

  protected readonly rowClasses = computed(
    () =>
      `flex items-start gap-2.5 ${
        this.role() === 'user' ? 'flex-row-reverse' : ''
      }`,
  );

  protected readonly avatarClasses = computed(() =>
    this.role() === 'user'
      ? 'bg-accent-quiet text-accent'
      : 'bg-surface-2 text-text-2',
  );

  protected readonly bubbleClasses = computed(
    () =>
      `max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
        this.role() === 'user'
          ? 'bg-accent-quiet text-text'
          : 'border border-border bg-surface-2 text-text'
      }`,
  );
}
