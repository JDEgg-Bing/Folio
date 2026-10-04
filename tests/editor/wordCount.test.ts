import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { countWritingWords, wordCountField } from '../../src/renderer/editor/wordCount';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { statusBarContent } from '../../src/renderer/ui/StatusBar';

describe('incremental writing word count and status', () => {
  it.each([['', 0], ['中文 English 2026', 4], ['科研 **报告** `code`', 5], ['𠀀研究 a-b 12.5 😀', 7]])('counts source text %j using the displayed convention', (text, expected) => {
    expect(countWritingWords(text)).toBe(expected);
  });
  it('updates correctly across insertions, removals, line merges and overlapping changed lines', () => {
    let state = EditorState.create({ doc: '第一段 English\n\n第二段 report 12\n\n末段', extensions: wordCountField });
    const check = () => expect(state.field(wordCountField)).toBe(countWritingWords(state.doc.toString()));
    check();
    state = state.update({ changes: [{ from: 1, to: 2, insert: '新\n内容' }, { from: 4, insert: 'new ' }] }).state; check();
    state = state.update({ changes: { from: 0, to: state.doc.length, insert: '中文 words\n\n新段\nmore text' } }).state; check();
    state = state.update({ changes: [{ from: 2, insert: ' extra ' }, { from: 5, insert: '测试' }] }).state; check();
    state = state.update({ changes: { from: 1, to: state.doc.length - 2, insert: '' } }).state; check();
    state = state.update({ changes: { from: 0, to: state.doc.length, insert: '' } }).state; check();
  });
  it('does not flatten the whole document for a local edit or selection change', () => {
    let state = EditorState.create({ doc: ('正文 English\n').repeat(2000), extensions: wordCountField });
    const stringify = vi.spyOn(state.doc, 'toString').mockImplementation(() => { throw new Error('Full document scan'); });
    const previous = state.field(wordCountField);
    state = state.update({ changes: { from: 2, insert: '新' } }).state;
    expect(state.field(wordCountField)).toBe(previous + 1);
    stringify.mockRestore();
    state = state.update({ selection: { anchor: 20 } }).state;
    expect(state.field(wordCountField)).toBe(previous + 1);
  });
  it('keeps the count correct through undo, redo and a fresh document state', () => {
    let state = EditorState.create({ doc: '正文 report', extensions: createEditorExtensions(() => {}) });
    state = state.update({ changes: { from: state.doc.length, insert: ' 新内容' } }).state;
    const target = { get state() { return state; }, dispatch: (transaction: import('@codemirror/state').Transaction) => { state = transaction.state; } };
    expect(state.field(wordCountField)).toBe(6);
    expect(undo(target)).toBe(true); expect(state.field(wordCountField)).toBe(3);
    expect(redo(target)).toBe(true); expect(state.field(wordCountField)).toBe(6);
    expect(EditorState.create({ doc: '', extensions: wordCountField }).field(wordCountField)).toBe(0);
  });
  it('presents disk filename, saved/dirty state, live count and cursor without coupling filename to H1', () => {
    const document = { displayName: '论文引言.md', fileHandleId: 'file-1', dirty: false };
    const snapshot = { wordCount: 1842, line: 26, column: 11 };
    expect(statusBarContent(document, snapshot)).toEqual({ name: '论文引言.md', saved: '已保存', words: '1,842 字', position: '行 26，列 11' });
    expect(statusBarContent({ ...document, dirty: true }, { ...snapshot, wordCount: 1843, column: 12 })).toMatchObject({ name: '论文引言.md', saved: '已修改', words: '1,843 字', position: '行 26，列 12' });
    expect(statusBarContent({ ...document, fileHandleId: null, dirty: true }, snapshot).name).toBe('未命名文档');
    expect(statusBarContent({ ...document, fileHandleId: null }, snapshot).saved).toBe('未保存');
    expect(statusBarContent({ ...document, displayName: 'results.md' }, snapshot).name).toBe('results.md');
  });
});
