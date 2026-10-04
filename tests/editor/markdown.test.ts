import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';

describe('Markdown syntax tree', () => {
  it('recognizes required inline and block constructs', () => {
    const state = EditorState.create({ doc: '# Heading\n\n**strong** *em* ~~gone~~ `code`\n\n- item\n\n> quote\n\n[link](https://example.com)\n\n---\n\n```js\nx\n```', extensions: [markdown({ extensions: [GFM] })] });
    const names = new Set<string>();
    syntaxTree(state).iterate({ enter: (node) => { names.add(node.name); } });
    for (const name of ['ATXHeading1', 'StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode', 'ListItem', 'Blockquote', 'Link', 'HorizontalRule', 'FencedCode']) {
      expect(names.has(name), name).toBe(true);
    }
  });

  it('accepts incomplete Markdown without changing its source', () => {
    const source = '**\n[hello](\n```\n# ';
    const state = EditorState.create({ doc: source, extensions: [markdown({ extensions: [GFM] })] });
    expect(state.doc.toString()).toBe(source);
    expect(() => syntaxTree(state).toString()).not.toThrow();
  });
});
