---
id: backend
label: Runtime
title: Connect execution and persistence
order: 60
---

The frontend edits graphs and observes runs. Your system owns actual semantics:
queueing, credentials, retries, logs and side effects. The `PipelineBackend`
contract is intentionally small so it can wrap REST, WebSocket, SSE or local
prototypes.

:::demo backend-controls
:::

```typescript title="Backend adapter"
import type { Pipeline, PipelineBackend, RunListener, Unsubscribe } from '@tsai-pe/models';

export class RestPipelineBackend implements PipelineBackend {
  startRun(pipeline: Pipeline): string {
    return crypto.randomUUID();
  }

  observe(runId: string, listener: RunListener): Unsubscribe {
    const socket = new WebSocket(`/api/runs/${runId}/events`);
    socket.onmessage = (event) => listener(JSON.parse(event.data));
    return () => socket.close();
  }

  stop(runId: string): void {
    void fetch(`/api/runs/${runId}/stop`, { method: 'POST' });
  }
}
```

```typescript title="PipelineStore"
export interface PipelineStore {
  save(pipeline: Pipeline): Promise<void>;
  load(id: string): Promise<Pipeline | null>;
  list(): Promise<PipelineSummary[]>;
  remove(id: string): Promise<void>;
}
```

```typescript title="Run snapshot"
export interface RunSnapshot {
  runId: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'canceled';
  nodes: Record<
    string,
    {
      nodeId: string;
      status: 'idle' | 'running' | 'success' | 'error' | 'skipped';
      output?: unknown;
      error?: string;
      buffer?: { done: number; total: number };
    }
  >;
  edges?: Record<string, { edgeId: string; status: 'idle' | 'active' }>;
  log: { at: number; nodeId?: string; message: string }[];
  passes?: { triggerIndex: number; outputs: Record<string, unknown> }[];
}
```

| Step       | Contract                                                              |
| ---------- | --------------------------------------------------------------------- |
| 1. Catalog | Describe what users can add and configure.                            |
| 2. Edit    | `pe-board` or custom primitives update the graph and validate wiring. |
| 3. Save    | `PipelineStore.save()` persists the serializable document.            |
| 4. Run     | `PipelineBackend.startRun()` submits a snapshot.                      |
| 5. Observe | `observe()` streams node status, outputs, edge activity and logs.     |
