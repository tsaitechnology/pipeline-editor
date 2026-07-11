import { InjectionToken } from '@angular/core';
import type { PipelineStore } from '@tsai-pe/shared/models';

/**
 * Optional persistence a `<pe-board>` uses for Save / Open. Provide a concrete
 * implementation (e.g. `InMemoryPipelineStore`, or a real REST store). When
 * absent, the board's Save / Open controls are hidden.
 */
export const PIPELINE_STORE = new InjectionToken<PipelineStore>(
  'PIPELINE_STORE',
);
