import type { Edge, PortRole, Pipeline } from './models';

/** Severity of a validation finding. */
export type IssueSeverity = 'error' | 'warning';

/** A single validation finding against a pipeline. */
export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/**
 * Validate a pipeline's structural integrity:
 * - every edge references existing nodes and ports;
 * - edges run output → input (port role compatibility);
 * - the graph is acyclic (a pipeline is a DAG);
 * - disconnected nodes are flagged as a warning.
 *
 * Inputs may receive **multiple** incoming connections (fan-in / OR): distinct
 * sources — e.g. several triggers — can converge on one node.
 */
export function validatePipeline(pipeline: Pipeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(pipeline.nodes.map((n) => [n.id, n]));

  const roleOf = (nodeId: string, portId: string): PortRole | undefined =>
    byId.get(nodeId)?.ports.find((p) => p.id === portId)?.role;

  for (const edge of pipeline.edges) {
    const source = byId.get(edge.source.nodeId);
    const target = byId.get(edge.target.nodeId);
    if (!source || !target) {
      issues.push({
        severity: 'error',
        code: 'edge-missing-node',
        message: `Connection references a node that no longer exists`,
        edgeId: edge.id,
      });
      continue;
    }
    if (roleOf(edge.source.nodeId, edge.source.portId) !== 'output') {
      issues.push({
        severity: 'error',
        code: 'bad-source-port',
        message: `Connection must start at an output port`,
        edgeId: edge.id,
      });
    }
    if (roleOf(edge.target.nodeId, edge.target.portId) !== 'input') {
      issues.push({
        severity: 'error',
        code: 'bad-target-port',
        message: `Connection must end at an input port`,
        edgeId: edge.id,
      });
    }
  }

  if (hasCycle(pipeline.edges)) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: `The pipeline contains a cycle — it must be acyclic`,
    });
  }

  if (pipeline.nodes.length > 1) {
    const connected = new Set<string>();
    for (const edge of pipeline.edges) {
      connected.add(edge.source.nodeId);
      connected.add(edge.target.nodeId);
    }
    for (const node of pipeline.nodes) {
      if (!connected.has(node.id)) {
        issues.push({
          severity: 'warning',
          code: 'orphan',
          message: `"${node.title}" is not connected to anything`,
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}

function adjacency(edges: readonly Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source.nodeId) ?? [];
    list.push(e.target.nodeId);
    adj.set(e.source.nodeId, list);
  }
  return adj;
}

/** Whether the directed edge graph contains a cycle. */
export function hasCycle(edges: readonly Edge[]): boolean {
  const adj = adjacency(edges);
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.source.nodeId);
    nodes.add(e.target.nodeId);
  }
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const visit = (u: string): boolean => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v);
      if (s === 1) return true;
      if (s === undefined && visit(v)) return true;
    }
    state.set(u, 2);
    return false;
  };
  for (const n of nodes) {
    if (state.get(n) === undefined && visit(n)) return true;
  }
  return false;
}

/** Whether a directed path exists from `a` to `b` following edges. */
export function reaches(edges: readonly Edge[], a: string, b: string): boolean {
  if (a === b) return true;
  const adj = adjacency(edges);
  const seen = new Set<string>([a]);
  const stack = [a];
  while (stack.length) {
    const u = stack.pop() as string;
    for (const v of adj.get(u) ?? []) {
      if (v === b) return true;
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return false;
}
