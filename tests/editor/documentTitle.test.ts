import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { undo, redo } from '@codemirror/commands';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { documentTitleField, readFirstHeading, resolveDocumentTitle } from '../../src/renderer/document/DocumentTitle';
import { safeMarkdownFilename, suggestedFilename } from '../../src/renderer/document/filenameSuggestion';
import { parsedState } from './parsedState';

function stateFor(source: string) {
  return parsedState(EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) }));
}
const untitled = { fileHandleId: null, displayName: 'Untitled' };
const saved = { fileHandleId: 'file-1', displayName: 'paper.md' };

describe('derived document title', () => {
  it('uses the first H1 after body paragraphs and H2', () => {
    expect(readFirstHeading(stateFor('介绍\n\n## 方法\n\n# 我的科研文章\n\n正文')).title).toBe('我的科研文章');
  });
  it('updates when the H1 content changes', () => {
    const state = stateFor('# 我的科研文章\n\n正文');
    const changed = state.update({ changes: { from: 2, to: 8, insert: '新标题' } }).state;
    expect(changed.field(documentTitleField).title).toBe('新标题');
  });
  it('uses only the first of multiple H1 headings', () => {
    expect(readFirstHeading(stateFor('# First\n\n# Second')).title).toBe('First');
  });
  it('restricts extracted text and inline syntax to the first H1 node', () => {
    expect(readFirstHeading(stateFor('# Title\n\nBody **content**\n\n## Section\n\n# Later')).title).toBe('Title');
  });
  it('falls back to the saved filename shared with status', () => {
    expect(resolveDocumentTitle(readFirstHeading(stateFor('## Section')).title, saved)).toBe('paper.md');
    expect(resolveDocumentTitle(null, { ...saved, displayName: 'research.v2.markdown' })).toBe('research.v2.markdown');
  });
  it('falls back to Untitled for an unsaved document', () => {
    expect(resolveDocumentTitle(null, untitled)).toBe('未命名文档');
  });
  it('does not mistake fenced code, indented code or escaped hashes for headings', () => {
    const source = '```md\n# Fake\n```\n\n    # Also fake\n\n\\# Literal\n\n# Real';
    expect(readFirstHeading(stateFor(source)).title).toBe('Real');
  });
  it('supports existing Markdown setext H1 syntax', () => {
    expect(readFirstHeading(stateFor('Research title\n===\n\n# Later')).title).toBe('Research title');
  });
  it('extracts readable inline content without heading/formatting/link markers', () => {
    expect(readFirstHeading(stateFor('# **研究** *方法* `code` [label](https://example.com) ###')).title).toBe('研究 方法 code label');
  });
  it('uses fallback when the first H1 is empty, rather than switching to a later H1', () => {
    const heading = readFirstHeading(stateFor('#\n\n# Later'));
    expect(heading.from).toBe(0);
    expect(heading.title).toBeNull();
    expect(resolveDocumentTitle(heading.title, saved)).toBe('paper.md');
  });
  it('refreshes fallback when H1 is removed or a different document is loaded', () => {
    const state = stateFor('# Title\n\nbody');
    const changed = state.update({ changes: { from: 0, to: 7, insert: 'Title' } }).state;
    expect(resolveDocumentTitle(changed.field(documentTitleField).title, saved)).toBe('paper.md');
    expect(stateFor('# Another').field(documentTitleField).title).toBe('Another');
  });
  it('drops the derived heading when replacing a formatted document with plain body text', () => {
    const source = '# Title\n\nBody **bold** *emphasis* `code`\n\n## Section\n\n### Subsection\n\n###### Note';
    const state = stateFor(source);
    const changed = state.update({ changes: { from: 0, to: state.doc.length, insert: '没有一级标题' } }).state;
    expect(changed.field(documentTitleField).title).toBeNull();
    expect(changed.doc.toString()).toBe('没有一级标题');
  });
  it('keeps the cached derived title for selection-only transactions', () => {
    const state = stateFor('# Title\n\nbody');
    expect(state.update({ selection: { anchor: 4 } }).state.field(documentTitleField)).toBe(state.field(documentTitleField));
  });
  it('finds H1 beyond the initially parsed range when the syntax tree advances', () => {
    let state = EditorState.create({ doc: ('Body text\n\n').repeat(4000) + '# Far below the viewport', extensions: createEditorExtensions(() => {}) });
    expect(ensureSyntaxTree(state, state.doc.length, 1000)).toBeTruthy();
    state = state.update({}).state;
    expect(state.field(documentTitleField).title).toBe('Far below the viewport');
  });
  it('updates title through undo/redo without adding document edits', () => {
    let state = stateFor('# Before');
    state = state.update({ changes: { from: 2, to: state.doc.length, insert: 'After' } }).state;
    const target = { get state() { return state; }, dispatch: (transaction: import('@codemirror/state').Transaction) => { state = transaction.state; } };
    expect(state.field(documentTitleField).title).toBe('After');
    expect(undo(target)).toBe(true);
    expect(state.field(documentTitleField).title).toBe('Before');
    expect(redo(target)).toBe(true);
    expect(state.field(documentTitleField).title).toBe('After');
    expect(state.doc.toString()).toBe('# After');
  });
  it('keeps document identity separate from saved filename', () => {
    const source = '# New Research Title';
    const state = stateFor(source);
    expect(resolveDocumentTitle(state.field(documentTitleField).title, saved)).toBe('New Research Title');
    expect(saved.displayName).toBe('paper.md');
    expect(state.doc.toString()).toBe(source);
  });
});

describe('safe suggested filename', () => {
  it('suggests the H1 for first Save and Save As', () => {
    expect(suggestedFilename('压缩扭转超材料研究', untitled)).toBe('压缩扭转超材料研究.md');
  });
  it('suggests Untitled when no title exists', () => {
    expect(suggestedFilename(null, untitled)).toBe('Untitled.md');
  });
  it('cleans Windows illegal characters, control characters and surrounding whitespace', () => {
    expect(safeMarkdownFilename('  研究<>:"/\\|?*\u0000\n标题  ')).toBe('研究标题.md');
  });
  it.each(['', '   ', '<>:/\\|?*', '...   '])('uses a valid fallback for empty/invalid title %j', (title) => {
    expect(safeMarkdownFilename(title)).toBe('Untitled.md');
  });
  it.each(['CON', 'nul.txt', 'COM1', 'LPT9', 'COM¹'])('handles Windows reserved device name %s', (title) => {
    expect(safeMarkdownFilename(title)).toBe(`_${title}.md`);
  });
  it('strips trailing dots and spaces', () => {
    expect(safeMarkdownFilename(' Research...   ')).toBe('Research.md');
  });
  it('limits long filenames without splitting a Unicode surrogate pair', () => {
    expect(safeMarkdownFilename('研'.repeat(200))).toBe('研'.repeat(120) + '.md');
    expect(safeMarkdownFilename('a'.repeat(119) + '😀')).toBe('a'.repeat(119) + '.md');
  });
  it('retains the disk filename as the suggestion for an already saved file', () => {
    expect(suggestedFilename('New Research Title', saved)).toBe('paper.md');
  });
});
