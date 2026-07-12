import type { BoardNode, ControlFlowConfig } from '@tsai-pe/models';
import {
  catalogEntry,
  controlFlowOutputs,
  createStaticNodeCatalog,
  defaultControlFlowConfig,
  derivePorts,
  inferOutputSchema,
  isControlFlow,
  NODE_CATALOG,
  paramSchema,
} from './registry';
import { variablePaths } from './variables';

/** Minimal control-flow node fixture. */
function cfNode(config: ControlFlowConfig): BoardNode {
  return {
    id: 'n',
    kind: 'action',
    category: 'control-flow',
    title: 'CF',
    pos: { col: 0, row: 0 },
    size: { cols: 4, rows: 2 },
    ports: [],
    config,
  };
}

describe('isControlFlow', () => {
  it('is true only for action + control-flow', () => {
    expect(isControlFlow({ kind: 'action', category: 'control-flow' })).toBe(
      true,
    );
  });

  it('is false for other actions and non-actions', () => {
    expect(isControlFlow({ kind: 'action', category: 'transform' })).toBe(
      false,
    );
    expect(isControlFlow({ kind: 'trigger' })).toBe(false);
    expect(isControlFlow({ kind: 'effect' })).toBe(false);
  });
});

describe('controlFlowOutputs', () => {
  it('yields true/false for if', () => {
    expect(controlFlowOutputs({ type: 'if', expression: '' })).toEqual([
      { id: 'true', label: 'true' },
      { id: 'false', label: 'false' },
    ]);
  });

  it('yields one pass branch for filter', () => {
    expect(controlFlowOutputs({ type: 'filter', expression: '' })).toEqual([
      { id: 'pass', label: 'pass' },
    ]);
  });

  it('maps switch cases and appends default only when enabled', () => {
    const withDefault = controlFlowOutputs({
      type: 'switch',
      discriminant: 'x',
      cases: [
        { id: 'a', label: 'A', value: '1' },
        { id: 'b', label: '', value: '2' },
      ],
      hasDefault: true,
    });
    expect(withDefault).toEqual([
      { id: 'case-a', label: 'A' },
      { id: 'case-b', label: '2' },
      { id: 'default', label: 'default' },
    ]);

    const noDefault = controlFlowOutputs({
      type: 'switch',
      discriminant: 'x',
      cases: [{ id: 'a', label: '', value: '' }],
      hasDefault: false,
    });
    expect(noDefault).toEqual([{ id: 'case-a', label: 'case' }]);
  });
});

describe('derivePorts', () => {
  it('derives one input + a right output per branch for configured control-flow', () => {
    const ports = derivePorts(cfNode({ type: 'if', expression: '' }));
    expect(ports).toEqual([
      { id: 'in', role: 'input', side: 'left' },
      { id: 'true', role: 'output', side: 'right', label: 'true' },
      { id: 'false', role: 'output', side: 'right', label: 'false' },
    ]);
  });

  it('falls back to default ports for a control-flow node without config', () => {
    const node = cfNode({ type: 'if', expression: '' });
    node.config = undefined;
    // action default: 1 input + 3 output anchors
    expect(derivePorts(node).map((p) => p.id)).toEqual([
      'in',
      'out-right',
      'out-top',
      'out-bottom',
    ]);
  });

  it('uses default ports for non-control-flow nodes', () => {
    const trigger: BoardNode = {
      id: 't',
      kind: 'trigger',
      title: 'T',
      pos: { col: 0, row: 0 },
      size: { cols: 4, rows: 2 },
      ports: [],
    };
    expect(derivePorts(trigger).every((p) => p.role === 'output')).toBe(true);
  });
});

describe('catalogEntry', () => {
  it('resolves a known catalog id', () => {
    expect(catalogEntry('llm-agent')?.label).toBe('LLM Agent');
  });

  it('returns undefined for unknown or missing ids', () => {
    expect(catalogEntry('nope')).toBeUndefined();
    expect(catalogEntry(undefined)).toBeUndefined();
  });
});

