import type { NodeStatus, Pipeline } from './models';

/**
 * Frontend ↔ backend contract. The editor never runs a pipeline itself — a
 * pipeline runs in "the system" (24/7), and the editor talks to it through this
 * vendor-neutral port. `TestBackendSystem` (workflow/mock) is one in-browser
 * implementation; a real REST/WS backend is just another.
 *
 * Kept framework-free (callback subscription, no Signal/Observable) so it can
 * live in `shared` alongside the data model.
 */

/** Overall lifecycle state of a run. */
export type RunStatus = 'pending' | 'running' | 'success' | 'error' | 'canceled';

/** Per-node state within a run. */
export interface NodeRun {
  nodeId: string;
  status: NodeStatus;
  /** Illustrative output the node produced (backend-defined shape). */
  output?: unknown;
  error?: string;
  /** For split/merge — items processed so far (e.g. 3 of 10). */
  progress?: { done: number; total: number };
}

/** A single line in the run log. */
export interface RunLogEntry {
  at: number;
  nodeId?: string;
  message: string;
}

/** An immutable snapshot of a run, pushed to observers on every change. */
export interface RunSnapshot {
  runId: string;
  status: RunStatus;
  nodes: Record<string, NodeRun>;
  log: RunLogEntry[];
}

export type RunListener = (snapshot: RunSnapshot) => void;
export type Unsubscribe = () => void;

/** The port the editor uses to run pipelines and observe their progress. */
export interface PipelineBackend {
  /** Submit a pipeline to run; returns a run id. */
  startRun(pipeline: Pipeline): string;
  /** Subscribe to run snapshots; the listener fires immediately with current state. */
  observe(runId: string, listener: RunListener): Unsubscribe;
  /** Request cancellation of a run. */
  stop(runId: string): void;
}
