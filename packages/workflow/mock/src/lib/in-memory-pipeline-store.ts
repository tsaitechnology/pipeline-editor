import type {
  Pipeline,
  PipelineStore,
  PipelineSummary,
  RunSummary,
} from '@tsai-pe/shared/models';

/**
 * In-browser, in-memory {@link PipelineStore} — the persistence counterpart to
 * {@link TestBackendSystem}, so the editor can save / load / list pipelines and
 * read run history with no real backend. Stored documents are deep-cloned on the
 * way in and out, so callers can't mutate persisted state by reference.
 */
export class InMemoryPipelineStore implements PipelineStore {
  private readonly pipelines = new Map<string, Pipeline>();
  private readonly updatedAt = new Map<string, number>();
  private readonly runs: RunSummary[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  async save(pipeline: Pipeline): Promise<void> {
    this.pipelines.set(pipeline.id, clone(pipeline));
    this.updatedAt.set(pipeline.id, this.now());
  }

  async load(id: string): Promise<Pipeline | null> {
    const stored = this.pipelines.get(id);
    return stored ? clone(stored) : null;
  }

  async list(): Promise<PipelineSummary[]> {
    return [...this.pipelines.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        nodeCount: p.nodes.length,
        updatedAt: this.updatedAt.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id: string): Promise<void> {
    this.pipelines.delete(id);
    this.updatedAt.delete(id);
  }

  async runHistory(pipelineId: string): Promise<RunSummary[]> {
    return this.runs
      .filter((r) => r.pipelineId === pipelineId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Record a run for history. A real store would receive these from the runner;
   * here it's an explicit hook so demos/tests can seed run history.
   */
  recordRun(summary: RunSummary): void {
    this.runs.push({ ...summary });
  }
}

function clone(pipeline: Pipeline): Pipeline {
  return JSON.parse(JSON.stringify(pipeline)) as Pipeline;
}
