import {
  type BoardNode,
  type Edge,
  type NodeRun,
  type NodeStatus,
  type Pipeline,
  type PipelineBackend,
  type RunListener,
  type RunLogEntry,
  type RunPassSnapshot,
  type RunSnapshot,
  type RunStatus,
  type TriggerContext,
  type Unsubscribe,
} from '@tsai-pe/models';
import {
  controlFlowOutputs,
  isControlFlow,
  type NodeCatalog,
  STATIC_NODE_CATALOG,
} from '@tsai-pe/nodes';
import {
  coerceExpression,
  type EvalContext,
  looseEquals,
  resolveTemplate,
  truthy,
  tryEvaluate,
} from './expression';

/** Sentinel branch id that matches no port — routes nowhere (skips downstream). */
const BRANCH_NONE = '__none__';

/** Internal, mutable bookkeeping for one in-flight (or finished) run. */
interface RunState {
  runId: string;
  status: RunStatus;
  nodes: Record<string, NodeRun>;
  log: RunLogEntry[];
  listeners: Set<RunListener>;
  /** Pending timers so a `stop()` can cancel the simulation. */
  timers: ReturnType<typeof setTimeout>[];
  canceled: boolean;
  /** Illustrative output each node produced (threaded downstream). */
  outputs: Record<string, unknown>;
  /** For control-flow nodes: the output port id the branch resolved to. */
  selected: Record<string, string>;
  /**
   * Which trigger is currently playing. A run may process several triggers
   * sequentially; this is the active queue item.
   */
  firingTriggerId?: string;
  /** Ordered trigger queue for this run. Empty means a triggerless one-pass run. */
  triggerIds: string[];
  /** Current index in `triggerIds`, or 0 for a triggerless one-pass run. */
  triggerIndex: number;
  /**
   * Fan-out factor a node *emits* downstream: split multiplies it by the item
   * count, merge collapses it back to 1, everything else passes it through. A
   * node executes `inFan` times (its upstream's emitted fan).
   */
  outFan: Record<string, number>;
  /** Per-item payloads currently flowing through split/merge fan-out segments. */
  fanItems: Record<string, unknown[]>;
  /** Runtime trigger metadata available to expressions as `$trigger`. */
  trigger?: TriggerContext;
  /** Immutable-ish outputs captured by trigger pass for inspection. */
  passes: RunPassSnapshot[];
  /** Attempt counter by node id within the current trigger pass. */
  attempts: Record<string, number>;
}

export type MockSideEffect =
  | {
      kind: 'toast';
      runId: string;
      nodeId: string;
      title?: string;
      message: string;
      variant: 'info' | 'success' | 'warning' | 'danger';
      duration?: number;
    }
  | {
      kind: 'dialog';
      runId: string;
      nodeId: string;
      title?: string;
      body?: string;
      imageUrl?: string;
      images?: { imageUrl: string; caption?: string }[];
      json?: unknown;
    }
  | {
      kind: 'download';
      runId: string;
      nodeId: string;
      fileName: string;
      content: string;
      mimeType: string;
    }
  | {
      kind: 'clipboard';
      runId: string;
      nodeId: string;
      text: string;
    };

export type MockSideEffectListener = (event: MockSideEffect) => void;

export interface MockPublicApiRequest {
  preset: string;
  url: string;
  timeoutMs: number;
}

export type MockPublicApiFetcher = (
  request: MockPublicApiRequest,
) => Record<string, unknown>;

export interface MockModelLoad {
  id: string;
  loaded: boolean;
  backend: 'mock-wasm';
}

export type MockModelLoader = (modelId: string) => MockModelLoad;

/** Tuning knobs for the simulation, so tests/demos can run fast or slow. */
export interface TestBackendOptions {
  /** Simulated wall-clock time each node "takes" to run, in ms. */
  stepDelayMs?: number;
  /**
   * Deterministic failure hook. Return an error message to make a node fail,
   * or `undefined`/`false` to let it succeed. Defaults to never failing.
   */
  failNode?: (
    node: BoardNode,
    pipeline: Pipeline,
  ) => string | undefined | false;
  /** Clock injection (defaults to `Date.now`), handy for deterministic tests. */
  now?: () => number;
  /**
   * If set (> 0), fan-out progress ticks 1 → N spaced by this many ms instead of
   * jumping straight to n/n. Off by default (instant).
   */
  tickProgressMs?: number;
  /**
   * Force exactly one trigger to fire. By id, or a picker given the trigger
   * nodes + run index. When omitted, a run plays all triggers sequentially.
   */
  firingTrigger?:
    string | ((triggers: BoardNode[], runIndex: number) => string);
  /** Node catalog used for sample trigger outputs and effect param resolution. */
  catalog?: NodeCatalog;
  /** Mocked public API fetcher. Defaults to canned browser-safe demo payloads. */
  publicApiFetcher?: MockPublicApiFetcher;
  /** Mock lazy model loader for browser-local AI demo nodes. */
  modelLoader?: MockModelLoader;
}

/**
 * Framework-free, in-browser mock of the "system" that runs pipelines. It
 * implements the {@link PipelineBackend} port so the editor can be developed and
 * demoed with no real backend: submit a {@link Pipeline}, and it walks the graph
 * in topological order, pushing {@link RunSnapshot}s to observers as each node
 * transitions idle → running → success/error.
 *
 * Everything is scheduled with `setTimeout`, so it is cooperative and cancelable
 * (`stop`) without blocking the main thread.
 */
export class TestBackendSystem implements PipelineBackend {
  private readonly runs = new Map<string, RunState>();
  private readonly sideEffectListeners = new Set<MockSideEffectListener>();
  private seq = 0;

  private readonly stepDelayMs: number;
  private readonly failNode: (
    node: BoardNode,
    pipeline: Pipeline,
  ) => string | undefined | false;
  private readonly now: () => number;
  private readonly tickProgressMs: number;
  private readonly firingTrigger:
    string | ((triggers: BoardNode[], runIndex: number) => string) | undefined;
  private readonly catalog: NodeCatalog;
  private readonly publicApiFetcher: MockPublicApiFetcher;
  private readonly modelLoader: MockModelLoader;

