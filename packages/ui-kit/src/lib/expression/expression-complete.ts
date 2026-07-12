export interface ExpressionNodeScope {
  title: string;
  output: unknown;
}

export interface ExpressionScope {
  json?: unknown;
  trigger?: unknown;
  nodes?: ExpressionNodeScope[];
}

export type ExpressionCompletionKind = 'root' | 'node' | 'key' | 'index';

export interface ExpressionCompletionOption {
  label: string;
  insert: string;
  detail?: string;
  kind: ExpressionCompletionKind;
}

export interface ExpressionCompletion {
  from: number;
  to: number;
  options: ExpressionCompletionOption[];
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function completeAt(
  text: string,
  caret: number,
  scope: ExpressionScope,
): ExpressionCompletion | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  const tokenStart = text.lastIndexOf('$', safeCaret - 1);
  if (tokenStart < 0) return null;

  const token = text.slice(tokenStart, safeCaret);
  if (!token || /\n/.test(token)) return null;

  const roots = rootCompletion(token, tokenStart, safeCaret, scope);
  if (roots) return roots;

  const nodeTitle = nodeTitleCompletion(token, tokenStart, safeCaret, scope);
  if (nodeTitle) return nodeTitle;

  if (token.startsWith('$json')) {
    return pathCompletion(
      scope.json,
      token.slice('$json'.length),
      '$json'.length,
      tokenStart,
      safeCaret,
    );
  }

  if (token.startsWith('$trigger')) {
    return pathCompletion(
      scope.trigger,
      token.slice('$trigger'.length),
      '$trigger'.length,
      tokenStart,
      safeCaret,
    );
  }

  const nodeMatch = /^\$node\["((?:\\.|[^"\\])*)"\](.*)$/.exec(token);
  if (nodeMatch) {
    const title = unescapeText(nodeMatch[1]);
    const node = scope.nodes?.find((item) => item.title === title);
    return pathCompletion(
      node?.output,
      nodeMatch[2],
      token.length - nodeMatch[2].length,
      tokenStart,
      safeCaret,
    );
  }

  return null;
}

function rootCompletion(
  token: string,
  tokenStart: number,
  caret: number,
  scope: ExpressionScope,
): ExpressionCompletion | null {
  if (!/^\$[A-Za-z]*$/.test(token)) return null;

  const options: ExpressionCompletionOption[] = [];
  if ('$json'.startsWith(token) && scope.json !== undefined) {
    options.push({
      label: '$json',
      insert: '$json',
      detail: typeName(scope.json),
      kind: 'root',
    });
  }

  if ('$trigger'.startsWith(token) && scope.trigger !== undefined) {
    options.push({
      label: '$trigger',
      insert: '$trigger',
      detail: typeName(scope.trigger),
      kind: 'root',
    });
  }

  for (const node of scope.nodes ?? []) {
    const insert = `$node["${escapeText(node.title)}"]`;
    if (insert.toLowerCase().startsWith(token.toLowerCase())) {
      options.push({
        label: insert,
        insert,
        detail: typeName(node.output),
        kind: 'node',
      });
    }
  }

  return options.length ? { from: tokenStart, to: caret, options } : null;
}

function nodeTitleCompletion(
  token: string,
  tokenStart: number,
  caret: number,
  scope: ExpressionScope,
): ExpressionCompletion | null {
  const match = /^\$node\[(?:"((?:\\.|[^"\\])*)?)?$/.exec(token);
  if (!match) return null;

  const prefix = unescapeText(match[1] ?? '').toLowerCase();
  const options = (scope.nodes ?? [])
    .filter((node) => node.title.toLowerCase().startsWith(prefix))
    .map<ExpressionCompletionOption>((node) => ({
      label: node.title,
      insert: `$node["${escapeText(node.title)}"]`,
      detail: typeName(node.output),
      kind: 'node',
    }));

  return options.length ? { from: tokenStart, to: caret, options } : null;
}

function pathCompletion(
  value: unknown,
  rest: string,
  rootLength: number,
  tokenStart: number,
  caret: number,
): ExpressionCompletion | null {
  const dot = /^(.*)\.([A-Za-z_$][\w$]*)?$/.exec(rest);
  if (dot) {
    const target = resolvePath(value, dot[1]);
    return propertyOptions(
      target,
      dot[2] ?? '',
      tokenStart + rootLength + dot[1].length,
      caret,
    );
  }

  const quoted = /^(.*)\["((?:\\.|[^"\\])*)$/.exec(rest);
  if (quoted) {
    const target = resolvePath(value, quoted[1]);
    return propertyOptions(
      target,
      unescapeText(quoted[2]).toLowerCase(),
      tokenStart + rootLength + quoted[1].length,
      caret,
      true,
    );
  }

  const index = /^(.*)\[(\d*)$/.exec(rest);
  if (index) {
    const target = resolvePath(value, index[1]);
    if (!Array.isArray(target)) return null;
    const prefix = index[2];
    const options = target
      .map((_, i) => String(i))
      .filter((i) => i.startsWith(prefix))
      .map<ExpressionCompletionOption>((i) => ({
        label: `[${i}]`,
        insert: `[${i}]`,
        detail: typeName(target[Number(i)]),
        kind: 'index',
      }));
    return options.length
      ? {
          from: tokenStart + rootLength + index[1].length,
          to: caret,
          options,
        }
      : null;
  }

  return null;
}

function propertyOptions(
  value: unknown,
  prefix: string,
  from: number,
  to: number,
  forceBracket = false,
): ExpressionCompletion | null {
  if (!isRecord(value)) return null;
  const normalized = prefix.toLowerCase();
  const options = Object.keys(value)
    .filter((key) => key.toLowerCase().startsWith(normalized))
    .sort((a, b) => a.localeCompare(b))
    .map<ExpressionCompletionOption>((key) => {
      const insert =
        !forceBracket && IDENTIFIER.test(key)
          ? `.${key}`
          : `["${escapeText(key)}"]`;
      return {
        label: insert,
        insert,
        detail: typeName(value[key]),
        kind: 'key',
      };
    });

  return options.length ? { from, to, options } : null;
}

function resolvePath(value: unknown, path: string): unknown {
  let current = value;
  let index = 0;

  while (index < path.length) {
    if (path[index] === '.') {
      const match = /\.([A-Za-z_$][\w$]*)/.exec(path.slice(index));
      if (!match || match.index !== 0 || !isRecord(current)) return undefined;
      current = current[match[1]];
      index += match[0].length;
      continue;
    }

    if (path[index] === '[') {
      const rest = path.slice(index);
      const stringMatch = /^\["((?:\\.|[^"\\])*)"\]/.exec(rest);
      if (stringMatch) {
        if (!isRecord(current)) return undefined;
        current = current[unescapeText(stringMatch[1])];
        index += stringMatch[0].length;
        continue;
      }

      const indexMatch = /^\[(\d+)\]/.exec(rest);
      if (indexMatch) {
        if (!Array.isArray(current)) return undefined;
        current = current[Number(indexMatch[1])];
        index += indexMatch[0].length;
        continue;
      }
    }

    return undefined;
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeText(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  return typeof value;
}
