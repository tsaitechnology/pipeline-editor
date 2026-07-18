import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const contentDir = path.join(root, 'docs/content');
const generatedPath = path.join(root, 'apps/docs/src/app/generated-docs.ts');
const publicDocsDir = path.join(root, 'apps/docs/public/content');
const publicLlmsPath = path.join(root, 'apps/docs/public/llms.txt');
const publicStaticDir = path.join(root, 'apps/docs/public/static');

const LANGUAGES = new Set(['bash', 'css', 'typescript']);

function parseFrontmatter(source, file) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const attrs = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    attrs[key] = key === 'order' ? Number(value) : value;
  }
  for (const key of ['id', 'label', 'title', 'order']) {
    if (attrs[key] === undefined || attrs[key] === '') {
      throw new Error(`${file}: missing frontmatter field "${key}"`);
    }
  }
  return { attrs, body: source.slice(match[0].length) };
}

function parseFenceInfo(info) {
  const [language = 'typescript', ...rest] = info.trim().split(/\s+/);
  const titleMatch = rest.join(' ').match(/title="([^"]+)"/);
  return {
    language: LANGUAGES.has(language) ? language : 'typescript',
    title: titleMatch?.[1],
  };
}

function parseTable(lines, start) {
  const header = lines[start]
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  let index = start + 2;
  const rows = [];
  while (index < lines.length && /^\s*\|/.test(lines[index])) {
    rows.push(
      lines[index]
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
    index += 1;
  }
  return {
    token: {
      type: 'table',
      columns: header,
      rows,
    },
    next: index,
  };
}

function flushParagraph(tokens, paragraph) {
  if (!paragraph.length) return;
  tokens.push({ type: 'paragraph', text: paragraph.join(' ') });
  paragraph.length = 0;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderToken(token) {
  switch (token.type) {
    case 'paragraph':
      return `<p>${inlineMarkdown(token.text)}</p>`;
    case 'heading':
      return `<h${token.level}>${escapeHtml(token.text)}</h${token.level}>`;
    case 'code':
      return `<figure><figcaption>${escapeHtml(token.title ?? token.language)}</figcaption><pre><code>${escapeHtml(token.code)}</code></pre></figure>`;
    case 'table':
      return `<table><thead><tr>${token.columns.map((column) => `<th>${inlineMarkdown(column)}</th>`).join('')}</tr></thead><tbody>${token.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`,
        )
        .join('')}</tbody></table>`;
    case 'list':
      return `<ul>${token.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`;
    case 'callout':
      return `<aside class="${escapeHtml(token.variant)}"><strong>${escapeHtml(token.title)}</strong><p>${inlineMarkdown(token.text)}</p></aside>`;
    case 'demo':
      return `<aside class="demo"><strong>Interactive demo:</strong> ${escapeHtml(token.id)}. Open the Angular docs site for live controls.</aside>`;
    default:
      throw new Error(`Unsupported token type: ${token.type}`);
  }
}

function renderStaticPage(title, body, nav) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Pipeline Editor Docs</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #09090b; color: #e4e4e7; }
    body { margin: 0; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
    nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 32px; }
    nav a, a { color: #8fb7ff; }
    nav a { border: 1px solid #27272a; border-radius: 4px; padding: 6px 9px; text-decoration: none; }
    h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1; margin: 0 0 20px; }
    h2 { margin-top: 40px; }
    p, li, td, th { line-height: 1.65; color: #c7c7d1; }
    code { border: 1px solid #27272a; border-radius: 4px; background: #18181b; padding: 0 4px; }
    pre { overflow: auto; border: 1px solid #27272a; border-radius: 6px; background: #111113; padding: 16px; }
    pre code { border: 0; padding: 0; background: transparent; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #27272a; padding: 8px 10px; text-align: left; vertical-align: top; }
    aside { border: 1px solid #27272a; border-radius: 6px; padding: 12px 14px; background: #141418; margin: 18px 0; }
    figcaption { margin: 0 0 8px; color: #a1a1aa; font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <nav>${nav}</nav>
    ${body}
  </main>
</body>
</html>
`;
}

async function writeStaticHtml(sections) {
  await rm(publicStaticDir, { recursive: true, force: true });
  await mkdir(publicStaticDir, { recursive: true });

  const nav = sections
    .map(
      (section) =>
        `<a href="${section.id}.html">${escapeHtml(section.label)}</a>`,
    )
    .join('');
  const allSections = sections
    .map(
      (section) =>
        `<section id="${escapeHtml(section.id)}"><h1>${escapeHtml(section.title)}</h1>${section.tokens
          .map(renderToken)
          .join('\n')}</section>`,
    )
    .join('\n');

  await writeFile(
    path.join(publicStaticDir, 'index.html'),
    renderStaticPage('Static documentation', allSections, nav),
  );

  for (const section of sections) {
    await writeFile(
      path.join(publicStaticDir, `${section.id}.html`),
      renderStaticPage(
        section.title,
        `<h1>${escapeHtml(section.title)}</h1>${section.tokens.map(renderToken).join('\n')}`,
        nav,
      ),
    );
  }
}

function parseBody(body, file) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const tokens = [];
  const paragraph = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph(tokens, paragraph);
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph(tokens, paragraph);
      const info = parseFenceInfo(line.slice(3));
      index += 1;
      const code = [];
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      if (index >= lines.length)
        throw new Error(`${file}: unclosed code fence`);
      tokens.push({ type: 'code', ...info, code: code.join('\n') });
      index += 1;
      continue;
    }

    if (line.startsWith(':::demo ')) {
      flushParagraph(tokens, paragraph);
      tokens.push({ type: 'demo', id: line.slice(':::demo '.length).trim() });
      index += 1;
      if (lines[index]?.trim() === ':::') index += 1;
      continue;
    }

    if (line.startsWith(':::callout ')) {
      flushParagraph(tokens, paragraph);
      const [, variant = 'info', ...titleParts] = line.split(/\s+/);
      index += 1;
      const text = [];
      while (index < lines.length && lines[index].trim() !== ':::') {
        text.push(lines[index]);
        index += 1;
      }
      if (index >= lines.length) throw new Error(`${file}: unclosed callout`);
      tokens.push({
        type: 'callout',
        variant,
        title: titleParts.join(' '),
        text: text.join(' ').trim(),
      });
      index += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushParagraph(tokens, paragraph);
      tokens.push({
        type: 'heading',
        level: 3,
        text: line.replace(/^###\s+/, ''),
      });
      index += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && /^\s*\|/.test(lines[index + 1] ?? '')) {
      flushParagraph(tokens, paragraph);
      const parsed = parseTable(lines, index);
      tokens.push(parsed.token);
      index = parsed.next;
      continue;
    }

    if (/^-\s+/.test(line)) {
      flushParagraph(tokens, paragraph);
      const items = [];
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ''));
        index += 1;
      }
      tokens.push({ type: 'list', items });
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph(tokens, paragraph);
  return tokens;
}