  constructor(options: TestBackendOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 400;
    this.failNode = options.failNode ?? (() => undefined);
    this.now = options.now ?? (() => Date.now());
    this.tickProgressMs = options.tickProgressMs ?? 0;
    this.firingTrigger = options.firingTrigger;
    this.catalog = options.catalog ?? STATIC_NODE_CATALOG;
    this.publicApiFetcher = options.publicApiFetcher ?? cannedPublicApi;
    this.modelLoader = options.modelLoader ?? cannedModelLoad;
  }

  /** Build the trigger queue for this run (see {@link TestBackendOptions.firingTrigger}). */
  private triggerQueue(pipeline: Pipeline, runIndex: number): string[] {
    const triggers = pipeline.nodes.filter((n) => n.kind === 'trigger');
    if (!triggers.length) return [];
    if (typeof this.firingTrigger === 'string') return [this.firingTrigger];
    if (typeof this.firingTrigger === 'function') {
      return [this.firingTrigger(triggers, runIndex)];
    }
    return triggers.flatMap((trigger) =>
      Array.from({ length: this.triggerPassCount(trigger) }, () => trigger.id),
    );
  }

  private triggerPassCount(trigger: BoardNode): number {
    if (trigger.type === 'interval-trigger') {
      return clampInt(trigger.data?.['maxTicks'], 3, 1, 20);
    }
    if (trigger.type === 'schedule-trigger') {
      return clampInt(trigger.data?.['demoTicks'], 1, 1, 10);
    }
    return 1;
  }

  startRun(pipeline: Pipeline): string {
    const runId = `run-${++this.seq}`;
    const nodes: Record<string, NodeRun> = {};
    for (const node of pipeline.nodes) {
      nodes[node.id] = { nodeId: node.id, status: 'idle' };
    }

    const run: RunState = {
      runId,
      status: 'pending',
      nodes,
      log: [],
      listeners: new Set(),
      timers: [],
      canceled: false,
      outputs: {},
      selected: {},
      outFan: {},
      fanItems: {},
      trigger: undefined,
      triggerIds: this.triggerQueue(pipeline, this.seq - 1),
      triggerIndex: 0,
      passes: [],
      attempts: {},
    };
    this.runs.set(runId, run);

    this.log(run, `Run ${runId} accepted for "${pipeline.name}".`);

    const order = this.topoOrder(pipeline);
    if (order === null) {
      this.setNodesTo(run, pipeline.nodes, 'error');
      this.log(
        run,
        'Pipeline contains a cycle; refusing to run (expected a DAG).',
      );
      this.finish(run, 'error');
      return runId;
    }

    // Kick off the simulation on the next tick so callers can `observe` first
    // and still receive the whole lifecycle.
    this.schedule(run, 0, () => {
      run.status = 'running';
      this.log(run, 'Run started.');
      this.emit(run);
      this.startTriggerPass(run, pipeline, order, 0);
    });

    return runId;
  }

  observe(runId: string, listener: RunListener): Unsubscribe {
    const run = this.runs.get(runId);
    if (!run) {
      // Unknown run: report a terminal, empty snapshot once, then no-op.
      listener({ runId, status: 'error', nodes: {}, log: [] });
      return () => undefined;
    }
    run.listeners.add(listener);
    // Fire immediately with current state, per the port contract.
    listener(this.snapshot(run));
    return () => {
      run.listeners.delete(listener);
    };
  }

  stop(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || this.isTerminal(run.status)) return;

    run.canceled = true;
    for (const timer of run.timers) clearTimeout(timer);
    run.timers = [];

