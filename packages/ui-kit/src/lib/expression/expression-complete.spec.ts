import { completeAt, ExpressionScope } from './expression-complete';

const scope: ExpressionScope = {
  trigger: {
    id: 'tg-trigger',
    title: 'Telegram',
    type: 'telegram-trigger',
    channel: 'telegram',
  },
  json: {
    checkout: {
      total: 42,
      items: [
        { sku: 'sku-1', 'line total': 19 },
        { sku: 'sku-2', 'line total': 23 },
      ],
    },
    customerName: 'Ada',
    'order id': 'ord_1',
  },
  nodes: [
    {
      title: 'Telegram Trigger',
      output: { chat: { id: 123 }, message: { text: 'hello' } },
    },
    {
      title: 'AI Summary',
      output: { summary: 'Done' },
    },
  ],
};

describe('completeAt', () => {
  it('completes expression roots', () => {
    expect(completeAt('$j', 2, scope)).toEqual({
      from: 0,
      to: 2,
      options: [
        {
          label: '$json',
          insert: '$json',
          detail: 'object',
          kind: 'root',
        },
      ],
    });
  });

  it('completes trigger metadata paths', () => {
    const result = completeAt('$trigger.ch', '$trigger.ch'.length, scope);

    expect(result?.from).toBe('$trigger'.length);
    expect(result?.options.map((option) => option.insert)).toEqual([
      '.channel',
    ]);
  });

  it('completes json object keys after a dot', () => {
    const result = completeAt('$json.ch', '$json.ch'.length, scope);

    expect(result?.from).toBe('$json'.length);
    expect(result?.to).toBe('$json.ch'.length);
    expect(result?.options.map((option) => option.insert)).toEqual([
      '.checkout',
    ]);
  });

  it('uses bracket access for non-identifier keys', () => {
    const result = completeAt('$json.', '$json.'.length, scope);

    expect(result?.options.map((option) => option.insert)).toContain(
      '["order id"]',
    );
  });

  it('chains into arrays and nested objects', () => {
    const index = completeAt(
      '$json.checkout.items[',
      '$json.checkout.items['.length,
      scope,
    );
    expect(index?.options.map((option) => option.insert)).toEqual([
      '[0]',
      '[1]',
    ]);

    const nested = completeAt(
      '$json.checkout.items[0].s',
      '$json.checkout.items[0].s'.length,
      scope,
    );
    expect(nested?.options.map((option) => option.insert)).toEqual(['.sku']);
  });

  it('completes node titles with spaces from the last dollar token', () => {
    const result = completeAt(
      'hello $node["Telegram',
      'hello $node["Telegram'.length,
      scope,
    );

    expect(result?.from).toBe('hello '.length);
    expect(result?.options[0].insert).toBe('$node["Telegram Trigger"]');
  });

  it('completes selected node output keys', () => {
    const result = completeAt(
      '$node["Telegram Trigger"].m',
      '$node["Telegram Trigger"].m'.length,
      scope,
    );

    expect(result?.options.map((option) => option.insert)).toEqual([
      '.message',
    ]);
  });
});
