import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Check, Clipboard, LucideAngularModule } from 'lucide-angular';
import type { HighlighterCore } from 'shiki/core';

type CodeLanguage = 'bash' | 'css' | 'typescript';

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  bash: 'Shell',
  css: 'CSS',
  typescript: 'TypeScript',
};

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
    import('shiki/dist/langs/bash.mjs'),
    import('shiki/dist/langs/css.mjs'),
    import('shiki/dist/langs/typescript.mjs'),
    import('shiki/dist/themes/github-dark-default.mjs'),
    import('shiki/dist/themes/github-light-default.mjs'),
  ]).then(
    ([
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      bash,
      css,
      typescript,
      githubDark,
      githubLight,
    ]) =>
      createHighlighterCore({
        themes: [githubDark.default, githubLight.default],
        langs: [bash.default, css.default, typescript.default],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}

@Component({
  selector: 'app-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, LucideAngularModule],
  template: `
    <div class="code-frame">
      <div class="code-toolbar">
        <span>{{ label() }}</span>
        <button
          type="button"
          class="copy-button"
          [ngClass]="{ copied: copied() }"
          [attr.aria-label]="copied() ? 'Copied' : 'Copy code'"
          (click)="copy()"
        >
          <lucide-icon
            [img]="copied() ? Check : Clipboard"
            [size]="14"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="code-scroll" [innerHTML]="html()"></div>
    </div>
  `,
  styleUrl: './code-block.css',
})
export class CodeBlock {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly Check = Check;
  protected readonly Clipboard = Clipboard;

  readonly code = input.required<string>();
  readonly language = input.required<CodeLanguage>();

  protected readonly copied = signal(false);
  protected readonly highlighted = signal<SafeHtml>('');
  protected readonly label = computed(() => LANGUAGE_LABELS[this.language()]);
  protected readonly html = computed(() => this.highlighted());

  constructor() {
    effect(() => {
      const code = this.code();
      const language = this.language();
      void this.render(code, language);
    });
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(this.code());
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 1200);
  }

  private async render(code: string, language: CodeLanguage): Promise<void> {
    const highlighter = await getHighlighter();
    const html = highlighter.codeToHtml(code, {
      lang: language,
      themes: {
        dark: 'github-dark-default',
        light: 'github-light-default',
      },
      defaultColor: false,
    });

    this.highlighted.set(this.sanitizer.bypassSecurityTrustHtml(html));
  }
}