    for (const nodeRun of Object.values(run.nodes)) {
      if (nodeRun.status === 'running') nodeRun.status = 'idle';
    }
    this.log(run, 'Run cancellation requested.');
    this.finish(run, 'canceled');
  }

  observeSideEffects(listener: MockSideEffectListener): Unsubscribe {
    this.sideEffectListeners.add(listener);
    return () => {
      this.sideEffectListeners.delete(listener);
    };
  }

  // --- simulation -----------------------------------------------------------

  private startTriggerPass(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    triggerIndex: number,
  ): void {
    if (run.canceled) return;
    run.triggerIndex = triggerIndex;
    run.firingTriggerId = run.triggerIds[triggerIndex];
    run.trigger = this.triggerContext(pipeline, run.firingTriggerId);
    this.resetPassState(run, pipeline);

    const total = run.triggerIds.length;
    const firing = pipeline.nodes.find((n) => n.id === run.firingTriggerId);
    if (firing) {
      this.log(
        run,
        `Trigger ${triggerIndex + 1}/${total}: "${firing.title}".`,
        firing.id,
      );
    }
    this.emit(run);
    this.runNextNode(run, pipeline, order, 0);
  }

  private resetPassState(run: RunState, pipeline: Pipeline): void {
    run.outputs = {};
    run.selected = {};
    run.outFan = {};
    run.fanItems = {};
    run.attempts = {};
    run.trigger = this.triggerContext(pipeline, run.firingTriggerId);
    for (const node of pipeline.nodes) {
      if (node.kind === 'trigger' && node.id !== run.firingTriggerId) continue;
      const nodeRun = run.nodes[node.id];
      nodeRun.status = 'idle';
      delete nodeRun.error;
      delete nodeRun.progress;
      delete nodeRun.output;
    }
  }

  private runNextNode(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    index: number,
  ): void {
    if (run.canceled) return;

    if (index >= order.length) {
      const nextTrigger = run.triggerIndex + 1;
      if (nextTrigger < run.triggerIds.length) {
        this.startTriggerPass(run, pipeline, order, nextTrigger);
        return;
      }
      this.finish(run, 'success');
      return;
    }

    const node = order[index];
    const nodeRun = run.nodes[node.id];

    // Run a node only if it is a root, or an upstream node succeeded along a
    // *taken* branch (control-flow routes only through its selected output).
    if (!this.isReachable(run, pipeline, node)) {
      if (!(node.kind === 'trigger' && nodeRun.status === 'success')) {
        nodeRun.status = 'skipped';
        this.log(
          run,
          `"${node.title}" not on the taken path — skipped.`,
          node.id,
        );
        this.emit(run);
      }
      this.runNextNode(run, pipeline, order, index + 1);
      return;
    }

    nodeRun.status = 'running';
    this.log(run, `Running "${node.title}".`, node.id);
    this.emit(run);

    this.schedule(run, this.nodeDelayMs(node), () => {
      const failure = this.nodeFailure(node, pipeline);
      if (failure) {
        this.failNodeRun(
          run,
          pipeline,
          order,
          index,
          node,
          nodeRun,
          String(failure),
        );
        return;
      }

      // Evaluate the node's expressions for real. A bad reference (the upstream
      // shape changed) throws → the node fails, like any other failure.
      try {
        const ctx = this.evalContext(run, pipeline, node);
        if (isControlFlow(node)) this.resolveBranch(run, node, ctx);
        const output = this.produceOutput(run, pipeline, node, nodeRun, ctx);

        // Fan-in nodes actually process their items as waves: stay `running`
        // while the counter climbs 1 → N (each wave = one item through the
        // segment), reaching `success` only when all N are in. `split` is the
        // fan *source* — it emits ×N in a single pass, so it doesn't iterate.
        const pg = nodeRun.progress;
        if (
          this.tickProgressMs > 0 &&
          node.category !== 'split' &&
          pg &&
          pg.total > 1
        ) {
          pg.done = 1;
          this.emit(run); // running, 1/N
          this.runWaves(run, pipeline, order, index, nodeRun, output);
          return;
        }

        this.succeed(run, pipeline, order, index, nodeRun, output);
      } catch (err) {
        this.failNodeRun(
          run,
          pipeline,
          order,
          index,
          node,
          nodeRun,
          `Expression error: ${errorMessage(err)}`,
        );
        return;
      }
    });
  }

  private failNodeRun(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    index: number,
    node: BoardNode,
    nodeRun: NodeRun,
    message: string,
  ): void {
    const attempts = clampInt(node.data?.['__retryAttempts'], 1, 1, 10);
    const current = (run.attempts[node.id] ?? 0) + 1;
    run.attempts[node.id] = current;
    if (current < attempts) {
      nodeRun.status = 'running';
      nodeRun.error = `Attempt ${current}/${attempts} failed: ${message}`;
      this.log(
        run,
        `Node "${node.title}" retry ${current + 1}/${attempts}: ${message}`,
        node.id,
      );
      this.emit(run);
      this.schedule(
        run,
        clampInt(node.data?.['__retryBackoffMs'], 0, 0, 60_000),
        () => this.runNextNode(run, pipeline, order, index),
      );
      return;
    }

    nodeRun.status = 'error';
    nodeRun.error = message;
    this.log(run, `Node "${node.title}" failed: ${nodeRun.error}`, node.id);
    const continueOnError = node.data?.['__continueOnError'] === true;
    const fatal =
      !continueOnError && !(node.kind === 'effect' && node.required === false);
    if (fatal) {
      this.emit(run);
      this.finish(run, 'error');
      return;
    }
    const output = { error: message, continued: true };
    run.outputs[node.id] = output;
    nodeRun.output = output;
    this.recordPassOutput(run, node.id, output);
    this.log(run, `(configured to continue)`, node.id);
    this.emit(run);
    this.runNextNode(run, pipeline, order, index + 1);
  }

  /** Advance one wave at a time (still `running`), then succeed at N/N. */
  private runWaves(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    index: number,
    nodeRun: NodeRun,
    output: unknown,
  ): void {
    if (run.canceled) return;
    const pg = nodeRun.progress;
    if (pg && pg.done < pg.total) {
      this.schedule(run, this.tickProgressMs, () => {
        pg.done = Math.min(pg.total, pg.done + 1);
        this.emit(run); // still running, done/total
        this.runWaves(run, pipeline, order, index, nodeRun, output);
      });
      return;
    }
    this.succeed(run, pipeline, order, index, nodeRun, output);
  }

  /** Commit a node's success + output, then run the next node. */
  private succeed(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    index: number,
    nodeRun: NodeRun,
    output: unknown,
  ): void {
    nodeRun.status = 'success';
    run.outputs[nodeRun.nodeId] = output;
    this.recordPassOutput(run, nodeRun.nodeId, output);
    // Expose the produced output on the snapshot so the editor can show it (Run
    // data) and derive downstream expression variable paths from it.
    nodeRun.output = output;
    this.emitSideEffect(run, order[index], output);
    this.emit(run);
    this.runNextNode(run, pipeline, order, index + 1);
  }

  private recordPassOutput(
    run: RunState,
    nodeId: string,
    output: unknown,
  ): void {
    const existing = run.passes.find(
      (pass) => pass.triggerIndex === run.triggerIndex,
    );
    const pass =
      existing ??
      ({
        trigger: run.trigger ? { ...run.trigger } : undefined,
        triggerIndex: run.triggerIndex,
        outputs: {},
      } satisfies RunPassSnapshot);
    pass.outputs = { ...pass.outputs, [nodeId]: output };
    if (!existing) run.passes.push(pass);
  }

  /** Whether a node should run given upstream success and taken branches. */
  private isReachable(
    run: RunState,
    pipeline: Pipeline,
    node: BoardNode,
  ): boolean {
    const incoming = pipeline.edges.filter((e) => e.target.nodeId === node.id);
    if (!incoming.length) {
      // A root: triggers fire only if they're the firing one this run.
      if (node.kind === 'trigger' && run.firingTriggerId !== undefined) {
        return node.id === run.firingTriggerId;
      }
      return true;
    }
    // Fan-in / OR: run if any incoming edge is active (source succeeded on a
    // taken branch).
    return incoming.some((e) => this.edgeActive(run, e));
  }

  /** Whether an edge is "live": its source succeeded on a taken branch. */
  private edgeActive(run: RunState, edge: Edge): boolean {
    const output = run.outputs[edge.source.nodeId];
    const status = run.nodes[edge.source.nodeId]?.status;
    const continued =
      output &&
      typeof output === 'object' &&
      (output as Record<string, unknown>)['continued'] === true;
    if (status !== 'success' && !(status === 'error' && continued))
      return false;
    if (!(edge.source.nodeId in run.outputs)) return false;
    const selected = run.selected[edge.source.nodeId];
    // Non-branching source: always taken. Branching: only the selected port.
    return selected === undefined || edge.source.portId === selected;
  }

  /**
   * Evaluate a control-flow node's condition against context and pick the branch
   * it actually routes to (may throw on a bad reference → the node fails).
   */
  private resolveBranch(
    run: RunState,
    node: BoardNode,
    ctx: EvalContext,
  ): void {
    if (!isControlFlow(node) || !node.config) return;
    const config = node.config;
    let portId: string;
    if (config.type === 'if') {
      portId = truthy(coerceExpression(config.expression, ctx))
        ? 'true'
        : 'false';
    } else if (config.type === 'filter') {
      portId = truthy(coerceExpression(config.expression, ctx))
        ? 'pass'
        : BRANCH_NONE;
    } else {
      const discriminant = coerceExpression(config.discriminant, ctx);
      const hit = config.cases.find((c) =>
        looseEquals(discriminant, caseValue(c.value, ctx)),
      );
      portId = hit
        ? `case-${hit.id}`
        : config.hasDefault
          ? 'default'
          : BRANCH_NONE;
    }
    run.selected[node.id] = portId;
    const label =
      portId === BRANCH_NONE
        ? 'no branch'
        : (controlFlowOutputs(config).find((o) => o.id === portId)?.label ??
          portId);
    this.log(run, `"${node.title}" → ${label}`, node.id);
  }

  /**
   * Illustrative output for a node, threading item counts and the fan-out factor
   * through split → merge:
   * - split emits fan ×count (each item flows on separately);
   * - nodes between split and merge run `fan` times (progress n/n, "×N" in log);
   * - merge buffers the fan back into one batch (fan → 1), so everything
   *   downstream runs once.
   */
  private produceOutput(
    run: RunState,
    pipeline: Pipeline,
    node: BoardNode,
    nodeRun: NodeRun,
    ctx: EvalContext,
  ): unknown {
    const upstream = pipeline.edges
      .filter((e) => e.target.nodeId === node.id)
      .map((e) => run.outputs[e.source.nodeId]);
    const count = this.countFrom(upstream, node);
    const inFan = this.inFanOf(run, pipeline, node);
    const fanItems = this.inputFanItems(run, pipeline, node);

    if (node.kind === 'trigger') {
      run.outFan[node.id] = 1;
      return this.triggerOutput(node, run);
    }

    if (node.category === 'split') {
      const items = this.splitItems(node, ctx, count);
      run.outFan[node.id] = inFan * items.length;
      run.fanItems[node.id] = items;
      nodeRun.progress = { done: items.length, total: items.length };
      this.log(run, `Split → fan-out ×${items.length}`, node.id);
      return { items, count: items.length };
    }
    if (node.category === 'merge') {
      const total = this.mergeExpectedCount(node, ctx, inFan, count);
      const batch = this.mergeBatch(upstream, total);
      if (batch.length < total) {
        throw new Error(`Merge expected ${total} items, got ${batch.length}`);
      }
      run.outFan[node.id] = 1;
      nodeRun.progress = { done: total, total };
      this.log(run, `Merge buffered ${total}/${total} → 1 batch`, node.id);
      return { batch, count: batch.length };
    }

    // Normal node: it runs once per upstream item.
    run.outFan[node.id] = inFan;
    if (inFan > 1) {
      nodeRun.progress = { done: inFan, total: inFan };
      this.log(run, `"${node.title}" ×${inFan}`, node.id);
    }
    if (node.kind === 'effect') return this.effectOutput(node, ctx);
    if (node.category === 'control-flow') {
      return { branch: run.selected[node.id] };
    }
    if (node.category === 'integration')
      return this.integrationOutput(node, ctx, fanItems);
    if (node.category === 'transform') return this.transformOutput(node, ctx);
    return { ok: true, count };
  }

  private integrationOutput(
    node: BoardNode,
    ctx: EvalContext,
    fanItems: unknown[],
  ): unknown {
    if (node.type === 'public-api-request') {
      const preset = stringValue(node.data?.['preset']) ?? 'jsonplaceholder';
      const url =
        preset === 'custom'
          ? (stringValue(node.data?.['url']) ??
            'https://jsonplaceholder.typicode.com/todos/1')
          : publicApiPresetUrl(preset);
      const timeoutMs = clampInt(node.data?.['timeoutMs'], 5000, 100, 60_000);
      return this.publicApiFetcher({ preset, url, timeoutMs });
    }
    if (node.type === 'llm-agent') return this.llmOutput(node, ctx);
    if (node.type === 'image-gen') return this.imageOutput(node, ctx, fanItems);
    if (isAiNode(node.type)) return this.aiOutput(node);
    const sample = this.catalog.sampleOutput(node.type);
    return sample ? JSON.parse(JSON.stringify(sample)) : { ok: true };
  }

  private llmOutput(node: BoardNode, ctx: EvalContext): unknown {
    const prompt = String(
      resolveTemplate(String(node.data?.['prompt'] ?? ''), ctx) ?? '',
    );
    const configured = mockOutputValue(node.data?.['mockOutput']);
    if (
      configured &&
      typeof configured === 'object' &&
      !Array.isArray(configured)
    ) {
      return {
        model: stringValue(node.data?.['model']) ?? 'mock-llm',
        prompt,
        ...(configured as Record<string, unknown>),
      };
    }
    if (configured !== undefined) {
      return {
        model: stringValue(node.data?.['model']) ?? 'mock-llm',
        prompt,
        result: configured,
      };
    }
    const sample = this.catalog.sampleOutput(node.type);
    return {
      model: stringValue(node.data?.['model']) ?? 'mock-llm',
      prompt,
      ...(sample ? JSON.parse(JSON.stringify(sample)) : {}),
    };
  }

  private imageOutput(
    node: BoardNode,
    ctx: EvalContext,
    fanItems: unknown[],
  ): unknown {
    const model = stringValue(node.data?.['model']) ?? 'mock-image-v1';
    const promptTemplate = String(node.data?.['prompt'] ?? '');
    const prompts = fanItems.length
      ? fanItems.map((item, index) =>
          promptFromItem(promptTemplate, ctx, item, index),
        )
      : [
          String(
            resolveTemplate(String(node.data?.['prompt'] ?? ''), ctx) ?? '',
          ),
        ];
    const images = prompts.map((itemPromptValue, index) => ({
      index,
      prompt: itemPromptValue,
      imageUrl: mockPromptPng(itemPromptValue),
      model,
    }));
    const firstPrompt = images[0]?.prompt ?? '';
    return {
      model,
      prompt: firstPrompt,
      imageUrl: images[0]?.imageUrl ?? mockPromptPng(firstPrompt),
      images,
      count: images.length,
    };
  }

  private aiOutput(node: BoardNode): unknown {
    const model = this.modelLoader(
      stringValue(node.data?.['model']) ?? node.type ?? 'demo',
    );
    if (node.type === 'text-classification') {
      const labels = stringArray(node.data?.['labels'], [
        'sales',
        'support',
        'other',
      ]);
      return {
        model,
        label: labels[1] ?? labels[0] ?? 'other',
        confidence: 0.92,
      };
    }
    if (node.type === 'sentiment-classifier') {
      return {
        model,
        sentiment: 'positive',
        priority: 'normal',
        toxicity: 0.01,
        confidence: 0.88,
      };
    }
    if (node.type === 'ocr-image-recognition') {
      return {
        model,
        text: 'Invoice #1001',
        classes: [{ label: 'document', confidence: 0.94 }],
      };
    }
    return {
      model,
      score: 0.82,
      embedding: [0.12, -0.08, 0.31],
      similar: true,
    };
  }

  /**
   * Transform output. `set-fields` evaluates its value expression and merges it
   * into the (unified) input under the chosen field — the normalization step.
   * Other transforms pass the merged input through.
   */
  private transformOutput(node: BoardNode, ctx: EvalContext): unknown {
    const base =
      ctx.json && typeof ctx.json === 'object' && !Array.isArray(ctx.json)
        ? { ...(ctx.json as Record<string, unknown>) }
        : {};
    if (node.type === 'set-fields') {
      const field = String(node.data?.['field'] ?? 'value');
      const value = resolveTemplate(String(node.data?.['value'] ?? ''), ctx);
      return { ...base, [field]: value };
    }
    if (node.type === 'json-query') {
      return this.jsonQueryOutput(node, ctx, base);
    }
    if (node.type === 'throttle' || node.type === 'debounce') {
      return {
        ...base,
        [node.type === 'throttle' ? 'throttled' : 'debounced']: true,
        windowMs: clampInt(node.data?.['windowMs'], 1000, 1, 60_000),
        key: resolveTemplate(
          String(node.data?.['key'] ?? '{{ $trigger.id }}'),
          ctx,
        ),
      };
    }
    if (node.type === 'repeat') {
      const count = clampInt(node.data?.['count'], 1, 1, 100);
      const template = String(node.data?.['item'] ?? '{{ $json }}');
      return {
        ...base,
        count,
        items: Array.from({ length: count }, (_, index) => ({
          index,
          value: template.includes('{{')
            ? resolveTemplate(template, ctx)
            : coerceExpression(template, ctx),
        })),
      };
    }
    if (node.type === 'csv-parse') {
      return {
        ...base,
        items: parseCsv(
          String(
            resolveTemplate(
              String(node.data?.['csv'] ?? '{{ $json.csv }}'),
              ctx,
            ) ?? '',
          ),
          String(node.data?.['delimiter'] ?? ',') || ',',
          node.data?.['headers'] !== false,
        ),
      };
    }
    if (node.type === 'markdown-render') {
      const markdown = String(
        resolveTemplate(
          String(node.data?.['markdown'] ?? '{{ $json.markdown }}'),
          ctx,
        ) ?? '',
      );
      return {
        ...base,
        markdown,
        html: markdownToHtml(markdown),
        text: markdownText(markdown),
      };
    }
    return Object.keys(base).length ? base : { value: ctx.json };
  }

  private jsonQueryOutput(
    node: BoardNode,
    ctx: EvalContext,
    base: Record<string, unknown>,
  ): unknown {
    const mode = String(node.data?.['mode'] ?? 'pick');
    const expression = String(node.data?.['expression'] ?? '$json');
    if (mode === 'filter-items') {
      const items = Array.isArray(base['items']) ? base['items'] : [];
      return {
        ...base,
        items: items.filter((item) =>
          truthy(coerceExpression(expression, { ...ctx, json: item })),
        ),
      };
    }

    const value = expression.includes('{{')
      ? resolveTemplate(expression, ctx)
      : coerceExpression(expression, ctx);
    if (mode === 'replace') return value;

    const field = String(node.data?.['field'] ?? 'result') || 'result';
    return { ...base, [field]: value };
  }

  private triggerOutput(node: BoardNode, run: RunState): unknown {
    const sample = this.catalog.sampleOutput(node.type);
    const configured = mockOutputValue(node.data?.['sampleOutput']);
    const base = sample
      ? (JSON.parse(JSON.stringify(sample)) as Record<string, unknown>)
      : { count: 10, source: 'telegram' };
    if (
      configured &&
      typeof configured === 'object' &&
      !Array.isArray(configured)
    ) {
      Object.assign(base, configured);
    }
    const tick = triggerTick(run);

    if (node.type === 'interval-trigger') {
      return {
        ...base,
        tick,
        intervalMs: clampInt(node.data?.['intervalMs'], 1000, 1, 60_000),
        scheduledAt: this.now(),
        jitterMs: clampInt(node.data?.['jitterMs'], 0, 0, 60_000),
      };
    }
    if (node.type === 'schedule-trigger') {
      return {
        ...base,
        tick,
        cron: stringValue(node.data?.['cron']) ?? '*/5 * * * *',
        timezone: stringValue(node.data?.['timezone']) ?? 'UTC',
        firedAt: this.now(),
      };
    }
    if (node.type === 'file-trigger') {
      const file = filePayload(node);
      return { ...base, file, text: file.text };
    }
    if (node.type === 'manual-form-trigger') {
      return {
        ...base,
        form: jsonValue(node.data?.['samplePayload'], base['form'] ?? {}),
      };
    }
    if (node.type === 'webhook-trigger') {
      return {
        ...base,
        method: stringValue(node.data?.['method']) ?? 'POST',
        path: stringValue(node.data?.['path']) ?? '/hook',
        headers: jsonValue(node.data?.['headers'], base['headers'] ?? {}),
        body: jsonValue(node.data?.['body'], base['body'] ?? {}),
      };
    }
    return base;
  }

  /** Effect output: resolve its expression params so the run shows what it sent. */
  private effectOutput(node: BoardNode, ctx: EvalContext): unknown {
    const out: Record<string, unknown> = { acknowledged: true };
    for (const param of this.catalog.params(node)) {
      const raw = node.data?.[param.key];
      if (typeof raw === 'string' && raw.includes('{{')) {
        out[param.key] = resolveTemplate(raw, ctx);
      } else if (
        param.type === 'expression' &&
        typeof raw === 'string' &&
        raw
      ) {
        out[param.key] = resolveTemplate(raw, ctx);
      } else if (raw !== undefined) {
        out[param.key] = raw;
      }
    }
    return out;
  }

  private nodeDelayMs(node: BoardNode): number {
    const configured =
      node.type === 'delay'
        ? node.data?.['duration']
        : node.data?.['__mockDelayMs'];
    const delay = numberValue(configured);
    return delay === undefined ? this.stepDelayMs : Math.max(0, delay);
  }

  private nodeFailure(
    node: BoardNode,
    pipeline: Pipeline,
  ): string | undefined | false {
    const configured = node.data?.['__mockFailure'];
    if (typeof configured === 'string' && configured.trim()) {
      return configured.trim();
    }
    return this.failNode(node, pipeline);
  }

  private emitSideEffect(
    run: RunState,
    node: BoardNode,
    output: unknown,
  ): void {
    if (node.kind !== 'effect') return;
    if (!output || typeof output !== 'object') return;
    const data = output as Record<string, unknown>;
    const base = { runId: run.runId, nodeId: node.id };

    let event: MockSideEffect | null = null;
    if (node.type === 'toast-effect') {
      event = {
        ...base,
        kind: 'toast',
        title: stringValue(data['title']),
        message: stringValue(data['message']) ?? node.title,
        variant: toastVariant(data['variant']),
        duration: numberValue(data['duration']),
      };
    } else if (node.type === 'dialog-result') {
      event = {
        ...base,
        kind: 'dialog',
        title: stringValue(data['title']) ?? node.title,
        body: stringValue(data['body']),
        imageUrl: stringValue(data['imageUrl']),
        json: data['json'],
      };
    } else if (node.type === 'image-preview') {
      event = {
        ...base,
        kind: 'dialog',
        title: stringValue(data['title']) ?? node.title,
        body: stringValue(data['caption']),
        imageUrl: stringValue(data['imageUrl']),
        images: imageList(data['images']),
      };
    } else if (node.type === 'download-file') {
      event = {
        ...base,
        kind: 'download',
        fileName: stringValue(data['fileName']) ?? 'pipeline-output.txt',
        content: contentValue(data['content']),
        mimeType: stringValue(data['mimeType']) ?? 'text/plain',
      };
    } else if (node.type === 'clipboard-effect') {
      event = {
        ...base,
        kind: 'clipboard',
        text: stringValue(data['text']) ?? '',
      };
    }

    if (!event) return;
    for (const listener of this.sideEffectListeners) listener(event);
  }

  /** How many times a node runs: the fan its active upstream emits (≥ 1). */
  private inFanOf(run: RunState, pipeline: Pipeline, node: BoardNode): number {
    const active = pipeline.edges.filter(
      (e) => e.target.nodeId === node.id && this.edgeActive(run, e),
    );
    if (!active.length) return 1;
    return Math.max(...active.map((e) => run.outFan[e.source.nodeId] ?? 1));
  }

  private inputFanItems(
    run: RunState,
    pipeline: Pipeline,
    node: BoardNode,
  ): unknown[] {
    const active = pipeline.edges.filter(
      (e) => e.target.nodeId === node.id && this.edgeActive(run, e),
    );
    for (const edge of active) {
      const explicit = run.fanItems[edge.source.nodeId];
      if (explicit?.length) return explicit;
      const output = run.outputs[edge.source.nodeId];
      if (!output || typeof output !== 'object') continue;
      const rec = output as Record<string, unknown>;
      if (Array.isArray(rec['images'])) return rec['images'];
      if (Array.isArray(rec['items'])) return rec['items'];
      if (Array.isArray(rec['batch'])) return rec['batch'];
    }
    return [];
  }

  /**
   * The expression context for a node: `$json` is its merged live-upstream
   * output, `$node["Title"]` resolves to another node's output.
   */
  private evalContext(
    run: RunState,
    pipeline: Pipeline,
    node: BoardNode,
  ): EvalContext {
    const inputs = pipeline.edges
      .filter((e) => e.target.nodeId === node.id && this.edgeActive(run, e))
      .map((e) => run.outputs[e.source.nodeId]);
    const objects = inputs.filter(
      (o): o is Record<string, unknown> =>
        !!o && typeof o === 'object' && !Array.isArray(o),
    );
    const json = objects.length ? Object.assign({}, ...objects) : inputs[0];
    return {
      json,
      trigger: run.trigger,
      node: (title) => {
        const found = pipeline.nodes.find((n) => n.title === title);
        return found ? run.outputs[found.id] : undefined;
      },
    };
  }

  private splitItems(
    node: BoardNode,
    ctx: EvalContext,
    fallback: number,
  ): unknown[] {
    const raw = node.data?.['items'];
    if (typeof raw === 'string' && raw.trim()) {
      const resolved = raw.includes('{{')
        ? resolveTemplate(raw, ctx)
        : coerceExpression(raw, ctx);
      if (Array.isArray(resolved)) return resolved;
    }
    return Array.from({ length: fallback }, (_, i) => i);
  }

  private mergeBatch(upstream: unknown[], total: number): unknown[] {
    for (const out of upstream) {
      if (!out || typeof out !== 'object') continue;
      const rec = out as Record<string, unknown>;
      if (Array.isArray(rec['images'])) return rec['images'].slice(0, total);
      if (Array.isArray(rec['items'])) return rec['items'].slice(0, total);
      if (Array.isArray(rec['batch'])) return rec['batch'].slice(0, total);
    }
    return Array.from({ length: total }, (_, i) => i);
  }

  private mergeExpectedCount(
    node: BoardNode,
    ctx: EvalContext,
    inFan: number,
    fallback: number,
  ): number {
    const raw = node.data?.['expectedCount'];
    if (typeof raw === 'string' && raw.trim()) {
      const value = raw.includes('{{')
        ? resolveTemplate(raw, ctx)
        : coerceExpression(raw, ctx);
      return clampInt(value, inFan || fallback, 1, 10_000);
    }
    return inFan > 1 ? inFan : (node.bufferSize ?? fallback);
  }

  private triggerContext(
    pipeline: Pipeline,
    triggerId: string | undefined,
  ): TriggerContext | undefined {
    const trigger = triggerId
      ? pipeline.nodes.find((n) => n.id === triggerId)
      : pipeline.nodes.find((n) => n.kind === 'trigger');
    if (!trigger) return undefined;
    return {
      id: trigger.id,
      title: trigger.title,
      type: trigger.type,
      channel: triggerChannel(trigger),
      event:
        typeof trigger.data?.['event'] === 'string'
          ? trigger.data['event']
          : undefined,
    };
  }

  /** Best-effort item count from upstream outputs (for split/merge). */
  private countFrom(upstream: unknown[], node: BoardNode): number {
    for (const out of upstream) {
      if (out && typeof out === 'object') {
        const rec = out as Record<string, unknown>;
        if (typeof rec['count'] === 'number') return rec['count'];
        if (Array.isArray(rec['items'])) return rec['items'].length;
        if (Array.isArray(rec['batch'])) return rec['batch'].length;
      }
    }
    return node.bufferSize ?? 10;
  }

  // --- graph ordering -------------------------------------------------------

  /**
   * Kahn topological sort. Returns nodes in a valid execution order, or `null`
   * if the graph has a cycle (i.e. is not a DAG).
   */
  private topoOrder(pipeline: Pipeline): BoardNode[] | null {
    const byId = new Map(pipeline.nodes.map((n) => [n.id, n]));
    const indegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const node of pipeline.nodes) {
      indegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }
    for (const edge of pipeline.edges) {
      if (!byId.has(edge.source.nodeId) || !byId.has(edge.target.nodeId)) {
        continue;
      }
      adjacency.get(edge.source.nodeId)?.push(edge.target.nodeId);
      indegree.set(
        edge.target.nodeId,
        (indegree.get(edge.target.nodeId) ?? 0) + 1,
      );
    }

    const queue = pipeline.nodes
      .filter((n) => (indegree.get(n.id) ?? 0) === 0)
      .map((n) => n.id);
    const order: BoardNode[] = [];

    while (queue.length) {
      const id = queue.shift() as string;
      const node = byId.get(id);
      if (node) order.push(node);
      for (const next of adjacency.get(id) ?? []) {
        const remaining = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, remaining);
        if (remaining === 0) queue.push(next);
      }
    }

    return order.length === pipeline.nodes.length ? order : null;
  }

  // --- snapshot / notification ---------------------------------------------

  private schedule(run: RunState, delayMs: number, fn: () => void): void {
    const timer = setTimeout(() => {
      run.timers = run.timers.filter((t) => t !== timer);
      if (!run.canceled) fn();
    }, delayMs);
    run.timers.push(timer);
  }

  private setNodesTo(
    run: RunState,
    nodes: BoardNode[],
    status: NodeStatus,
  ): void {
    for (const node of nodes) {
      const nodeRun = run.nodes[node.id];
      if (nodeRun) nodeRun.status = status;
    }
  }

  private finish(run: RunState, status: RunStatus): void {
    run.status = status;
    this.log(run, `Run ${status}.`);
    this.emit(run);
  }

  private isTerminal(status: RunStatus): boolean {
    return status === 'success' || status === 'error' || status === 'canceled';
  }

  private log(run: RunState, message: string, nodeId?: string): void {
    const entry: RunLogEntry = { at: this.now(), message };
    if (nodeId !== undefined) entry.nodeId = nodeId;
    run.log.push(entry);
  }

  /** Build an immutable snapshot to hand out to observers. */
  private snapshot(run: RunState): RunSnapshot {
    const nodes: Record<string, NodeRun> = {};
    for (const [id, nodeRun] of Object.entries(run.nodes)) {
      nodes[id] = { ...nodeRun };
    }
    return {
      runId: run.runId,
      status: run.status,
      nodes,
      log: run.log.map((entry) => ({ ...entry })),
      passes: run.passes.map((pass) => ({
        trigger: pass.trigger ? { ...pass.trigger } : undefined,
        triggerIndex: pass.triggerIndex,
        outputs: { ...pass.outputs },
      })),
    };
  }

  private emit(run: RunState): void {
    const snapshot = this.snapshot(run);
    for (const listener of run.listeners) listener(snapshot);
  }
}

