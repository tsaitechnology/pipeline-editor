import type { Pipeline } from './models';
import type { RunStatus } from './backend';

/**
 * Persistence port — save / load / list pipelines and read run history. Separate
 * from {@link PipelineBackend} (which runs pipelines): a backend may implement
 * both, one, or neither. `InMemoryPipelineStore` (workflow/mock) is one
 * implementation; a real REST store is another.
 *
 * Unlike the run port, this is **async** (`Promise`-based): persistence is
 * inherently remote, so the contract models that up front rather than papering
 * over it (cf. the sync `PipelineBackend.startRun`).
 */
export interface PipelineStore {
  /** Create or overwrite a pipeline (keyed by `pipeline.id`). */
  save(pipeline: Pipeline): Promise<void>;
  /** Load a pipeline by id, or `null` if it does not exist. */
  load(id: string): Promise<Pipeline | null>;
  /** List saved pipelines (summaries only — cheap, no full docs). */
  list(): Promise<PipelineSummary[]>;
  /** Delete a pipeline by id (no-op if absent). */
  remove(id: string): Promise<void>;
  /** Past runs of a pipeline, most recent first. */
  runHistory(pipelineId: string): Promise<RunSummary[]>;
}

/** Lightweight listing entry for a saved pipeline. */
export interface PipelineSummary {
  id: string;
  name: string;
  /** Node count, for an at-a-glance size. */
  nodeCount: number;
  /** Epoch ms of the last save. */
  updatedAt: number;
}

/** A record of one past run of a pipeline. */
export interface RunSummary {
  runId: string;
  pipelineId: string;
  status: RunStatus;
  startedAt: number;
  /** Epoch ms when the run reached a terminal state (absent if still running). */
  finishedAt?: number;
}
