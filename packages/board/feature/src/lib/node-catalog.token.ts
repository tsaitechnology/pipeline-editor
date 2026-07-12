import { InjectionToken } from '@angular/core';
import type { NodeCatalog } from '@tsai-pe/nodes';

/**
 * Optional node catalog a `<pe-board>` uses for palette entries, inspector
 * forms and expression help. When absent, the static mock catalog is used.
 */
export const PIPELINE_NODE_CATALOG = new InjectionToken<NodeCatalog>(
  'PIPELINE_NODE_CATALOG',
);
