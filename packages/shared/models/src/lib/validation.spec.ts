import type { BoardNode, Edge, Pipeline } from './models';
import { hasCycle, reaches, validatePipeline } from './validation';

/** An action node with a left input + a right output, at a given id. */
function node(id: string): BoardNode {
  return {
    id,
    kind: 'action',
    category: 'transform',
    title: id,
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 2 },
    ports: [
      { id: 'in', role: 'input', side: 'left' },
      { id: 'out', role: 'output', side: 'right' },
    ],
  };
}

function edge(id: string, from: string, to: string): Edge {
  return {
    id,
    source: { nodeId: from, portId: 'out' },
    target: { nodeId: to, portId: 'in' },
  };
}

function pipeline(nodes: BoardNode[], edges: Edge[]): Pipeline {
  return { id: 'p', name: 'P', nodes, edges };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('validatePipeline', () => {
  it('passes a clean linear pipeline', () => {
    const p = pipeline(
      [node('a'), node('b')],
      [edge('e1', 'a', 'b')],
    );
    expect(validatePipeline(p)).toEqual([]);
  });

  it('flags an edge referencing a missing node', () => {
    const p = pipeline([node('a')], [edge('e1', 'a', 'ghost')]);
    expect(codes(validatePipeline(p))).toContain('edge-missing-node');
  });

  it('flags a connection that does not start at an output port', () => {
    const p = pipeline(
      [node('a'), node('b')],
      [
        {
          id: 'e1',
          source: { nodeId: 'a', portId: 'in' }, // input used as source
          target: { nodeId: 'b', portId: 'in' },
        },
      ],
    );
    expect(codes(validatePipeline(p))).toContain('bad-source-port');
  });

  it('flags a connection that does not end at an input port', () => {
    const p = pipeline(
      [node('a'), node('b')],
      [
        {
          id: 'e1',
          source: { nodeId: 'a', portId: 'out' },
          target: { nodeId: 'b', portId: 'out' }, // output used as target
        },
      ],
    );
    expect(codes(validatePipeline(p))).toContain('bad-target-port');
  });

  it('allows fan-in — multiple sources into one input is not an error', () => {
    const p = pipeline(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'c'), edge('e2', 'b', 'c')],
    );
    expect(validatePipeline(p)).toEqual([]);
  });

  it('flags a cycle', () => {
    const p = pipeline(
      [node('a'), node('b')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    );
    expect(codes(validatePipeline(p))).toContain('cycle');
  });

  it('warns about orphan nodes only when there is more than one node', () => {
    const many = pipeline([node('a'), node('b'), node('c')], [edge('e1', 'a', 'b')]);
    const orphan = validatePipeline(many).find((i) => i.code === 'orphan');
    expect(orphan?.nodeId).toBe('c');

    const single = pipeline([node('a')], []);
    expect(codes(validatePipeline(single))).not.toContain('orphan');
  });
});

describe('hasCycle', () => {
  it('is false for a DAG', () => {
    expect(hasCycle([edge('e1', 'a', 'b'), edge('e2', 'b', 'c')])).toBe(false);
  });

  it('is true for a direct back-edge', () => {
    expect(hasCycle([edge('e1', 'a', 'b'), edge('e2', 'b', 'a')])).toBe(true);
  });

  it('is true for a self-loop', () => {
    expect(hasCycle([edge('e1', 'a', 'a')])).toBe(true);
  });
});

describe('reaches', () => {
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];

  it('is reflexive', () => {
    expect(reaches(edges, 'a', 'a')).toBe(true);
  });

  it('follows transitive paths', () => {
    expect(reaches(edges, 'a', 'c')).toBe(true);
  });

  it('is directional', () => {
    expect(reaches(edges, 'c', 'a')).toBe(false);
  });
});