/** Resolve a switch case's comparison value (template, expression, or literal). */
function caseValue(raw: string, ctx: EvalContext): unknown {
  if (raw.includes('{{')) return resolveTemplate(raw, ctx);
  const value = tryEvaluate(raw, ctx);
  return value === undefined ? raw : value; // bare word → literal string
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function triggerChannel(node: BoardNode): string {
  const configured = node.data?.['channel'];
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  const type = node.type ?? node.title;
  return type.replace(/-trigger$/, '').toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function triggerTick(run: RunState): number {
  const current = run.firingTriggerId;
  if (!current) return 1;
  let tick = 0;
  for (let i = 0; i <= run.triggerIndex; i++) {
    if (run.triggerIds[i] === current) tick++;
  }
  return Math.max(1, tick);
}

function jsonValue(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return value ?? fallback;
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function mockOutputValue(value: unknown): unknown {
  if (typeof value !== 'string') return cloneJson(value);
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function cloneJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function itemPrompt(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    return (
      stringValue(rec['prompt']) ??
      stringValue(rec['description']) ??
      stringValue(rec['value']) ??
      `Generated image ${index + 1}`
    );
  }
  return stringValue(item) ?? `Generated image ${index + 1}`;
}

function promptFromItem(
  template: string,
  ctx: EvalContext,
  item: unknown,
  index: number,
): string {
  if (!template.trim()) return itemPrompt(item, index);
  const itemCtx = { ...ctx, json: item };
  return String(resolveTemplate(template, itemCtx) ?? itemPrompt(item, index));
}

function mockPromptPng(prompt: string): string {
  return renderTextPng(
    `Mock generated \nimage for prompt:\n${prompt}`,
    768,
    432,
  );
}

function renderTextPng(text: string, width: number, height: number): string {
  const rgba = new Uint8Array(width * height * 4);
  fillRect(rgba, width, height, 0, 0, width, height, [246, 247, 249, 255]);
  fillRect(rgba, width, height, 0, 0, width, 12, [37, 99, 235, 255]);
  drawWrappedText(rgba, width, height, text, 36, 44, width - 72, 4);
  return `data:image/png;base64,${base64(pngBytes(width, height, rgba))}`;
}

function drawWrappedText(
  rgba: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
): void {
  const charWidth = 6 * scale;
  const lineHeight = 10 * scale;
  const lines = text
    .split('\n')
    .flatMap((line) =>
      wrapWords(line, Math.max(1, Math.floor(maxWidth / charWidth))),
    );
  lines
    .slice(0, Math.floor((height - y - 24) / lineHeight))
    .forEach((line, i) => {
      drawText(
        rgba,
        width,
        height,
        line,
        x,
        y + i * lineHeight,
        scale,
        [17, 24, 39, 255],
      );
    });
}

function wrapWords(line: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of line.split(/\s+/)) {
    if (!word) continue;
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current || !out.length) out.push(current);
  return out;
}

function drawText(
  rgba: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: [number, number, number, number],
): void {
  [...text].forEach((char, index) => {
    drawChar(rgba, width, height, char, x + index * 6 * scale, y, scale, color);
  });
}

function drawChar(
  rgba: Uint8Array,
  width: number,
  height: number,
  char: string,
  x: number,
  y: number,
  scale: number,
  color: [number, number, number, number],
): void {
  const glyph = glyphRows(char);
  for (let gy = 0; gy < glyph.length; gy++) {
    const row = glyph[gy] ?? '';
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== '1') continue;
      fillRect(
        rgba,
        width,
        height,
        x + gx * scale,
        y + gy * scale,
        scale,
        scale,
        color,
      );
    }
  }
}

