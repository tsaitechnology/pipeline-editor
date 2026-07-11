/**
 * A tiny, safe expression language for the mock backend — enough to actually
 * evaluate the editor's expressions (so the language itself is exercised) without
 * `eval`/`new Function`. A real backend has its own engine; this mirrors the
 * n8n-style surface the editor produces.
 *
 * Grammar (precedence low → high):
 *   || · && · (== != === !==) · (< <= > >=) · (+ -) · (* / %) · unary(! -) ·
 *   postfix(.member ["key"] [index]) · primary
 * Primaries: number, string, true/false/null, `$json`, `$node["Title"]`, `( … )`.
 *
 * `$json` is the current node's (merged) input; `$node["Title"]` is another
 * node's output. Both come from the {@link EvalContext}.
 */
export interface EvalContext {
  /** The current node's input (merged upstream output). */
  json?: unknown;
  /** Resolve `$node["Title"]` to that node's output. */
  node?: (title: string) => unknown;
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate a pure expression (no `{{ }}`). **Strict**: a parse error or a bad
 * reference (reading a member of `null`/`undefined`, i.e. the upstream shape
 * changed) throws — so the calling node fails, which is the intended behaviour
 * (a broken expression should stop a required node, not silently pass). Reading a
 * *missing* key of an existing object yields `undefined`, like JS.
 */
export function evaluateExpression(src: string, ctx: EvalContext): unknown {
  const text = src.trim();
  if (!text) return undefined;
  const tokens = tokenize(text);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  parser.expectEnd();
  return evaluate(ast, ctx);
}

/** Best-effort evaluation: returns `undefined` instead of throwing. */
export function tryEvaluate(src: string, ctx: EvalContext): unknown {
  try {
    return evaluateExpression(src, ctx);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a template string: each `{{ expr }}` island is evaluated. If the whole
 * (trimmed) string is a single island, the raw typed value is returned;
 * otherwise the islands are stringified and interpolated into the surrounding
 * text.
 */
export function resolveTemplate(text: string, ctx: EvalContext): unknown {
  const single = text.trim().match(/^\{\{([\s\S]*)\}\}$/);
  if (single) return evaluateExpression(single[1], ctx);
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{([\s\S]*?)\}\}/g, (_, code: string) =>
    stringify(evaluateExpression(code, ctx)),
  );
}

/**
 * Evaluate a field that may be either a pure expression or a template: no `{{`
 * → whole string is an expression; otherwise treat as a template. Used for
 * control-flow conditions (typically pure) and other free-text fields.
 */
export function coerceExpression(text: string, ctx: EvalContext): unknown {
  if (!text) return undefined;
  return text.includes('{{')
    ? resolveTemplate(text, ctx)
    : evaluateExpression(text, ctx);
}

/** JS-ish truthiness. */
export function truthy(v: unknown): boolean {
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}

/** Loose equality: same-type strict, else compare stringified forms. */
export function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === typeof b) return a === b;
  if (a == null || b == null) return a === b;
  return stringify(a) === stringify(b);
}

// ── tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'name'; value: string }
  | { type: 'op'; value: string };

const OPERATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '(',
  ')',
  '[',
  ']',
  '.',
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const { value, next } = readString(src, i);
      tokens.push({ type: 'str', value });
      i = next;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'num', value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      tokens.push({ type: 'name', value: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`Unexpected character '${ch}'`);
    tokens.push({ type: 'op', value: op });
    i += op.length;
  }
  return tokens;
}

function readString(src: string, start: number): { value: string; next: number } {
  const quote = src[start];
  let value = '';
  let i = start + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === '\\' && i + 1 < src.length) {
      const esc = src[i + 1];
      value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      i += 2;
    } else {
      value += src[i];
      i++;
    }
  }
  if (i >= src.length) throw new Error('Unterminated string');
  return { value, next: i + 1 };
}

// ── parser (tokens → AST) ────────────────────────────────────────────────────

type Expr =
  | { k: 'lit'; v: unknown }
  | { k: 'json' }
  | { k: 'node'; title: string }
  | { k: 'member'; o: Expr; p: string }
  | { k: 'index'; o: Expr; i: Expr }
  | { k: 'unary'; op: string; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr };

