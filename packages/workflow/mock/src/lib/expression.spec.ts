import {
  coerceExpression,
  evaluateExpression,
  looseEquals,
  resolveTemplate,
  truthy,
  tryEvaluate,
  type EvalContext,
} from './expression';

const ctx = (
  json: unknown,
  nodes: Record<string, unknown> = {},
  trigger?: unknown,
): EvalContext => ({
  json,
  trigger,
  node: (title) => nodes[title],
});

const ev = (src: string, c: EvalContext = ctx(undefined)) =>
  evaluateExpression(src, c);

describe('evaluateExpression — literals & operators', () => {
  it('evaluates numbers, strings, booleans, null', () => {
    expect(ev('42')).toBe(42);
    expect(ev('3.5')).toBe(3.5);
    expect(ev('"hi"')).toBe('hi');
    expect(ev("'hi'")).toBe('hi');
    expect(ev('true')).toBe(true);
    expect(ev('null')).toBeNull();
  });

  it('does arithmetic with precedence and parentheses', () => {
    expect(ev('2 + 3 * 4')).toBe(14);
    expect(ev('(2 + 3) * 4')).toBe(20);
    expect(ev('10 % 3')).toBe(1);
    expect(ev('-5 + 2')).toBe(-3);
  });

  it('concatenates when either operand is a string', () => {
    expect(ev('"a" + "b"')).toBe('ab');
    expect(ev('"n=" + 5')).toBe('n=5');
  });

  it('compares and combines with logical operators', () => {
    expect(ev('5 > 3')).toBe(true);
    expect(ev('3 >= 3 && 1 < 2')).toBe(true);
    expect(ev('false || 2 > 1')).toBe(true);
    expect(ev('!(1 > 2)')).toBe(true);
    expect(ev('"a" < "b"')).toBe(true);
  });

  it('handles equality strict vs loose', () => {
    expect(ev('1 === 1')).toBe(true);
    expect(ev('1 === "1"')).toBe(false);
    expect(ev('1 == "1"')).toBe(true);
    expect(ev('"x" != "y"')).toBe(true);
  });

  it('short-circuits && and ||', () => {
    // right side would throw (bad ref); must not be evaluated
    expect(ev('false && $json.a.b', ctx(undefined))).toBe(false);
    expect(ev('true || $json.a.b', ctx(undefined))).toBe(true);
  });
});

describe('evaluateExpression — context access', () => {
  it('reads $json and nested paths', () => {
    expect(ev('$json.count', ctx({ count: 10 }))).toBe(10);
    expect(ev('$json.chat.text', ctx({ chat: { text: 'hi' } }))).toBe('hi');
    expect(ev('$json.items[1]', ctx({ items: ['a', 'b'] }))).toBe('b');
    expect(ev('$json["source"]', ctx({ source: 'tg' }))).toBe('tg');
  });

  it('reads other nodes via $node["Title"]', () => {
    const c = ctx(undefined, { Telegram: { message: 'yo' } });
    expect(ev('$node["Telegram"].message', c)).toBe('yo');
  });

  it('reads trigger metadata via $trigger', () => {
    const c = ctx(undefined, {}, { channel: 'telegram', type: 'telegram-trigger' });
    expect(ev('$trigger.channel', c)).toBe('telegram');
    expect(ev('$trigger.type == "telegram-trigger"', c)).toBe(true);
  });

  it('returns undefined for a missing key on an existing object', () => {
    expect(ev('$json.nope', ctx({ a: 1 }))).toBeUndefined();
  });

  it('THROWS when reading into a missing/undefined path (shape changed)', () => {
    // chat is absent → $json.chat is undefined → .text throws
    expect(() => ev('$json.chat.text', ctx({ message: 'flat' }))).toThrow();
  });

  it('tryEvaluate swallows the error to undefined', () => {
    expect(tryEvaluate('$json.chat.text', ctx({ message: 'flat' }))).toBeUndefined();
    expect(tryEvaluate('this is not valid', ctx(undefined))).toBeUndefined();
  });
});

describe('resolveTemplate', () => {
  it('returns the raw value for a single {{ }} island', () => {
    expect(resolveTemplate('{{ $json.count }}', ctx({ count: 7 }))).toBe(7);
    expect(resolveTemplate('{{ $json.obj }}', ctx({ obj: { a: 1 } }))).toEqual({
      a: 1,
    });
  });

  it('interpolates islands into surrounding text', () => {
    expect(
      resolveTemplate('Hi {{ $json.name }}!', ctx({ name: 'Ann' })),
    ).toBe('Hi Ann!');
  });

  it('passes plain text through untouched', () => {
    expect(resolveTemplate('just text', ctx(undefined))).toBe('just text');
  });
});

describe('coerceExpression', () => {
  it('treats a no-brace string as a pure expression', () => {
    expect(coerceExpression('$json.count > 5', ctx({ count: 10 }))).toBe(true);
  });

  it('treats a braced string as a template', () => {
    expect(coerceExpression('{{ $json.count }}', ctx({ count: 3 }))).toBe(3);
  });
});

describe('helpers', () => {
  it('truthy follows JS-ish rules', () => {
    expect(truthy(0)).toBe(false);
    expect(truthy('')).toBe(false);
    expect(truthy('x')).toBe(true);
    expect(truthy(null)).toBe(false);
    expect(truthy([])).toBe(true);
  });

  it('looseEquals coerces across types', () => {
    expect(looseEquals('telegram', 'telegram')).toBe(true);
    expect(looseEquals(5, '5')).toBe(true);
    expect(looseEquals('a', 'b')).toBe(false);
  });
});