function glyphRows(char: string): string[] {
  return FONT[char.toUpperCase()] ?? FONT['?'];
}

function fillRect(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
): void {
  for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) {
      const i = (yy * width + xx) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function pngBytes(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  }
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk(
      'IHDR',
      concatBytes([u32(width), u32(height), new Uint8Array([8, 6, 0, 0, 0])]),
    ),
    pngChunk('IDAT', zlibStore(raw)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const name = ascii(type);
  return concatBytes([
    u32(data.length),
    name,
    data,
    u32(crc32(concatBytes([name, data]))),
  ]);
}

function zlibStore(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const block = data.subarray(offset, offset + 65535);
    const final = offset + block.length >= data.length ? 1 : 0;
    const len = block.length;
    chunks.push(
      new Uint8Array([
        final,
        len & 0xff,
        (len >> 8) & 0xff,
        ~len & 0xff,
        (~len >> 8) & 0xff,
      ]),
      block,
    );
  }
  chunks.push(u32(adler32(data)));
  return concatBytes(chunks);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function base64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63];
    out += chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
}

const FONT: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

function filePayload(node: BoardNode): {
  name: string;
  mime: string;
  size: number;
  text?: string;
} {
  const raw = node.data?.['file'];
  if (raw && typeof raw === 'object') {
    const file = raw as Record<string, unknown>;
    return {
      name: stringValue(file['name']) ?? 'sample.txt',
      mime:
        stringValue(file['type']) ??
        stringValue(node.data?.['mime']) ??
        'text/plain',
      size: Number(file['size']) || stringValue(file['text'])?.length || 0,
      text: stringValue(file['text']),
    };
  }
  const text = stringValue(node.data?.['sampleText']) ?? 'id,name\n1,Ada';
  return {
    name: 'sample.txt',
    mime: stringValue(node.data?.['mime']) ?? 'text/plain',
    size: text.length,
    text,
  };
}

