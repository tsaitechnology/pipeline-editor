import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  ArrowRight,
  Copy,
  Download,
  LucideAngularModule,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-angular';
import {
  email,
  type FieldTree,
  form,
  FormField,
  minLength,
  required,
  submit,
} from '@angular/forms/signals';
import {
  Accordion,
  AccordionItem,
  Actionbar,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  ChatInput,
  ChatMessage,
  Checkbox,
  Combobox,
  ComboboxOption,
  DateInput,
  DatePicker,
  Dialog,
  Drawer,
  Field,
  FormRow,
  GlowSurface,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Navbar,
  NumberInput,
  RadioGroup,
  RadioOption,
  Segmented,
  SegmentOption,
  Select,
  SelectOption,
  Sidebar,
  SidebarItem,
  Skeleton,
  Spinner,
  Switch,
  Tab,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
  ToastService,
  ToastVariant,
} from '@tsai-pe/ui-kit';

interface Section {
  id: string;
  label: string;
}

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Playground — a pure `@tsai-pe/ui-kit` component catalog, grouped by kind.
 * Intentionally free of any domain/business copy.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    FormField,
    Button,
    Spinner,
    Field,
    Input,
    NumberInput,
    DateInput,
    DatePicker,
    Textarea,
    Checkbox,
    Switch,
    RadioGroup,
    Select,
    Combobox,
    Segmented,
    Dialog,
    Drawer,
    Menu,
    MenuItem,
    MenuSeparator,
    MenuTrigger,
    Tooltip,
    FormRow,
    Tabs,
    Tab,
    Accordion,
    AccordionItem,
    Card,
    GlowSurface,
    Navbar,
    Sidebar,
    SidebarItem,
    Actionbar,
    ChatMessage,
    ChatInput,
    Alert,
    Badge,
    Tag,
    Avatar,
    Skeleton,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly toast = inject(ToastService);

  protected readonly title = 'ui-kit playground';
  protected readonly isLight = signal(false);

  protected readonly icons = {
    plus: Plus,
    arrowRight: ArrowRight,
    search: Search,
    trash: Trash2,
    settings: Settings,
    download: Download,
    copy: Copy,
  };

  protected readonly sections: Section[] = [
    { id: 'buttons', label: 'Buttons' },
    { id: 'inputs', label: 'Inputs' },
    { id: 'forms', label: 'Forms' },
    { id: 'blocks', label: 'Blocks' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'overlays', label: 'Overlays' },
    { id: 'layout', label: 'Layout' },
    { id: 'loaders', label: 'Loaders' },
  ];
  protected readonly active = signal('buttons');

  protected readonly selectOptions: SelectOption[] = [
    { value: 'angular', label: 'Angular' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
    { value: 'svelte', label: 'Svelte' },
    { value: 'solid', label: 'Solid (soon)', disabled: true },
  ];

  protected readonly tagOptions: SelectOption[] = [
    { value: 'design', label: 'Design' },
    { value: 'frontend', label: 'Frontend' },
    { value: 'backend', label: 'Backend' },
    { value: 'devops', label: 'DevOps' },
  ];

  protected readonly choiceOptions: RadioOption[] = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent (disabled)', disabled: true },
  ];

  protected readonly viewOptions: SegmentOption[] = [
    { value: 'list', label: 'List' },
    { value: 'grid', label: 'Grid' },
    { value: 'board', label: 'Board' },
  ];

  protected readonly comboOptions: ComboboxOption[] = [
    { value: 'angular', label: 'Angular' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
    { value: 'svelte', label: 'Svelte' },
    { value: 'solid', label: 'Solid' },
    { value: 'qwik', label: 'Qwik' },
    { value: 'preact', label: 'Preact' },
    { value: 'lit', label: 'Lit' },
  ];

  protected readonly text = signal('Hello world');
  protected readonly search = signal('');
  protected readonly amount = signal(8);
  protected readonly price = signal(1000.5);
  protected readonly date = signal('2026-01-15');
  protected readonly message = signal('');
  protected readonly code = signal(
    'function greet(name) {\n  return `Hello, ${name}!`;\n}',
  );
  protected readonly selectValue = signal<string[]>(['react']);
  protected readonly tagsValue = signal<string[]>(['design', 'frontend']);
  protected readonly choice = signal<string | undefined>('normal');
  protected readonly view = signal<string | undefined>('grid');
  protected readonly country = signal('');
  protected readonly calendarDate = signal('2026-01-15');

  // --- Signal forms demo ---
  protected readonly signupModel = signal({
    name: '',
    email: '',
    framework: '',
    agree: false,
  });
  protected readonly signupForm = form(this.signupModel, (p) => {
    required(p.name, { message: 'Name is required' });
    minLength(p.name, 2, { message: 'At least 2 characters' });
    required(p.email, { message: 'Email is required' });
    email(p.email, { message: 'Enter a valid email' });
    required(p.framework, { message: 'Pick a framework' });
  });
  protected readonly check1 = signal(true);
  protected readonly check2 = signal(false);
  protected readonly toggle = signal(true);
  protected readonly dialogOpen = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly tags = signal(['Design', 'Frontend', 'Backend']);

  protected readonly messages = signal<ChatEntry[]>([
    { role: 'assistant', text: 'Hi! How can I help you today?' },
    { role: 'user', text: 'Show me how a long message wraps in the bubble.' },
    {
      role: 'assistant',
      text: 'Of course. Bubbles are capped at ~85% width, wrap long words and preserve line breaks, so even a longer, multi-sentence reply stays readable and neatly aligned. The avatar stays pinned to the top, and the surface keeps its premium look on both light and dark themes.',
    },
  ]);

  constructor() {
    afterNextRender(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.active.set(entry.target.id);
          }
        },
        { rootMargin: '-15% 0px -75% 0px' },
      );
      for (const section of this.sections) {
        const el = document.getElementById(section.id);
        if (el) observer.observe(el);
      }
    });
  }

  protected toggleTheme(): void {
    const light = !this.isLight();
    this.isLight.set(light);
    document.documentElement.classList.toggle('light', light);
  }

  protected go(id: string): void {
    this.active.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  protected notify(variant: ToastVariant): void {
    this.toast.show({
      variant,
      title: variant[0].toUpperCase() + variant.slice(1),
      message: `This is a ${variant} toast notification.`,
    });
  }

  protected removeTag(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
  }

  /** First error message for a field, shown once it has been touched. */
  protected fieldError<T>(field: FieldTree<T>): string {
    const state = field();
    if (!state.touched() || state.valid()) return '';
    return state.errors()[0]?.message ?? 'Invalid value';
  }

  protected async submitSignup(): Promise<void> {
    const ok = await submit(this.signupForm, async () => {
      this.toast.show({
        variant: 'success',
        title: 'Account created',
        message: `Welcome, ${this.signupModel().name}!`,
      });
      return undefined;
    });
    if (!ok) {
      this.toast.show({
        variant: 'danger',
        title: 'Check the form',
        message: 'Some fields need your attention.',
      });
    }
  }

  protected onSend(text: string): void {
    this.messages.update((list) => [
      ...list,
      { role: 'user', text },
      { role: 'assistant', text: `You said: “${text}”.` },
    ]);
  }
}
