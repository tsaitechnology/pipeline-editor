import { InjectionToken } from '@angular/core';
import type { PipelineBackend } from '@tsai-pe/shared/models';

/**
 * The backend a `<pe-board>` talks to when running a pipeline. Provide a concrete
 * implementation (e.g. `TestBackendSystem`, or a real REST/WS adapter). When
 * absent, the board's Run control is hidden.
 */
export const PIPELINE_BACKEND = new InjectionToken<PipelineBackend>(
  'PIPELINE_BACKEND',
);
