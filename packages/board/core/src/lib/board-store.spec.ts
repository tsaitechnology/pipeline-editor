import { BoardStore, type NewNode } from './board-store';

/** A plain transform node spec at a given cell. */
function action(title: string, col = 0, row = 0): NewNode {
  return { kind: 'action', category: 'transform', title, pos: { col, row } };
}

describe('BoardStore — nodes', () => {
  it('adds a node with derived ports, selects it, and records history', () => {
    const store = new BoardStore();
    const id = store.addNode(action('A'));
    expect(store.nodes()).toHaveLength(1);
    expect(store.isSelected(id)).toBe(true);
    expect(store.canUndo()).toBe(true);
    // action default ports: 1 input + 3 outputs
    const node = store.nodes()[0];
    expect(node.ports.filter((p) => p.role === 'input')).toHaveLength(1);
    expect(node.ports.filter((p) => p.role === 'output')).toHaveLength(3);
  });

  it('gives control-flow nodes an if-config with true/false branches', () => {
    const store = new BoardStore();
    const id = store.addNode({
      kind: 'action',
      category: 'control-flow',
      title: 'If',
      pos: { col: 0, row: 0 },
    });
    const node = store.nodes().find((n) => n.id === id);
    expect(node?.config?.type).toBe('if');
    expect(node?.ports.filter((p) => p.role === 'output').map((p) => p.id)).toEqual([
      'true',
      'false',
    ]);
  });

  it('removes a node together with its incident edges', () => {
    const store = new BoardStore();
    const a = store.addNode(action('A'));
    const b = store.addNode(action('B', 6));
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    expect(store.edges()).toHaveLength(1);
    store.removeNode(b);
    expect(store.nodes()).toHaveLength(1);
    expect(store.edges()).toHaveLength(0);
  });
});

describe('BoardStore — connections', () => {
  function twoNodes() {
    const store = new BoardStore();
    const a = store.addNode(action('A'));
    const b = store.addNode(action('B', 6));
    return { store, a, b };
  }

  it('connects an output to an input', () => {
    const { store, a, b } = twoNodes();
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    expect(store.edges()).toHaveLength(1);
  });

  it('rejects a self-connection', () => {
    const { store, a } = twoNodes();
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: a, portId: 'in' });
    expect(store.edges()).toHaveLength(0);
  });

  it('rejects a connection that would create a cycle', () => {
    const { store, a, b } = twoNodes();
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    store.connect({ nodeId: b, portId: 'out-right' }, { nodeId: a, portId: 'in' });
    expect(store.edges()).toHaveLength(1);
  });

  it('accepts fan-in — multiple sources can converge on one input', () => {
    const store = new BoardStore();
    const a = store.addNode(action('A', 0, 0));
    const b = store.addNode(action('B', 0, 4));
    const c = store.addNode(action('C', 6, 2));
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: c, portId: 'in' });
    store.connect({ nodeId: b, portId: 'out-right' }, { nodeId: c, portId: 'in' });
    expect(store.edges()).toHaveLength(2);
    expect(store.edges().map((e) => e.source.nodeId).sort()).toEqual(
      [a, b].sort(),
    );
  });

  it('still rejects an exact duplicate connection', () => {
    const { store, a, b } = twoNodes();
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    expect(store.edges()).toHaveLength(1);
  });
});

describe('BoardStore — history', () => {
  it('undoes and redoes an add', () => {
    const store = new BoardStore();
    store.addNode(action('A'));
    expect(store.nodes()).toHaveLength(1);
    store.undo();
    expect(store.nodes()).toHaveLength(0);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.nodes()).toHaveLength(1);
  });
});

describe('BoardStore — clipboard', () => {
  it('copies a selected subgraph and pastes offset copies with remapped edges', () => {
    const store = new BoardStore();
    const a = store.addNode(action('A', 0, 0));
    const b = store.addNode(action('B', 6, 0));
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    store.selectMany([a, b]);
    store.copySelection();
    store.paste();
    expect(store.nodes()).toHaveLength(4);
    expect(store.edges()).toHaveLength(2);
    // the two pasted nodes are the new selection, none of them the originals
    const sel = store.selection();
    expect(sel.size).toBe(2);
    expect(sel.has(a)).toBe(false);
  });
});

describe('BoardStore — ancestors & validation', () => {
  it('reports transitive ancestors', () => {
    const store = new BoardStore();
    const a = store.addNode(action('A', 0, 0));
    const b = store.addNode(action('B', 6, 0));
    const c = store.addNode(action('C', 12, 0));
    store.connect({ nodeId: a, portId: 'out-right' }, { nodeId: b, portId: 'in' });
    store.connect({ nodeId: b, portId: 'out-right' }, { nodeId: c, portId: 'in' });
    expect(store.ancestorsOf(c).map((n) => n.id).sort()).toEqual([a, b].sort());
    expect(store.ancestorsOf(a)).toEqual([]);
  });

  it('surfaces orphan warnings via the issues signal', () => {
    const store = new BoardStore();
    store.addNode(action('A', 0, 0));
    store.addNode(action('B', 6, 0));
    expect(store.issues().some((i) => i.code === 'orphan')).toBe(true);
  });
});

describe('BoardStore — applyConfig', () => {
  it('prunes edges whose branch port disappears after a reconfigure', () => {
    const store = new BoardStore();
    const sw = store.addNode({
      kind: 'action',
      category: 'control-flow',
      title: 'Switch',
      pos: { col: 0, row: 0 },
    });
    // start it as a switch with two cases → case-1 / case-2 / default outputs
    store.applyConfig(sw, {
      type: 'switch',
      discriminant: 'x',
      cases: [
        { id: '1', label: 'One', value: '1' },
        { id: '2', label: 'Two', value: '2' },
      ],
      hasDefault: false,
    });
    const target = store.addNode(action('T', 8, 0));
    store.connect({ nodeId: sw, portId: 'case-2' }, { nodeId: target, portId: 'in' });
    expect(store.edges()).toHaveLength(1);

    // reconfigure to a single case — case-2 no longer exists
    store.applyConfig(sw, {
      type: 'switch',
      discriminant: 'x',
      cases: [{ id: '1', label: 'One', value: '1' }],
      hasDefault: false,
    });
    expect(store.edges()).toHaveLength(0);
  });
});

describe('BoardStore — marquee selection', () => {
  it('selects nodes intersecting a world rect', () => {
    const store = new BoardStore();
    const a = store.addNode(action('A', 0, 0));
    store.addNode(action('B', 20, 20));
    // rect around node A only (A at 0,0 → world 0..~192)
    store.selectInRect({ x: 0, y: 0, width: 100, height: 100 });
    expect(store.isSelected(a)).toBe(true);
    expect(store.selection().size).toBe(1);
  });
});
