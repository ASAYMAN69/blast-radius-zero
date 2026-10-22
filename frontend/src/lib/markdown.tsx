import type { ReactNode } from 'react';

/**
 * A very small, **safe** Markdown renderer.
 *
 * The agent's output is model-generated text. It is never HTML and it is
 * never treated as HTML: this module turns a Markdown-ish string into React
 * elements and nothing else. There is no `dangerouslySetInnerHTML`, no
 * `innerHTML`, no `eval`, no `new Function` anywhere in the console, and there
 * is no HTML parser in this file. A `<script>` tag in the agent's output is
 * rendered as the literal text `<script>`.
 *
 * Supported, because these are the shapes the agent actually produces:
 *   - fenced code blocks
 *   - pipe tables
 *   - ATX headings
 *   - bullet and numbered lists
 *   - paragraphs
 *   - inline `code`, **bold**, and *italic*
 */

type InlineToken =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'bold'; readonly value: string }
  | { readonly kind: 'italic'; readonly value: string };

const INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  INLINE_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ kind: 'text', value: text.slice(cursor, index) });
    }
    const raw = match[0];
    if (raw.startsWith('`')) {
      tokens.push({ kind: 'code', value: raw.slice(1, -1) });
    } else if (raw.startsWith('**')) {
      tokens.push({ kind: 'bold', value: raw.slice(2, -2) });
    } else {
      tokens.push({ kind: 'italic', value: raw.slice(1, -1) });
    }
    cursor = index + raw.length;
  }
  if (cursor < text.length) {
    tokens.push({ kind: 'text', value: text.slice(cursor) });
  }
  return tokens;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    const key = `${keyPrefix}-${String(index)}`;
    switch (token.kind) {
      case 'code':
        return (
          <code className="md-code" key={key}>
            {token.value}
          </code>
        );
      case 'bold':
        return <strong key={key}>{token.value}</strong>;
      case 'italic':
        return <em key={key}>{token.value}</em>;
      case 'text':
      default:
        return <span key={key}>{token.value}</span>;
    }
  });
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isBlockStart(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (line.trimStart().startsWith('```')) return true;
  if (/^#{1,4}\s/.test(line)) return true;
  if (/^\s*[-*]\s+/.test(line)) return true;
  if (/^\s*\d+[.)]\s+/.test(line)) return true;
  if (line.trim().startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
    return true;
  }
  return false;
}

export function renderMarkdown(source: string): ReactNode {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    // fenced code
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // consume the closing fence
      blocks.push(
        <pre className="md-pre" key={`block-${String(key++)}`}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // pipe table
    if (line.trim().startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push(
        <div className="md-table-wrap" key={`block-${String(key++)}`}>
          <table className="md-table">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`h-${String(cellIndex)}`} scope="col">
                    {renderInline(cell, `h-${String(cellIndex)}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`r-${String(rowIndex)}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`c-${String(cellIndex)}`}>{renderInline(cell, `c-${String(cellIndex)}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = heading[2] ?? '';
      const Tag = (['h4', 'h4', 'h3', 'h2'] as const)[Math.min(level, 4) - 1] ?? 'h3';
      blocks.push(
        <Tag className="md-heading" key={`block-${String(key++)}`}>
          {renderInline(text, `hd-${String(key)}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    // list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        const matches = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(candidate) : /^\s*[-*]\s+(.*)$/.exec(candidate);
        if (matches === null) break;
        items.push(matches[1] ?? '');
        index += 1;
      }
      const children = items.map((item, itemIndex) => (
        <li key={`li-${String(itemIndex)}`}>{renderInline(item, `li-${String(itemIndex)}`)}</li>
      ));
      blocks.push(
        ordered ? (
          <ol className="md-list" key={`block-${String(key++)}`}>
            {children}
          </ol>
        ) : (
          <ul className="md-list" key={`block-${String(key++)}`}>
            {children}
          </ul>
        ),
      );
      continue;
    }

    // blank line
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // paragraph — consume until the next block starts
    const paragraph: string[] = [];
    while (index < lines.length && !isBlockStart(lines, index) && (lines[index] ?? '').trim() !== '') {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push(
        <p className="md-paragraph" key={`block-${String(key++)}`}>
          {renderInline(paragraph.join(' '), `p-${String(key)}`)}
        </p>,
      );
    }
  }

  return blocks;
}
