import type {
  ActionCategory,
  BoardNode,
  Edge,
  NodePort,
  Pipeline,
  RunSnapshot,
} from '@tsai-pe/models';
import { TestBackendSystem } from './test-backend-system';

// ── node / pipeline builders ────────────────────────────────────────────────

function trigger(id: string): BoardNode {
  return {
    id,
    kind: 'trigger',
    title: id,
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 2 },
    ports: [{ id: 'out-right', role: 'output', side: 'right' }],
  };
}

function action(id: string, category: ActionCategory = 'transform'): BoardNode {
  return {
    id,
    kind: 'action',
    category,
    title: id,
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 2 },
    ports: [
      { id: 'in', role: 'input', side: 'left' },
      { id: 'out-right', role: 'output', side: 'right' },
    ],
  };
}

function ifNode(id: string): BoardNode {
  const ports: NodePort[] = [
    { id: 'in', role: 'input', side: 'left' },
    { id: 'true', role: 'output', side: 'right', label: 'true' },
    { id: 'false', role: 'output', side: 'right', label: 'false' },
  ];
  return {
    id,
    kind: 'action',
    category: 'control-flow',
    title: id,
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 3 },
    ports,
    config: { type: 'if', expression: '$json.count > 5' },
  };
}

function effect(id: string, required = true): BoardNode {
  return {
    id,
    kind: 'effect',
    required,
    title: id,
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 2 },
    ports: [{ id: 'in', role: 'input', side: 'left' }],
  };
}

function edge(from: string, to: string, fromPort = 'out-right'): Edge {
  return {
    id: `e-${from}.${fromPort}-${to}`,
    source: { nodeId: from, portId: fromPort },
    target: { nodeId: to, portId: 'in' },
  };
}

function pipeline(nodes: BoardNode[], edges: Edge[]): Pipeline {
  return { id: 'p', name: 'Test', nodes, edges };
}

/** Run a pipeline to completion, resolving the terminal snapshot. */
function runToEnd(sys: TestBackendSystem, p: Pipeline): Promise<RunSnapshot> {
  return new Promise((resolve) => {
    // observe() fires synchronously on subscribe; a run may already be terminal
    // (e.g. a cycle rejected in startRun), so unsub must be callable by then.
    let unsub: () => void = () => undefined;
    const runId = sys.startRun(p);
    unsub = sys.observe(runId, (snap) => {
      if (
        snap.status === 'success' ||
        snap.status === 'error' ||
        snap.status === 'canceled'
      ) {
        unsub();
        resolve(snap);
      }
    });
  });
}

const fast = () => new TestBackendSystem({ stepDelayMs: 0 });

// ── tests ───────────────────────────────────────────────────────────────────

