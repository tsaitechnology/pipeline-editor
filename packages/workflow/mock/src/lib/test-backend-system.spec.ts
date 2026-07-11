import type {
  ActionCategory,
  BoardNode,
  Edge,
  NodePort,
  Pipeline,
  RunSnapshot,
} from '@tsai-pe/shared/models';
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
    config: { type: 'if', expression: 'x > 0' },
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
function runToEnd(
  sys: TestBackendSystem,
  p: Pipeline,
): Promise<RunSnapshot> {
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

  it('runs a node fed by multiple triggers (fan-in / converging entry points)', async () => {
    const p = pipeline(
      [trigger('telegram'), trigger('slack'), action('handle'), effect('reply')],
      [edge('telegram', 'handle'), edge('slack', 'handle'), edge('handle', 'reply')],
    );
    const snap = await runToEnd(fast(), p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['telegram'].status).toBe('success');
    expect(snap.nodes['slack'].status).toBe('success');
    expect(snap.nodes['handle'].status).toBe('success');
    expect(snap.nodes['reply'].status).toBe('success');
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
    expect(Object.values(snap.nodes).every((n) => n.status === 'error')).toBe(true);
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
    const p = pipeline([trigger('t'), effect('log', false)], [edge('t', 'log')]);
    const snap = await runToEnd(sys, p);
    expect(snap.status).toBe('success');
    expect(snap.nodes['log'].status).toBe('error');
  });
});

describe('TestBackendSystem — control-flow branching', () => {
  it('runs only the taken branch and skips the other', async () => {
    const p = pipeline(
      [trigger('t'), ifNode('if'), action('yes'), action('no')],
      [
        edge('t', 'if'),
        edge('if', 'yes', 'true'),
        edge('if', 'no', 'false'),
      ],
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
    // trigger emits count:10 → split fans out ×10 → work runs 10×
    expect(snap.nodes['work'].progress).toEqual({ done: 10, total: 10 });
    // merge collapses the fan back to a single batch downstream
    expect(snap.log.some((l) => /fan-out ×10/i.test(l.message))).toBe(true);
    expect(snap.log.some((l) => /Merge buffered 10\/10/i.test(l.message))).toBe(
      true,
    );
  });
});

describe('TestBackendSystem — ticking progress', () => {
  it('ticks fan-out progress 1 → N when tickProgressMs is set', async () => {
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
    // Capture the "work" node's done value at each emit (progress is mutated in
    // place, so read the primitive synchronously rather than the object later).
    const doneSeq: number[] = [];
    await new Promise<void>((resolve) => {
      let unsub: () => void = () => undefined;
      const runId = sys.startRun(p);
      unsub = sys.observe(runId, (snap) => {
        const pg = snap.nodes['work']?.progress;
        if (pg) doneSeq.push(pg.done);
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
    const runId = sys.startRun(pipeline([trigger('t'), action('a')], [edge('t', 'a')]));
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
