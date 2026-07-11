import {
  type BoardNode,
  type NodeRun,
  type NodeStatus,
  type Pipeline,
  type PipelineBackend,
  type RunListener,
  type RunLogEntry,
  type RunSnapshot,
  type RunStatus,
  type Unsubscribe,
} from '@tsai-pe/shared/models';
import { controlFlowOutputs, isControlFlow } from '@tsai-pe/shared/nodes';

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
   * Fan-out factor a node *emits* downstream: split multiplies it by the item
   * count, merge collapses it back to 1, everything else passes it through. A
   * node executes `inFan` times (its upstream's emitted fan).
   */
  outFan: Record<string, number>;
}

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
  private seq = 0;

  private readonly stepDelayMs: number;
  private readonly failNode: (
    node: BoardNode,
    pipeline: Pipeline,
  ) => string | undefined | false;
  private readonly now: () => number;

  constructor(options: TestBackendOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 400;
    this.failNode = options.failNode ?? (() => undefined);
    this.now = options.now ?? (() => Date.now());
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
      this.runNextNode(run, pipeline, order, 0);
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

  // --- simulation -----------------------------------------------------------

  private runNextNode(
    run: RunState,
    pipeline: Pipeline,
    order: BoardNode[],
    index: number,
  ): void {
    if (run.canceled) return;

    if (index >= order.length) {
      this.finish(run, 'success');
      return;
    }

    const node = order[index];
    const nodeRun = run.nodes[node.id];

    // Run a node only if it is a root, or an upstream node succeeded along a
    // *taken* branch (control-flow routes only through its selected output).
    if (!this.isReachable(run, pipeline, node)) {
      this.log(run, `"${node.title}" not on the taken path — skipped.`, node.id);
      this.runNextNode(run, pipeline, order, index + 1);
      return;
    }

    nodeRun.status = 'running';
    this.log(run, `Running "${node.title}".`, node.id);
    this.emit(run);

    this.schedule(run, this.stepDelayMs, () => {
      const failure = this.failNode(node, pipeline);
      if (failure) {
        nodeRun.status = 'error';
        nodeRun.error = String(failure);
        this.log(run, `Node "${node.title}" failed: ${nodeRun.error}`, node.id);

        // An optional effect failing does not fail the run.
        const fatal = !(node.kind === 'effect' && node.required === false);
        if (fatal) {
          this.emit(run);
          this.finish(run, 'error');
          return;
        }
        this.log(run, `(optional — run continues)`, node.id);
      } else {
        nodeRun.status = 'success';
        if (isControlFlow(node)) this.resolveBranch(run, node);
        run.outputs[node.id] = this.produceOutput(run, pipeline, node, nodeRun);
      }
      this.emit(run);
      this.runNextNode(run, pipeline, order, index + 1);
    });
  }

  /** Whether a node should run given upstream success and taken branches. */
  private isReachable(
    run: RunState,
    pipeline: Pipeline,
    node: BoardNode,
  ): boolean {
    const incoming = pipeline.edges.filter((e) => e.target.nodeId === node.id);
    if (!incoming.length) return true; // a root (trigger)
    return incoming.some((e) => {
      if (run.nodes[e.source.nodeId]?.status !== 'success') return false;
      const selected = run.selected[e.source.nodeId];
      // Non-branching source: always taken. Branching: only the selected port.
      return selected === undefined || e.source.portId === selected;
    });
  }

  /** Pick the mock branch a control-flow node routes to, and log it. */
  private resolveBranch(run: RunState, node: BoardNode): void {
    if (!isControlFlow(node) || !node.config) return;
    const config = node.config;
    let portId: string;
    if (config.type === 'if') portId = 'true';
    else if (config.type === 'filter') portId = 'pass';
    else portId = config.cases.length ? `case-${config.cases[0].id}` : 'default';
    run.selected[node.id] = portId;
    const label =
      controlFlowOutputs(config).find((o) => o.id === portId)?.label ?? portId;
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
  ): unknown {
    const upstream = pipeline.edges
      .filter((e) => e.target.nodeId === node.id)
      .map((e) => run.outputs[e.source.nodeId]);
    const count = this.countFrom(upstream, node);
    const inFan = this.inFanOf(run, pipeline, node);

    if (node.kind === 'trigger') {
      run.outFan[node.id] = 1;
      return { count: 10, source: 'telegram' };
    }

    if (node.category === 'split') {
      run.outFan[node.id] = inFan * count;
      nodeRun.progress = { done: count, total: count };
      this.log(run, `Split → fan-out ×${count}`, node.id);
      return { items: Array.from({ length: count }, (_, i) => i) };
    }
    if (node.category === 'merge') {
      const total = inFan > 1 ? inFan : (node.bufferSize ?? count);
      run.outFan[node.id] = 1;
      nodeRun.progress = { done: total, total };
      this.log(run, `Merge buffered ${total}/${total} → 1 batch`, node.id);
      return { batch: Array.from({ length: total }, (_, i) => i) };
    }

    // Normal node: it runs once per upstream item.
    run.outFan[node.id] = inFan;
    if (inFan > 1) {
      nodeRun.progress = { done: inFan, total: inFan };
      this.log(run, `"${node.title}" ×${inFan}`, node.id);
    }
    if (node.kind === 'effect') return { acknowledged: true };
    if (node.category === 'control-flow') {
      return { branch: run.selected[node.id] };
    }
    return { ok: true, count };
  }

  /** How many times a node runs: the fan its active upstream emits (≥ 1). */
  private inFanOf(run: RunState, pipeline: Pipeline, node: BoardNode): number {
    const active = pipeline.edges.filter((e) => {
      if (e.target.nodeId !== node.id) return false;
      if (run.nodes[e.source.nodeId]?.status !== 'success') return false;
      const selected = run.selected[e.source.nodeId];
      return selected === undefined || e.source.portId === selected;
    });
    if (!active.length) return 1;
    return Math.max(...active.map((e) => run.outFan[e.source.nodeId] ?? 1));
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
    };
  }

  private emit(run: RunState): void {
    const snapshot = this.snapshot(run);
    for (const listener of run.listeners) listener(snapshot);
  }
}