describe('TestBackendSystem — happy path', () => {
  it('runs a linear pipeline to success with every node succeeded', async () => {
    const p = pipeline(
      [trigger('t'), action('a'), effect('e')],
      [edge('t', 'a'), edge('a', 'e')],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    expect(Object.values(snap.nodes).map((n) => n.status)).toEqual([
      'success',
      'success',
      'success',
    ]);
  });

  it('exposes each succeeded node output on the snapshot', async () => {
    const p = pipeline([trigger('t'), action('a')], [edge('t', 'a')]);
    const snap = await runToEnd(fast(), p);
    // trigger emits an illustrative { count, source } object
    expect(snap.nodes['t'].output).toMatchObject({ count: 10 });
    expect(snap.nodes['a'].output).toBeDefined();
  });

  it('plays multiple triggers sequentially in one run', async () => {
    const p = pipeline(
      [
        trigger('telegram'),
        trigger('slack'),
        action('handle'),
        effect('reply'),
      ],
      [
        edge('telegram', 'handle'),
        edge('slack', 'handle'),
        edge('handle', 'reply'),
      ],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['telegram'].status).toBe('success');
    expect(snap.nodes['slack'].status).toBe('success');
    expect(snap.nodes['handle'].status).toBe('success');
    expect(snap.nodes['reply'].status).toBe('success');
    expect(snap.log.map((entry) => entry.message)).toEqual(
      expect.arrayContaining([
        'Trigger 1/2: "telegram".',
        'Trigger 2/2: "slack".',
      ]),
    );
    expect(snap.passes?.map((pass) => pass.trigger?.id)).toEqual([
      'telegram',
      'slack',
    ]);
    expect(snap.passes?.[0]?.outputs['telegram']).toBeDefined();
    expect(snap.passes?.[1]?.outputs['slack']).toBeDefined();
  });

  it('can force a single trigger, preserving the previous one-event behavior', async () => {
    const p = pipeline(
      [trigger('telegram'), trigger('slack'), action('handle')],
      [edge('telegram', 'handle'), edge('slack', 'handle')],
    );
    const snap = await runToEnd(
      new TestBackendSystem({ stepDelayMs: 0, firingTrigger: 'telegram' }),
      p,
    );
    expect(snap.status).toBe('success');
    expect(snap.nodes['telegram'].status).toBe('success');
    expect(snap.nodes['slack'].status).toBe('skipped');
    expect(snap.nodes['handle'].status).toBe('success');
    expect(snap.log.some((entry) => /Trigger 1\/1/.test(entry.message))).toBe(
      true,
    );
  });

  it("emits a typed trigger's catalog message shape as its output", async () => {
    const tg: BoardNode = { ...trigger('tg'), type: 'telegram-trigger' };
    const snap = await runToEnd(fast(), pipeline([tg], []));
    expect(snap.nodes['tg'].output).toMatchObject({
      source: 'telegram',
      message: expect.any(String),
    });
  });

  it('replays interval triggers for maxTicks in the mock queue', async () => {
    const interval: BoardNode = {
      ...trigger('interval'),
      type: 'interval-trigger',
      data: { maxTicks: 3, intervalMs: 250 },
    };
    const snap = await runToEnd(fast(), pipeline([interval], []));
    expect(snap.nodes['interval'].output).toMatchObject({
      source: 'interval',
      tick: 3,
      intervalMs: 250,
    });
    expect(snap.log.map((entry) => entry.message)).toEqual(
      expect.arrayContaining([
        'Trigger 1/3: "interval".',
        'Trigger 2/3: "interval".',
        'Trigger 3/3: "interval".',
      ]),
    );
  });

  it('emits file, manual form and webhook trigger payloads from node data', async () => {
    const file: BoardNode = {
      ...trigger('file'),
      type: 'file-trigger',
      data: { sampleText: 'a,b\n1,2', mime: 'text/csv' },
    };
    const manual: BoardNode = {
      ...trigger('manual'),
      type: 'manual-form-trigger',
      data: { samplePayload: '{"priority":"high"}' },
    };
    const webhook: BoardNode = {
      ...trigger('webhook'),
      type: 'webhook-trigger',
      data: {
        method: 'PUT',
        path: '/tickets',
        headers: '{"x-demo":"1"}',
        body: '{"text":"hello"}',
      },
    };
    const snap = await runToEnd(fast(), pipeline([file, manual, webhook], []));
    expect(snap.nodes['file'].output).toMatchObject({
      source: 'file',
      file: { mime: 'text/csv', text: 'a,b\n1,2' },
    });
    expect(snap.nodes['manual'].output).toMatchObject({
      source: 'manual',
      form: { priority: 'high' },
    });
    expect(snap.nodes['webhook'].output).toMatchObject({
      source: 'webhook',
      method: 'PUT',
      path: '/tickets',
      headers: { 'x-demo': '1' },
      body: { text: 'hello' },
    });
  });

  it('fires the observer immediately with current state', () => {
    const sys = fast();
    const runId = sys.startRun(pipeline([trigger('t')], []));
    const seen: string[] = [];
    sys.observe(runId, (snap) => seen.push(snap.status));
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('TestBackendSystem — cycles', () => {
  it('refuses a non-DAG: errors the run and marks nodes error', async () => {
    const p = pipeline(
      [action('a'), action('b')],
      [edge('a', 'b'), edge('b', 'a')],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('error');
    expect(Object.values(snap.nodes).every((n) => n.status === 'error')).toBe(
      true,
    );
    expect(snap.log.some((l) => /cycle/i.test(l.message))).toBe(true);
  });
});

describe('TestBackendSystem — failures', () => {
  it('a failing node fails the whole run', async () => {
    const sys = new TestBackendSystem({
      stepDelayMs: 0,
      failNode: (n) => (n.id === 'a' ? 'boom' : undefined),
    });
    const p = pipeline(
      [trigger('t'), action('a'), effect('e')],
      [edge('t', 'a'), edge('a', 'e')],
    );
    const snap = await runToEnd(sys, p);
    expect(snap.status).toBe('error');
    expect(snap.nodes['a'].status).toBe('error');
    expect(snap.nodes['a'].error).toBe('boom');
    // downstream effect never ran
    expect(snap.nodes['e'].status).toBe('idle');
  });

  it('an optional effect failure does not fail the run', async () => {
    const sys = new TestBackendSystem({
      stepDelayMs: 0,
      failNode: (n) => (n.kind === 'effect' ? 'log unavailable' : undefined),
    });
    const p = pipeline(
      [trigger('t'), effect('log', false)],
      [edge('t', 'log')],
    );
    const snap = await runToEnd(sys, p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['log'].status).toBe('error');
  });

  it('supports node-configured mock failures', async () => {
    const bad: BoardNode = {
      ...action('bad'),
      data: { __mockFailure: 'Configured failure' },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), bad], [edge('t', 'bad')]),
    );

    expect(snap.status).toBe('error');
    expect(snap.nodes['bad'].error).toBe('Configured failure');
  });

  it('retries a configured failing node before failing the run', async () => {
    const bad: BoardNode = {
      ...action('bad'),
      data: {
        __mockFailure: 'Configured failure',
        __retryAttempts: 3,
        __retryBackoffMs: 0,
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), bad], [edge('t', 'bad')]),
    );

    expect(snap.status).toBe('error');
    expect(
      snap.log.filter((entry) => /retry/.test(entry.message)),
    ).toHaveLength(2);
    expect(snap.nodes['bad'].error).toBe('Configured failure');
  });

  it('can continue after a configured node failure', async () => {
    const bad: BoardNode = {
      ...action('bad'),
      data: { __mockFailure: 'soft fail', __continueOnError: true },
    };
    const done = effect('done');
    const snap = await runToEnd(
      fast(),
      pipeline(
        [trigger('t'), bad, done],
        [edge('t', 'bad'), edge('bad', 'done')],
      ),
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['bad'].status).toBe('error');
    expect(snap.nodes['done'].status).toBe('success');
  });

  it('uses a delay node as a timed pass-through transform', async () => {
    const wait: BoardNode = {
      ...action('wait'),
      type: 'delay',
      data: { duration: 0 },
    };
    const snap = await runToEnd(
      fast(),
      pipeline(
        [trigger('t'), wait, effect('done')],
        [edge('t', 'wait'), edge('wait', 'done')],
      ),
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['wait'].output).toMatchObject({
      count: 10,
      source: 'telegram',
    });
  });

  it('picks a JSON expression into a configured field', async () => {
    const pick: BoardNode = {
      ...action('pick'),
      type: 'json-query',
      data: {
        mode: 'pick',
        expression: '{{ $json.source }}',
        field: 'channel',
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), pick], [edge('t', 'pick')]),
    );

    expect(snap.nodes['pick'].output).toMatchObject({
      source: 'telegram',
      channel: 'telegram',
    });
  });

  it('replaces payload with a JSON expression result', async () => {
    const replace: BoardNode = {
      ...action('replace'),
      type: 'json-query',
      data: {
        mode: 'replace',
        expression: '{{ $json.source }}',
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), replace], [edge('t', 'replace')]),
    );

    expect(snap.nodes['replace'].output).toBe('telegram');
  });

  it('filters item arrays with a per-item expression', async () => {
    const split: BoardNode = { ...action('split', 'split'), type: 'split' };
    const filter: BoardNode = {
      ...action('filter'),
      type: 'json-query',
      data: {
        mode: 'filter-items',
        expression: '$json > 4',
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline(
        [trigger('t'), split, filter],
        [edge('t', 'split'), edge('split', 'filter')],
      ),
    );

    expect(snap.nodes['filter'].output).toMatchObject({
      items: [5, 6, 7, 8, 9],
    });
  });

  it('parses CSV into item objects with headers', async () => {
    const parse: BoardNode = {
      ...action('parse'),
      type: 'csv-parse',
      data: {
        csv: 'name,score\nAda,42\nLinus,7',
        delimiter: ',',
        headers: true,
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), parse], [edge('t', 'parse')]),
    );

    expect(snap.nodes['parse'].output).toMatchObject({
      items: [
        { name: 'Ada', score: '42' },
        { name: 'Linus', score: '7' },
      ],
    });
  });

  it('parses quoted CSV values', async () => {
    const parse: BoardNode = {
      ...action('parse'),
      type: 'csv-parse',
      data: {
        csv: 'name,note\n"Ada","hello, world"',
        delimiter: ',',
        headers: true,
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), parse], [edge('t', 'parse')]),
    );

    expect(snap.nodes['parse'].output).toMatchObject({
      items: [{ name: 'Ada', note: 'hello, world' }],
    });
  });

  it('renders markdown templates into html and text', async () => {
    const render: BoardNode = {
      ...action('render'),
      type: 'markdown-render',
      data: {
        markdown: '## {{ $json.source }}\n\n- **Ready**\n- `done`',
      },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), render], [edge('t', 'render')]),
    );

    expect(snap.nodes['render'].output).toMatchObject({
      markdown: '## telegram\n\n- **Ready**\n- `done`',
      html: '<h2>telegram</h2><ul><li><strong>Ready</strong></li><li><code>done</code></li></ul>',
      text: 'telegram\n\nReady\ndone',
    });
  });

  it('uses the mocked public API fetcher for public API request nodes', async () => {
    const api: BoardNode = {
      ...action('api', 'integration'),
      type: 'public-api-request',
      data: { preset: 'hacker-news', timeoutMs: 1200 },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), api], [edge('t', 'api')]),
    );
    expect(snap.nodes['api'].output).toMatchObject({
      status: 200,
      url: 'https://hacker-news.firebaseio.com/v0/item/8863.json',
      body: { title: 'My YC app: Dropbox' },
      timeoutMs: 1200,
    });
  });

  it('threads a configured LLM media plan through split, image generation and merge', async () => {
    const tg: BoardNode = {
      ...trigger('telegram'),
      type: 'telegram-trigger',
      data: {
        sampleOutput: {
          source: 'telegram',
          message: 'Draw 1 cat and 2 elephants',
          chatId: 4242,
        },
      },
    };
    const llm: BoardNode = {
      ...action('llm', 'integration'),
      type: 'llm-agent',
      title: 'Plan Telegram Media',
      data: {
        model: 'mock-llm',
        prompt: 'Plan: {{ $json.message }}',
        mockOutput: {
          count: 3,
          commands: [
            { subject: 'cat', prompt: 'Cat portrait' },
            { subject: 'elephant', prompt: 'Elephant safari 1' },
            { subject: 'elephant', prompt: 'Elephant safari 2' },
          ],
        },
      },
    };
    const split: BoardNode = {
      ...action('split', 'split'),
      type: 'split',
      data: { items: '{{ $json.commands }}' },
    };
    const image: BoardNode = {
      ...action('image', 'integration'),
      type: 'image-gen',
      title: 'Image Generator',
      data: { model: 'mock-image-v1', prompt: '{{ $json.prompt }}' },
    };
    const merge: BoardNode = {
      ...action('merge', 'merge'),
      type: 'merge',
      data: { expectedCount: '{{ $node["Plan Telegram Media"].count }}' },
    };
    const preview: BoardNode = {
      ...effect('preview'),
      type: 'image-preview',
      data: {
        title: 'Generated images',
        images: '{{ $json.batch }}',
        caption: '{{ $node["Plan Telegram Media"].count }} generated images',
      },
    };
    const sys = fast();
    let dialog:
      | {
          images?: { imageUrl: string; caption?: string }[];
          body?: string;
        }
      | undefined;
    sys.observeSideEffects((event) => {
      if (event.kind === 'dialog') dialog = event;
    });
    const snap = await runToEnd(
      sys,
      pipeline(
        [tg, llm, split, image, merge, preview],
        [
          edge('telegram', 'llm'),
          edge('llm', 'split'),
          edge('split', 'image'),
          edge('image', 'merge'),
          edge('merge', 'preview'),
        ],
      ),
    );

    expect(snap.nodes['llm'].output).toMatchObject({
      model: 'mock-llm',
      prompt: 'Plan: Draw 1 cat and 2 elephants',
      count: 3,
    });
    expect(snap.nodes['split'].progress).toBeUndefined();
    expect(snap.nodes['split'].buffer).toBeUndefined();
    expect(snap.nodes['image'].progress).toBeUndefined();
    expect(snap.nodes['image'].buffer).toBeUndefined();
    expect(snap.nodes['image'].output).toMatchObject({
      count: 3,
      images: [
        expect.objectContaining({ prompt: 'Cat portrait' }),
        expect.objectContaining({ prompt: 'Elephant safari 1' }),
        expect.objectContaining({ prompt: 'Elephant safari 2' }),
      ],
    });
    expect(
      (
        snap.nodes['image'].output as {
          images: { prompt: string }[];
        }
      ).images.map((img) => img.prompt),
    ).toEqual(['Cat portrait', 'Elephant safari 1', 'Elephant safari 2']);
    const imageOutput = snap.nodes['image'].output as {
      images: { imageUrl: string }[];
    };
    expect(
      (snap.nodes['image'].output as Record<string, unknown>)['imageUrl'],
    ).toBeUndefined();
    expect(imageOutput.images[0]?.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(
      Buffer.from(
        (imageOutput.images[0]?.imageUrl ?? '').split(',')[1] ?? '',
        'base64',
      ).subarray(0, 8),
    ).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(snap.nodes['merge'].output).toMatchObject({
      count: 3,
      batch: [
        expect.objectContaining({ prompt: 'Cat portrait' }),
        expect.objectContaining({ prompt: 'Elephant safari 1' }),
        expect.objectContaining({ prompt: 'Elephant safari 2' }),
      ],
    });
    expect(snap.nodes['merge'].buffer).toEqual({ done: 3, total: 3 });
    expect(dialog?.body).toBe('3 generated images');
    expect(dialog?.images).toHaveLength(3);
    expect(dialog?.images?.[0]).toMatchObject({
      caption: 'Cat portrait',
      imageUrl: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it('emits the preview gallery after a fan-out merge with multiple downstream effects', async () => {
    const tg: BoardNode = {
      ...trigger('telegram'),
      type: 'telegram-trigger',
      data: { sampleOutput: { message: 'Draw 2 cats' } },
    };
    const llm: BoardNode = {
      ...action('llm', 'integration'),
      type: 'llm-agent',
      title: 'Plan Telegram Media',
      data: {
        prompt: '{{ $json.message }}',
        mockOutput: {
          count: 2,
          commands: [{ prompt: 'Cat one' }, { prompt: 'Cat two' }],
        },
      },
    };
    const split: BoardNode = {
      ...action('split', 'split'),
      type: 'split',
      data: { items: '{{ $json.commands }}' },
    };
    const image: BoardNode = {
      ...action('image', 'integration'),
      type: 'image-gen',
      title: 'Image Generator',
      data: { prompt: '{{ $json.prompt }}' },
    };
    const merge: BoardNode = {
      ...action('merge', 'merge'),
      type: 'merge',
      data: { expectedCount: '{{ $node["Plan Telegram Media"].count }}' },
    };
    const send: BoardNode = {
      ...effect('send'),
      type: 'telegram-send',
      data: { chat: '1', text: 'done' },
    };
    const toast: BoardNode = {
      ...effect('toast', false),
      type: 'toast-effect',
      data: { message: 'done' },
    };
    const preview: BoardNode = {
      ...effect('preview', false),
      type: 'image-preview',
      data: { title: 'Generated images', images: '{{ $json.batch }}' },
    };
    const sys = fast();
    const dialogs: {
      images?: { imageUrl: string; caption?: string }[];
    }[] = [];
    let gallery:
      | {
          images?: { imageUrl: string; caption?: string }[];
        }
      | undefined;
    sys.observeSideEffects((event) => {
      if (event.kind === 'dialog') {
        dialogs.push(event);
        gallery = event;
      }
    });

    const snap = await runToEnd(
      sys,
      pipeline(
        [tg, llm, split, image, merge, send, toast, preview],
        [
          edge('telegram', 'llm'),
          edge('llm', 'split'),
          edge('split', 'image'),
          edge('image', 'merge'),
          edge('merge', 'send', 'out-top'),
          edge('merge', 'toast', 'out-bottom'),
          edge('merge', 'preview'),
        ],
      ),
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['preview'].status).toBe('success');
    expect(dialogs).toHaveLength(1);
    expect(gallery?.images).toHaveLength(2);
    expect(gallery?.images?.map((image) => image.caption)).toEqual([
      'Cat one',
      'Cat two',
    ]);
  });

  it('emits the image preview dialog in the multi-trigger demo shape', async () => {
    const tg: BoardNode = {
      ...trigger('tg'),
      type: 'telegram-trigger',
      title: 'Telegram',
      data: { sampleOutput: { message: 'Draw 2 cats', chatId: 42 } },
    };
    const wa: BoardNode = {
      ...trigger('wa'),
      type: 'whatsapp-trigger',
      title: 'WhatsApp',
    };
    const normTg: BoardNode = {
      ...action('norm-tg'),
      type: 'set-fields',
      data: { field: 'text', value: '{{ $json.message }}' },
    };
    const normWa: BoardNode = {
      ...action('norm-wa'),
      type: 'set-fields',
      data: { field: 'text', value: '{{ $json.chat.text }}' },
    };
    const sw: BoardNode = {
      ...action('switch', 'control-flow'),
      config: {
        type: 'switch',
        discriminant: '$trigger.channel',
        cases: [
          { id: 'tg', label: 'telegram', value: 'telegram' },
          { id: 'wa', label: 'whatsapp', value: 'whatsapp' },
        ],
        hasDefault: true,
      },
    };
    const llm: BoardNode = {
      ...action('llm', 'integration'),
      type: 'llm-agent',
      title: 'Plan Telegram Media',
      data: {
        mockOutput: {
          count: 2,
          commands: [{ prompt: 'Cat one' }, { prompt: 'Cat two' }],
        },
      },
    };
    const split: BoardNode = {
      ...action('split', 'split'),
      type: 'split',
      data: { items: '{{ $json.commands }}', mode: 'sequential' },
    };
    const image: BoardNode = {
      ...action('image', 'integration'),
      type: 'image-gen',
      data: { prompt: '{{ $json.prompt }}' },
    };
    const merge: BoardNode = {
      ...action('merge', 'merge'),
      type: 'merge',
      data: { expectedCount: '{{ $node["Plan Telegram Media"].count }}' },
    };
    const send: BoardNode = {
      ...effect('send'),
      type: 'telegram-send',
      data: { chat: '{{ $node["Telegram"].chatId }}', text: 'done' },
    };
    const preview: BoardNode = {
      ...effect('preview'),
      type: 'image-preview',
      data: {
        title: 'Generated images',
        images: '{{ $json.batch }}',
        caption: '{{ $node["Plan Telegram Media"].count }} generated images',
      },
    };
    const waFormat: BoardNode = {
      ...action('wa-format'),
      type: 'set-fields',
      data: { field: 'reply', value: 'ok' },
    };
    const waToast: BoardNode = {
      ...effect('wa-toast', false),
      type: 'toast-effect',
      data: { message: '{{ $json.reply }}' },
    };
    const sys = new TestBackendSystem({
      stepDelayMs: 0,
      firingTrigger: 'tg',
    });
    const dialogs: {
      images?: { imageUrl: string; caption?: string }[];
      body?: string;
    }[] = [];
    sys.observeSideEffects((event) => {
      if (event.kind === 'dialog') dialogs.push(event);
    });

    const snap = await runToEnd(
      sys,
      pipeline(
        [
          tg,
          wa,
          normTg,
          normWa,
          sw,
          llm,
          waFormat,
          split,
          image,
          merge,
          send,
          preview,
          waToast,
        ],
        [
          edge('tg', 'norm-tg'),
          edge('wa', 'norm-wa'),
          edge('norm-tg', 'switch'),
          edge('norm-wa', 'switch'),
          edge('switch', 'llm', 'case-tg'),
          edge('switch', 'wa-format', 'case-wa'),
          edge('llm', 'split'),
          edge('split', 'image'),
          edge('image', 'merge'),
          edge('merge', 'send', 'out-top'),
          edge('merge', 'preview'),
          edge('wa-format', 'wa-toast'),
        ],
      ),
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['preview'].status).toBe('success');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.body).toBe('2 generated images');
    expect(dialogs[0]?.images).toHaveLength(2);
  });

  it('loads browser-local AI demo models through the mock model loader', async () => {
    const classify: BoardNode = {
      ...action('classify', 'integration'),
      type: 'text-classification',
      data: { model: 'tiny-classifier', labels: '["billing","support"]' },
    };
    const snap = await runToEnd(
      new TestBackendSystem({
        stepDelayMs: 0,
        modelLoader: (id) => ({ id, loaded: true, backend: 'mock-wasm' }),
      }),
      pipeline([trigger('t'), classify], [edge('t', 'classify')]),
    );
    expect(snap.nodes['classify'].output).toMatchObject({
      model: { id: 'tiny-classifier', loaded: true, backend: 'mock-wasm' },
      label: 'support',
      confidence: 0.92,
    });
  });

  it('models throttle and debounce as configured pass-through transforms', async () => {
    const throttle: BoardNode = {
      ...action('throttle'),
      type: 'throttle',
      data: { windowMs: 250, key: '{{ $trigger.channel }}' },
    };
    const debounce: BoardNode = {
      ...action('debounce'),
      type: 'debounce',
      data: { windowMs: 500, key: '{{ $json.source }}' },
    };
    const snap = await runToEnd(
      fast(),
      pipeline(
        [trigger('t'), throttle, debounce],
        [edge('t', 'throttle'), edge('throttle', 'debounce')],
      ),
    );
    expect(snap.nodes['throttle'].output).toMatchObject({
      throttled: true,
      windowMs: 250,
      key: 't',
    });
    expect(snap.nodes['debounce'].output).toMatchObject({
      debounced: true,
      windowMs: 500,
      key: 'telegram',
    });
  });

  it('generates bounded repeat items without graph cycles', async () => {
    const repeat: BoardNode = {
      ...action('repeat'),
      type: 'repeat',
      data: { count: 3, item: '{{ $json.source }}' },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([trigger('t'), repeat], [edge('t', 'repeat')]),
    );
    expect(snap.nodes['repeat'].output).toMatchObject({
      count: 3,
      items: [
        { index: 0, value: 'telegram' },
        { index: 1, value: 'telegram' },
        { index: 2, value: 'telegram' },
      ],
    });
  });
});

describe('TestBackendSystem — control-flow branching', () => {
  it('runs only the taken branch and skips the other', async () => {
    const p = pipeline(
      [trigger('t'), ifNode('if'), action('yes'), action('no')],
      [edge('t', 'if'), edge('if', 'yes', 'true'), edge('if', 'no', 'false')],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['yes'].status).toBe('success');
    expect(snap.nodes['no'].status).toBe('skipped'); // not the taken branch
    expect(snap.log.some((l) => /not on the taken path/i.test(l.message))).toBe(
      true,
    );
  });
});

describe('TestBackendSystem — smart evaluation', () => {
  /** A switch node routing on `$json.source`, one output port per case. */
  function switchOnSource(
    id: string,
    cases: { id: string; value: string }[],
  ): BoardNode {
    return {
      id,
      kind: 'action',
      category: 'control-flow',
      title: id,
      pos: { col: 0, row: 0 },
      size: { cols: 4, rows: 3 },
      ports: [
        { id: 'in', role: 'input', side: 'left' },
        ...cases.map((c) => ({
          id: `case-${c.id}`,
          role: 'output' as const,
          side: 'right' as const,
        })),
      ],
      config: {
        type: 'switch',
        discriminant: '$json.source',
        cases: cases.map((c) => ({ id: c.id, label: c.id, value: c.value })),
        hasDefault: false,
      },
    };
  }

  it('routes a switch to the branch matching the evaluated discriminant', async () => {
    const tg: BoardNode = { ...trigger('tg'), type: 'telegram-trigger' };
    const norm: BoardNode = {
      ...action('norm'),
      type: 'set-fields',
      data: { field: 'message', value: '{{ $json.message }}' },
    };
    const sw = switchOnSource('sw', [
      { id: 'tg', value: 'telegram' },
      { id: 'sl', value: 'slack' },
    ]);
    const p = pipeline(
      [tg, norm, sw, effect('replyTg'), effect('replySl')],
      [
        edge('tg', 'norm'),
        edge('norm', 'sw'),
        edge('sw', 'replyTg', 'case-tg'),
        edge('sw', 'replySl', 'case-sl'),
      ],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    // source is 'telegram' → the telegram branch runs, the slack one is skipped
    expect(snap.nodes['replyTg'].status).toBe('success');
    expect(snap.nodes['replySl'].status).toBe('skipped');
    // the normalize step actually extracted the message from context
    expect(snap.nodes['norm'].output).toMatchObject({
      source: 'telegram',
      message: 'Hello from Telegram',
    });
  });

  it('routes two triggers wired straight into a switch by $json.source', async () => {
    // telegram + whatsapp → switch(discriminant $json.source) → per-channel effect
    const tg: BoardNode = { ...trigger('telegram'), type: 'telegram-trigger' };
    const wa: BoardNode = { ...trigger('whatsapp'), type: 'whatsapp-trigger' };
    const sw = switchOnSource('sw', [
      { id: 'tg', value: 'telegram' },
      { id: 'wa', value: 'whatsapp' },
    ]);
    const p = pipeline(
      [tg, wa, sw, effect('replyTg'), effect('replyWa')],
      [
        edge('telegram', 'sw'),
        edge('whatsapp', 'sw'),
        edge('sw', 'replyTg', 'case-tg'),
        edge('sw', 'replyWa', 'case-wa'),
      ],
    );
    const snap = await runToEnd(
      new TestBackendSystem({ stepDelayMs: 0, firingTrigger: 'telegram' }),
      p,
    );
    expect(snap.status).toBe('success');
    expect(snap.nodes['whatsapp'].status).toBe('skipped'); // forced out this run
    expect(snap.nodes['replyTg'].status).toBe('success');
    expect(snap.nodes['replyWa'].status).toBe('skipped');
  });

  it('routes the WhatsApp trigger to its case (not default) when it fires', async () => {
    const tg: BoardNode = { ...trigger('telegram'), type: 'telegram-trigger' };
    const wa: BoardNode = { ...trigger('whatsapp'), type: 'whatsapp-trigger' };
    const sw: BoardNode = {
      ...switchOnSource('sw', [
        { id: 'tg', value: 'telegram' },
        { id: 'wa', value: 'whatsapp' },
      ]),
      ports: [
        { id: 'in', role: 'input', side: 'left' },
        { id: 'case-tg', role: 'output', side: 'right' },
        { id: 'case-wa', role: 'output', side: 'right' },
        { id: 'default', role: 'output', side: 'right' },
      ],
      config: {
        type: 'switch',
        discriminant: '$json.source',
        cases: [
          { id: 'tg', label: 'telegram', value: 'telegram' },
          { id: 'wa', label: 'whatsapp', value: 'whatsapp' },
        ],
        hasDefault: true,
      },
    };
    const p = pipeline(
      [tg, wa, sw, effect('replyWa'), effect('fallback')],
      [
        edge('telegram', 'sw'),
        edge('whatsapp', 'sw'),
        edge('sw', 'replyWa', 'case-wa'),
        edge('sw', 'fallback', 'default'),
      ],
    );
    // Force the WhatsApp trigger to fire this run.
    const sys = new TestBackendSystem({
      stepDelayMs: 0,
      firingTrigger: 'whatsapp',
    });
    const snap = await runToEnd(sys, p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['replyWa'].status).toBe('success'); // matched whatsapp case
    expect(snap.nodes['fallback'].status).toBe('skipped'); // default not taken
  });

  it('routes by $trigger.channel independently from payload shape', async () => {
    const tg: BoardNode = { ...trigger('telegram'), type: 'telegram-trigger' };
    const wa: BoardNode = { ...trigger('whatsapp'), type: 'whatsapp-trigger' };
    const sw: BoardNode = {
      ...switchOnSource('sw', [
        { id: 'tg', value: 'telegram' },
        { id: 'wa', value: 'whatsapp' },
      ]),
      config: {
        type: 'switch',
        discriminant: '$trigger.channel',
        cases: [
          { id: 'tg', label: 'telegram', value: 'telegram' },
          { id: 'wa', label: 'whatsapp', value: 'whatsapp' },
        ],
        hasDefault: false,
      },
    };
    const p = pipeline(
      [tg, wa, sw, effect('replyTg'), effect('replyWa')],
      [
        edge('telegram', 'sw'),
        edge('whatsapp', 'sw'),
        edge('sw', 'replyTg', 'case-tg'),
        edge('sw', 'replyWa', 'case-wa'),
      ],
    );
    const snap = await runToEnd(
      new TestBackendSystem({ stepDelayMs: 0, firingTrigger: 'whatsapp' }),
      p,
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['replyTg'].status).toBe('skipped');
    expect(snap.nodes['replyWa'].status).toBe('success');
  });

  it('fails a node when an expression reads into a missing path (shape changed)', async () => {
    const wa: BoardNode = { ...trigger('wa'), type: 'whatsapp-trigger' };
    const bad: BoardNode = {
      ...action('bad'),
      type: 'set-fields',
      // whatsapp emits { source, chat: { text } } — there is no `.message`
      data: { field: 'x', value: '{{ $json.message.deep }}' },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([wa, bad], [edge('wa', 'bad')]),
    );
    expect(snap.status).toBe('error');
    expect(snap.nodes['bad'].status).toBe('error');
    expect(snap.nodes['bad'].error).toMatch(/Expression error/);
  });

  it('resolves an effect’s expression params so the run shows what it sent', async () => {
    const tg: BoardNode = { ...trigger('tg'), type: 'telegram-trigger' };
    const send: BoardNode = {
      ...effect('send'),
      type: 'telegram-send',
      data: { text: 'Echo: {{ $json.message }}' },
    };
    const snap = await runToEnd(
      fast(),
      pipeline([tg, send], [edge('tg', 'send')]),
    );
    expect(snap.status).toBe('success');
    expect(snap.nodes['send'].output).toMatchObject({
      text: 'Echo: Hello from Telegram',
    });
  });

  it('emits toast side effects from toast effect nodes', async () => {
    const tg: BoardNode = { ...trigger('tg'), type: 'telegram-trigger' };
    const toast: BoardNode = {
      ...effect('toast'),
      type: 'toast-effect',
      data: {
        title: 'Done',
        message: 'Echo: {{ $json.message }}',
        variant: 'success',
        duration: 123,
      },
    };
    const sys = fast();
    const events: unknown[] = [];
    sys.observeSideEffects((event) => events.push(event));

    await runToEnd(sys, pipeline([tg, toast], [edge('tg', 'toast')]));

    expect(events).toEqual([
      {
        kind: 'toast',
        runId: 'run-1',
        nodeId: 'toast',
        title: 'Done',
        message: 'Echo: Hello from Telegram',
        variant: 'success',
        duration: 123,
      },
    ]);
  });

  it('emits dialog side effects from dialog result nodes', async () => {
    const tg: BoardNode = { ...trigger('tg'), type: 'telegram-trigger' };
    const dialog: BoardNode = {
      ...effect('dialog'),
      type: 'dialog-result',
      data: {
        title: 'Payload',
        body: '{{ $json.message }}',
        json: '{{ $json }}',
      },
    };
    const sys = fast();
    const events: unknown[] = [];
    sys.observeSideEffects((event) => events.push(event));

    await runToEnd(sys, pipeline([tg, dialog], [edge('tg', 'dialog')]));

    expect(events).toEqual([
      {
        kind: 'dialog',
        runId: 'run-1',
        nodeId: 'dialog',
        title: 'Payload',
        body: 'Hello from Telegram',
        imageUrl: undefined,
        json: {
          source: 'telegram',
          message: 'Hello from Telegram',
          chatId: 4242,
        },
      },
    ]);
  });

  it('emits image preview effects as dialog side effects', async () => {
    const img: BoardNode = {
      ...effect('preview'),
      type: 'image-preview',
      data: {
        title: 'Preview',
        imageUrl: 'https://example.test/cat.png',
        caption: 'Generated image',
      },
    };
    const sys = fast();
    const events: unknown[] = [];
    sys.observeSideEffects((event) => events.push(event));

    await runToEnd(sys, pipeline([trigger('t'), img], [edge('t', 'preview')]));

    expect(events).toEqual([
      {
        kind: 'dialog',
        runId: 'run-1',
        nodeId: 'preview',
        title: 'Preview',
        body: 'Generated image',
        imageUrl: 'https://example.test/cat.png',
        images: [],
      },
    ]);
  });

  it('resolves image preview imageUrl and caption expressions from upstream output', async () => {
    const image: BoardNode = {
      ...action('image', 'integration'),
      type: 'image-gen',
      title: 'Image Generator',
      data: { prompt: '{{ $json.message }}' },
    };
    const preview: BoardNode = {
      ...effect('preview'),
      type: 'image-preview',
      title: 'Image Preview',
      data: {
        title: 'Generated preview',
        imageUrl: '{{ $node["Image Generator"].images[0].imageUrl }}',
        caption: 'Prompt: {{ $node["Image Generator"].prompt }}',
      },
    };
    const sys = fast();
    const events: {
      imageUrl?: string;
      body?: string;
    }[] = [];
    sys.observeSideEffects((event) => {
      if (event.kind === 'dialog') events.push(event);
    });

    const snap = await runToEnd(
      sys,
      pipeline(
        [{ ...trigger('tg'), type: 'telegram-trigger' }, image, preview],
        [edge('tg', 'image'), edge('image', 'preview')],
      ),
    );

    expect(snap.status).toBe('success');
    expect(snap.nodes['preview'].status).toBe('success');
    expect(snap.nodes['preview'].error).toBeUndefined();
    expect(events[0]).toMatchObject({
      body: 'Prompt: Hello from Telegram',
    });
    expect(events[0]?.imageUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('emits download side effects from download file nodes', async () => {
    const dl: BoardNode = {
      ...effect('download'),
      type: 'download-file',
      data: {
        fileName: 'result.json',
        content: '{{ $json }}',
        mimeType: 'application/json',
      },
    };
    const sys = fast();
    const events: unknown[] = [];
    sys.observeSideEffects((event) => events.push(event));

    await runToEnd(sys, pipeline([trigger('t'), dl], [edge('t', 'download')]));

    expect(events).toEqual([
      {
        kind: 'download',
        runId: 'run-1',
        nodeId: 'download',
        fileName: 'result.json',
        content: '{"count":10,"source":"telegram"}',
        mimeType: 'application/json',
      },
    ]);
  });
});

describe('TestBackendSystem — split/merge fan-out', () => {
  it('runs the node between split and merge once per item, then collapses', async () => {
    const p = pipeline(
      [
        trigger('t'),
        action('split', 'split'),
        action('work'),
        action('merge', 'merge'),
        effect('done'),
      ],
      [
        edge('t', 'split'),
        edge('split', 'work'),
        edge('work', 'merge'),
        edge('merge', 'done'),
      ],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    // trigger emits count:10 → split fans out ×10 internally, while only merge
    // exposes buffer fill as runtime UI state.
    expect(snap.nodes['split'].progress).toBeUndefined();
    expect(snap.nodes['work'].progress).toBeUndefined();
    expect(snap.nodes['work'].buffer).toBeUndefined();
    expect(snap.nodes['merge'].buffer).toEqual({ done: 10, total: 10 });
    // merge collapses the fan back to a single batch downstream
    expect(snap.log.some((l) => /fan-out ×10/i.test(l.message))).toBe(true);
    expect(
      snap.log.some((l) => /Merge buffer complete 10\/10/i.test(l.message)),
    ).toBe(true);
    expect(
      snap.log.some((l) => /Merge buffer filled 1\/10/i.test(l.message)),
    ).toBe(true);
  });
});

describe('TestBackendSystem — fan-out waves', () => {
  it('uses the aggregate fan-out path when split mode is parallel', async () => {
    const sys = new TestBackendSystem({ stepDelayMs: 0, tickProgressMs: 1 });
    const p = pipeline(
      [
        trigger('t'),
        {
          ...action('split', 'split'),
          type: 'split',
          data: { mode: 'parallel' },
        },
        {
          ...action('img', 'integration'),
          type: 'image-gen',
          data: { prompt: '{{ $json }}' },
        },
        action('merge', 'merge'),
      ],
      [edge('t', 'split'), edge('split', 'img'), edge('img', 'merge')],
    );
    const states: {
      splitStatus?: string;
      imgStatus?: string;
      imgProgress?: number;
      merge?: number;
      activeEdges?: string[];
    }[] = [];
    await new Promise<void>((resolve) => {
      let unsub: () => void = () => undefined;
      const id = sys.startRun(p);
      unsub = sys.observe(id, (s) => {
        states.push({
          splitStatus: s.nodes['split']?.status,
          imgStatus: s.nodes['img']?.status,
          imgProgress: s.nodes['img']?.progress?.done,
          merge: s.nodes['merge']?.buffer?.done,
          activeEdges: Object.keys(s.edges ?? {}),
        });
        if (s.status === 'success' || s.status === 'error') {
          unsub();
          resolve();
        }
      });
    });

    expect(states.some((s) => s.splitStatus === 'success')).toBe(true);
    expect(states.some((s) => s.imgStatus === 'running')).toBe(true);
    expect(states.every((s) => s.imgProgress === undefined)).toBe(true);
    expect(states.some((s) => s.merge === 1)).toBe(true);
    expect(
      states.some((s) => s.activeEdges?.includes('e-split.out-right-img')),
    ).toBe(true);
  });

  it('queues split items, then moves them through worker and merge one at a time', async () => {
    const sys = new TestBackendSystem({ stepDelayMs: 0, tickProgressMs: 1 });
    const p = pipeline(
      [
        trigger('t'),
        action('split', 'split'),
        {
          ...action('img', 'integration'),
          type: 'image-gen',
          data: { prompt: '{{ $json }}' },
        },
        action('merge', 'merge'),
        effect('done'),
      ],
      [
        edge('t', 'split'),
        edge('split', 'img'),
        edge('img', 'merge'),
        edge('merge', 'done'),
      ],
    );
    const states: {
      splitProgress?: number;
      imgProgress?: number;
      imgStatus?: string;
      merge?: number;
      activeEdges?: string[];
      doneStatus?: string;
    }[] = [];
    await new Promise<void>((resolve) => {
      let unsub: () => void = () => undefined;
      const id = sys.startRun(p);
      unsub = sys.observe(id, (s) => {
        states.push({
          splitProgress: s.nodes['split']?.progress?.done,
          imgProgress: s.nodes['img']?.progress?.done,
          imgStatus: s.nodes['img']?.status,
          merge: s.nodes['merge']?.buffer?.done,
          activeEdges: Object.keys(s.edges ?? {}),
          doneStatus: s.nodes['done']?.status,
        });
        if (s.status === 'success' || s.status === 'error') {
          unsub();
          resolve();
        }
      });
    });
    expect(states.every((s) => s.splitProgress === undefined)).toBe(true);
    expect(states.every((s) => s.imgProgress === undefined)).toBe(true);
    expect(states.some((s) => s.imgStatus === 'running')).toBe(true);
    expect(states.some((s) => s.merge === 0)).toBe(true);
    expect(states.some((s) => s.merge === 1)).toBe(true);
    expect(states.some((s) => s.merge === 2)).toBe(true);
    expect(states.some((s) => s.merge === 10)).toBe(true);
    expect(
      states.some((s) => s.activeEdges?.includes('e-split.out-right-img')),
    ).toBe(true);
    expect(
      states.some((s) => s.activeEdges?.includes('e-img.out-right-merge')),
    ).toBe(true);
    expect(
      states.some(
        (s) =>
          (s.merge ?? 0) > 0 && (s.merge ?? 0) < 10 && s.doneStatus === 'idle',
      ),
    ).toBe(true);
    expect(states.at(-1)?.doneStatus).toBe('success');
  });

  it('logs split, worker, then merge buffer events in execution order', async () => {
    const p = pipeline(
      [
        trigger('t'),
        action('split', 'split'),
        {
          ...action('img', 'integration'),
          type: 'image-gen',
          data: { prompt: '{{ $json }}' },
        },
        action('merge', 'merge'),
      ],
      [edge('t', 'split'), edge('split', 'img'), edge('img', 'merge')],
    );
    const snap = await runToEnd(fast(), p);
    const messages = snap.log.map((l) => l.message);
    const splitIndex = messages.findIndex((m) => /Split → fan-out ×10/.test(m));
    const workerIndex = messages.findIndex((m) => /Running "img"\./.test(m));
    const mergeIndex = messages.findIndex((m) => /Running "merge"\./.test(m));
    const bufferIndex = messages.findIndex((m) =>
      /Merge buffer filled 1\/10/.test(m),
    );

    expect(splitIndex).toBeGreaterThanOrEqual(0);
    expect(workerIndex).toBeGreaterThan(splitIndex);
    expect(mergeIndex).toBeGreaterThan(workerIndex);
    expect(bufferIndex).toBeGreaterThanOrEqual(mergeIndex);
  });
});

describe('TestBackendSystem — ticking buffers', () => {
  it('ticks merge buffer 1 → N when tickProgressMs is set', async () => {
    const sys = new TestBackendSystem({ stepDelayMs: 0, tickProgressMs: 1 });
    const p = pipeline(
      [
        trigger('t'),
        action('split', 'split'),
        action('work'),
        action('merge', 'merge'),
      ],
      [edge('t', 'split'), edge('split', 'work'), edge('work', 'merge')],
    );
    // Capture the merge buffer's done value at each emit (buffer is mutated in
    // place, so read the primitive synchronously rather than the object later).
    const doneSeq: number[] = [];
    await new Promise<void>((resolve) => {
      let unsub: () => void = () => undefined;
      const runId = sys.startRun(p);
      unsub = sys.observe(runId, (snap) => {
        const buffer = snap.nodes['merge']?.buffer;
        if (buffer) doneSeq.push(buffer.done);
        if (snap.status === 'success' || snap.status === 'error') {
          unsub();
          resolve();
        }
      });
    });
    expect(Math.max(...doneSeq)).toBe(10);
    expect(doneSeq.some((d) => d < 10)).toBe(true); // saw intermediate ticks
  });
});

describe('TestBackendSystem — lifecycle', () => {
  it('stop() cancels a pending run', () => {
    const sys = new TestBackendSystem({ stepDelayMs: 1000 });
    const runId = sys.startRun(
      pipeline([trigger('t'), action('a')], [edge('t', 'a')]),
    );
    sys.stop(runId);
    let status = '';
    sys.observe(runId, (snap) => (status = snap.status));
    expect(status).toBe('canceled');
  });

  it('observing an unknown run yields a terminal error snapshot', () => {
    const sys = fast();
    let snap: RunSnapshot | undefined;
    sys.observe('does-not-exist', (s) => (snap = s));
    expect(snap?.status).toBe('error');
    expect(snap?.nodes).toEqual({});
  });

  it('uses the injected clock for log timestamps', async () => {
    const sys = new TestBackendSystem({ stepDelayMs: 0, now: () => 42 });
    const snap = await runToEnd(sys, pipeline([trigger('t')], []));
    expect(snap.log.length).toBeGreaterThan(0);
    expect(snap.log.every((l) => l.at === 42)).toBe(true);
  });
});