async function main() {
  const files = (await readdir(contentDir))
    .filter((file) => file.endsWith('.md'))
    .sort();

  const sections = [];
  for (const file of files) {
    const source = await readFile(path.join(contentDir, file), 'utf8');
    const { attrs, body } = parseFrontmatter(source, file);
    sections.push({
      id: attrs.id,
      label: attrs.label,
      title: attrs.title,
      order: attrs.order,
      sourcePath: `docs/content/${file}`,
      tokens: parseBody(body, file),
    });
  }
  sections.sort((a, b) => a.order - b.order);

  const generated = `/* This file is generated by tools/generate-docs-content.mjs. Do not edit directly. */

export type DocCodeLanguage = 'bash' | 'css' | 'typescript';
export type DocToken =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 3; text: string }
  | { type: 'code'; language: DocCodeLanguage; title?: string; code: string }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; variant: 'info' | 'warning'; title: string; text: string }
  | { type: 'demo'; id: string };

export interface DocSection {
  id: string;
  label: string;
  title: string;
  order: number;
  sourcePath: string;
  tokens: DocToken[];
}

export const DOC_SECTIONS: readonly DocSection[] = ${JSON.stringify(sections, null, 2)};
`;

  await writeFile(generatedPath, generated);

  await rm(publicDocsDir, { recursive: true, force: true });
  await mkdir(publicDocsDir, { recursive: true });
  for (const file of files) {
    const source = await readFile(path.join(contentDir, file), 'utf8');
    await writeFile(path.join(publicDocsDir, file), source);
  }

  const llms = [
    '# Pipeline Editor',
    '',
    'This file is a navigation index, not a second documentation source.',
    'Canonical documentation lives in the Markdown files below and is rendered',
    'by the docs application.',
    '',
    'Canonical documentation source:',
    '',
    ...sections.map(
      (section) =>
        `- /content/${path.basename(section.sourcePath)} - ${section.title}`,
    ),
    '',
    'Repository entrypoints:',
    '',
    '- /README.md',
    '- /ARCHITECTURE.md',
    '- /packages/pipeline-ui-kit/README.md',
    '- /packages/board/feature/README.md',
    '',
  ].join('\n');
  await writeFile(publicLlmsPath, llms);
  await writeStaticHtml(sections);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