function publicApiPresetUrl(preset: string): string {
  if (preset === 'hacker-news') {
    return 'https://hacker-news.firebaseio.com/v0/item/8863.json';
  }
  if (preset === 'github-zen') return 'https://api.github.com/zen';
  return 'https://jsonplaceholder.typicode.com/todos/1';
}

function cannedPublicApi(
  request: MockPublicApiRequest,
): Record<string, unknown> {
  if (request.preset === 'hacker-news') {
    return {
      status: 200,
      url: request.url,
      body: {
        id: 8863,
        type: 'story',
        title: 'My YC app: Dropbox',
        score: 111,
      },
      timeoutMs: request.timeoutMs,
    };
  }
  if (request.preset === 'github-zen') {
    return {
      status: 200,
      url: request.url,
      body: { text: 'Responsive is better than fast.' },
      timeoutMs: request.timeoutMs,
    };
  }
  return {
    status: 200,
    url: request.url,
    body: { id: 1, title: 'delectus aut autem', completed: false },
    timeoutMs: request.timeoutMs,
  };
}

function isAiNode(type: string | undefined): boolean {
  return (
    type === 'text-classification' ||
    type === 'sentiment-classifier' ||
    type === 'ocr-image-recognition' ||
    type === 'embedding-similarity'
  );
}

