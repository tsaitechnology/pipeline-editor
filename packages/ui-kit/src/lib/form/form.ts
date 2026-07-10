import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * `tsai-form` — a `<form>` wrapper that renders an optional form-level error
 * banner and emits `submit`. Field-level errors live on `tsai-field`; this is
 * for cross-field / server errors and layout.
 *
 * Project actions into the `[form-actions]` slot to pin them at the bottom.
 */
@Component({
  selector: 'tsai-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form class="flex flex-col gap-6" (submit)="onSubmit($event)">
    @if (error()) {
      <div
        role="alert"
        class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
      >
        {{ error() }}
      </div>
    }
    <ng-content />
    <div class="empty:hidden flex flex-wrap items-center justify-end gap-2">
      <ng-content select="[form-actions]" />
    </div>
  </form>`,
})
export class Form {
  /** Form-level error message (cross-field / server). */
  readonly error = input<string>();
  readonly submitted = output<SubmitEvent>();

  protected onSubmit(event: SubmitEvent): void {
    event.preventDefault();
    this.submitted.emit(event);
  }
}
