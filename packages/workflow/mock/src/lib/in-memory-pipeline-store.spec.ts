import type { Pipeline } from '@tsai-pe/shared/models';
import { InMemoryPipelineStore } from './in-memory-pipeline-store';

function pipeline(id: string, name = id, nodeCount = 0): Pipeline {
  return {
    id,
    name,
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      kind: 'action' as const,
      category: 'transform' as const,
      title: `n${i}`,
      pos: { col: 0, row: 0 },
      size: { cols: 4, rows: 2 },
      ports: [],
    })),
    edges: [],
  };
}

describe('InMemoryPipelineStore', () => {
  it('saves and loads a pipeline', async () => {
    const store = new InMemoryPipelineStore();
    await store.save(pipeline('a', 'A'));
    expect(await store.load('a')).toMatchObject({ id: 'a', name: 'A' });
  });

  it('returns null for an unknown id', async () => {
    const store = new InMemoryPipelineStore();
    expect(await store.load('nope')).toBeNull();
  });

  it('deep-clones on save and load so stored state is immutable by reference', async () => {
    const store = new InMemoryPipelineStore();
    const original = pipeline('a', 'A');
    await store.save(original);
    original.name = 'mutated after save';

    const loaded = await store.load('a');
    expect(loaded?.name).toBe('A'); // unaffected by the post-save mutation
    if (loaded) loaded.name = 'mutated after load';
    expect((await store.load('a'))?.name).toBe('A'); // and by the post-load one
  });

  it('overwrites on re-save', async () => {
    const store = new InMemoryPipelineStore();
    await store.save(pipeline('a', 'first'));
    await store.save(pipeline('a', 'second'));
    expect((await store.load('a'))?.name).toBe('second');
    expect(await store.list()).toHaveLength(1);
  });

  it('lists summaries most-recently-updated first', async () => {
    let t = 0;
    const store = new InMemoryPipelineStore(() => ++t);
    await store.save(pipeline('a', 'A', 2));
    await store.save(pipeline('b', 'B', 5));
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(['b', 'a']); // b saved later
    expect(list[0]).toMatchObject({ id: 'b', name: 'B', nodeCount: 5 });
  });

  it('removes a pipeline', async () => {
    const store = new InMemoryPipelineStore();
    await store.save(pipeline('a'));
    await store.remove('a');
    expect(await store.load('a')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('returns recorded run history for a pipeline, most recent first', async () => {
    const store = new InMemoryPipelineStore();
    store.recordRun({ runId: 'r1', pipelineId: 'a', status: 'success', startedAt: 1 });
    store.recordRun({ runId: 'r2', pipelineId: 'a', status: 'error', startedAt: 3 });
    store.recordRun({ runId: 'r3', pipelineId: 'b', status: 'success', startedAt: 2 });

    const history = await store.runHistory('a');
    expect(history.map((r) => r.runId)).toEqual(['r2', 'r1']);
    expect(await store.runHistory('b')).toHaveLength(1);
  });
});