const BINARY_LEVELS: string[][] = [
  ['||'],
  ['&&'],
  ['===', '!==', '==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
];

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parseExpression(): Expr {
    return this.parseBinary(0);
  }

  expectEnd(): void {
    if (this.pos < this.tokens.length) throw new Error('Trailing tokens');
  }

  private parseBinary(level: number): Expr {
    if (level >= BINARY_LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    while (this.isOp(BINARY_LEVELS[level])) {
      const op = this.next().value as string;
      const right = this.parseBinary(level + 1);
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp(['!', '-'])) {
      const op = this.next().value as string;
      return { k: 'unary', op, e: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isOp(['.'])) {
        this.next();
        const name = this.next();
        if (name.type !== 'name') throw new Error('Expected property name');
        node = { k: 'member', o: node, p: name.value };
      } else if (this.isOp(['['])) {
        this.next();
        const index = this.parseExpression();
        this.expectOp(']');
        node = { k: 'index', o: node, i: index };
      } else {
        return node;
      }
    }
  }

  private parsePrimary(): Expr {
    const tok = this.next();
    if (!tok) throw new Error('Unexpected end');
    if (tok.type === 'num') return { k: 'lit', v: tok.value };
    if (tok.type === 'str') return { k: 'lit', v: tok.value };
    if (tok.type === 'name') {
      if (tok.value === 'true') return { k: 'lit', v: true };
      if (tok.value === 'false') return { k: 'lit', v: false };
      if (tok.value === 'null') return { k: 'lit', v: null };
      if (tok.value === '$json') return { k: 'json' };
      if (tok.value === '$node') {
        this.expectOp('[');
        const key = this.next();
        if (key.type !== 'str') throw new Error('$node expects a string key');
        this.expectOp(']');
        return { k: 'node', title: key.value };
      }
      throw new Error(`Unknown identifier '${tok.value}'`);
    }
    if (tok.type === 'op' && tok.value === '(') {
      const inner = this.parseExpression();
      this.expectOp(')');
      return inner;
    }
    throw new Error(`Unexpected token '${tok.value}'`);
  }

  private isOp(ops: string[]): boolean {
    const tok = this.tokens[this.pos];
    return !!tok && tok.type === 'op' && ops.includes(tok.value);
  }

  private next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error('Unexpected end');
    this.pos++;
    return tok;
  }

  private expectOp(op: string): void {
    const tok = this.next();
    if (tok.type !== 'op' || tok.value !== op) {
      throw new Error(`Expected '${op}'`);
    }
  }
}

// ── evaluator (AST → value) ──────────────────────────────────────────────────

function evaluate(node: Expr, ctx: EvalContext): unknown {
  switch (node.k) {
    case 'lit':
      return node.v;
    case 'json':
      return ctx.json;
    case 'node':
      return ctx.node?.(node.title);
    case 'member':
      return member(evaluate(node.o, ctx), node.p);
    case 'index': {
      const key = evaluate(node.i, ctx);
      return member(evaluate(node.o, ctx), key as string | number);
    }
    case 'unary':
      return node.op === '!'
        ? !truthy(evaluate(node.e, ctx))
        : -toNumber(evaluate(node.e, ctx));
    case 'bin':
      return binary(node.op, node.l, node.r, ctx);
  }
}

function binary(op: string, lNode: Expr, rNode: Expr, ctx: EvalContext): unknown {
  const l = evaluate(lNode, ctx);
  if (op === '&&') return truthy(l) ? evaluate(rNode, ctx) : l;
  if (op === '||') return truthy(l) ? l : evaluate(rNode, ctx);
  const r = evaluate(rNode, ctx);
  switch (op) {
    case '===':
      return l === r;
    case '!==':
      return l !== r;
    case '==':
      return looseEquals(l, r);
    case '!=':
      return !looseEquals(l, r);
    case '<':
      return compare(l, r) < 0;
    case '<=':
      return compare(l, r) <= 0;
    case '>':
      return compare(l, r) > 0;
    case '>=':
      return compare(l, r) >= 0;
    case '+':
      return typeof l === 'string' || typeof r === 'string'
        ? stringify(l) + stringify(r)
        : toNumber(l) + toNumber(r);
    case '-':
      return toNumber(l) - toNumber(r);
    case '*':
      return toNumber(l) * toNumber(r);
    case '/':
      return toNumber(l) / toNumber(r);
    case '%':
      return toNumber(l) % toNumber(r);
    default:
      return undefined;
  }
}

function member(obj: unknown, key: string | number): unknown {
  // Reading into null/undefined is a hard error (the upstream shape changed) —
  // mirrors JS `undefined.foo` and makes the node fail. A missing key on a real
  // object is fine (→ undefined).
  if (obj == null) {
    throw new Error(`Cannot read "${key}" of ${obj === null ? 'null' : 'undefined'}`);
  }
  if (typeof obj !== 'object') return undefined;
  return (obj as Record<string | number, unknown>)[key];
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Number(v);
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