describe('createStaticNodeCatalog', () => {
  it('creates an isolated catalog adapter for injected/mock catalogs', () => {
    const catalog = createStaticNodeCatalog(
      [
        {
          id: 'custom-trigger',
          label: 'Custom Trigger',
          kind: 'trigger',
          params: [{ key: 'topic', label: 'Topic', type: 'text' }],
          output: { topic: 'demo' },
        },
      ],
      'custom-v1',
    );

    expect(catalog.version).toBe('custom-v1');
    expect(catalog.specs()).toHaveLength(1);
    expect(catalog.entry('custom-trigger')?.label).toBe('Custom Trigger');
    expect(catalog.params({ kind: 'trigger', type: 'custom-trigger' })).toEqual(
      [{ key: 'topic', label: 'Topic', type: 'text' }],
    );
  });

  it('exposes inferred output schemas separately from sample output', () => {
    const catalog = createStaticNodeCatalog([
      {
        id: 'sample',
        label: 'Sample',
        kind: 'trigger',
        params: [],
        output: { body: { ok: true }, items: [{ id: 1 }] },
      },
    ]);

    expect(catalog.sampleOutput('sample')).toEqual({
      body: { ok: true },
      items: [{ id: 1 }],
    });
    expect(catalog.outputSchema('sample')).toEqual({
      type: 'object',
      properties: {
        body: { type: 'object', properties: { ok: { type: 'boolean' } } },
        items: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'number' } } },
        },
      },
    });
  });
});

describe('inferOutputSchema', () => {
  it('returns undefined for missing output', () => {
    expect(inferOutputSchema(undefined)).toBeUndefined();
  });
});

describe('paramSchema', () => {
  it('returns the concrete catalog type params when a type is set', () => {
    const keys = paramSchema({
      kind: 'action',
      category: 'integration',
      type: 'http-request',
    }).map((p) => p.key);
    expect(keys).toEqual(['method', 'url', 'body']);
  });

  it('falls back to the per-category schema when no catalog type matches', () => {
    const keys = paramSchema({ kind: 'trigger', type: undefined }).map(
      (p) => p.key,
    );
    expect(keys).toEqual(['event']);
  });

  it('is empty for control-flow (bespoke form)', () => {
    expect(
      paramSchema({
        kind: 'action',
        category: 'control-flow',
        type: undefined,
      }),
    ).toEqual([]);
  });
});

describe('defaultControlFlowConfig', () => {
  it('seeds an if expression', () => {
    expect(defaultControlFlowConfig('if')).toEqual({
      type: 'if',
      expression: '',
    });
  });

  it('seeds a filter expression', () => {
    expect(defaultControlFlowConfig('filter')).toEqual({
      type: 'filter',
      expression: '',
    });
  });

  it('seeds a switch with one case and a default branch', () => {
    const config = defaultControlFlowConfig('switch');
    expect(config).toEqual({
      type: 'switch',
      discriminant: '',
      cases: [{ id: '1', label: 'Case 1', value: '' }],
      hasDefault: true,
    });
  });
});

describe('NODE_CATALOG', () => {
  it('has unique ids', () => {
    const ids = NODE_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every action with a category', () => {
    for (const spec of NODE_CATALOG) {
      if (spec.kind === 'action') expect(spec.category).toBeDefined();
    }
  });

  it('gives messaging triggers distinct output shapes for expression help', () => {
    expect(variablePaths(catalogEntry('telegram-trigger')?.output)).toContain(
      'message',
    );
    expect(variablePaths(catalogEntry('whatsapp-trigger')?.output)).toContain(
      'chat.text',
    );
    expect(variablePaths(catalogEntry('slack-trigger')?.output)).toContain(
      'event.text',
    );
  });

  it('gives every concrete catalog node a non-empty output shape', () => {
    for (const spec of NODE_CATALOG) {
      expect(variablePaths(spec.output), spec.id).not.toEqual([]);
    }
  });
});