function cannedModelLoad(modelId: string): MockModelLoad {
  return { id: modelId, loaded: true, backend: 'mock-wasm' };
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function contentValue(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function imageList(value: unknown): { imageUrl: string; caption?: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const rec = item as Record<string, unknown>;
    const imageUrl = stringValue(rec['imageUrl']);
    if (!imageUrl) return [];
    return [
      {
        imageUrl,
        caption:
          stringValue(rec['caption']) ??
          stringValue(rec['prompt']) ??
          `Image ${index + 1}`,
      },
    ];
  });
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toastVariant(
  value: unknown,
): 'info' | 'success' | 'warning' | 'danger' {
  return value === 'success' ||
    value === 'warning' ||
    value === 'danger' ||
    value === 'info'
    ? value
    : 'info';
}

function parseCsv(
  text: string,
  delimiter: string,
  headers: boolean,
): Record<string, string>[] | string[][] {
  const rows = csvRows(text, delimiter[0] ?? ',').filter((row) =>
    row.some((cell) => cell.length),
  );
  if (!headers) return rows;
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((row) =>
    Object.fromEntries(head.map((key, index) => [key, row[index] ?? ''])),
  );
}

function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function markdownToHtml(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('### '))
        return `<h3>${inlineMd(block.slice(4))}</h3>`;
      if (block.startsWith('## '))
        return `<h2>${inlineMd(block.slice(3))}</h2>`;
      if (block.startsWith('# ')) return `<h1>${inlineMd(block.slice(2))}</h1>`;
      const lines = block.split('\n');
      if (lines.every((line) => line.startsWith('- '))) {
        return `<ul>${lines
          .map((line) => `<li>${inlineMd(line.slice(2))}</li>`)
          .join('')}</ul>`;
      }
      return `<p>${inlineMd(block.replace(/\n/g, '<br>'))}</p>`;
    })
    .join('');
}

function inlineMd(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .replace(/[`*_]/g, '')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
