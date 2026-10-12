import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { imageCropTransaction, normalizeCropRect } from '../../src/renderer/editor/imageCrop';
import { modelFor } from '../document/helpers';

describe('image cropping source edits', () => {
  it.each(['![**图**](old.png "原始标题")', '![图](<old path.png> \'标题\')', '![a\\]b](C:\\notes\\image.png)'])('keeps alt markup and title in %s', image => {
    const source = `before\n\n${image}\n\nafter`, node = modelFor(source).images[0];
    const state = EditorState.create({ doc: source });
    const transaction = imageCropTransaction(state, node, 'assets/cropped.png')!;
    const next = state.update(transaction).state.doc.toString();
    expect(next).toBe(source.replace(/(?:old\.png|<old path\.png>|C:\\notes\\image\.png)/, '<assets/cropped.png>'));
    expect(modelFor(next).images[0].destination).toBe('assets/cropped.png');
  });
  it.each(['![**图**][ref]', '![ref][]', '![ref]'])('converts only the cropped reference occurrence %s', image => {
    const source = `${image}\n\n![other][ref]\n\n[ref]: old.png "title"`, node = modelFor(source).images[0];
    const state = EditorState.create({ doc: source });
    const next = state.update(imageCropTransaction(state, node, 'assets/crop.png')!).state.doc.toString();
    expect(modelFor(next).images.map(node => node.destination)).toEqual(['assets/crop.png', 'old.png']);
    expect(next.endsWith('![other][ref]\n\n[ref]: old.png "title"')).toBe(true);
    if (image.includes('**')) expect(next.startsWith('![**图**](<assets/crop.png>)')).toBe(true);
  });
  it('isolates cropping from surrounding edits and supports one undo/redo', () => {
    const source = '- [ ] ![image](old.png)\n\nend';
    let state = EditorState.create({ doc: source, extensions: history() });
    state = state.update(imageCropTransaction(state, modelFor(source).images[0], 'assets/crop.png')!).state;
    const cropped = state.doc.toString();
    const target = { get state() { return state; }, dispatch: (transaction: import('@codemirror/state').Transaction) => { state = transaction.state; } };
    expect(undo(target)).toBe(true); expect(state.doc.toString()).toBe(source);
    expect(redo(target)).toBe(true); expect(state.doc.toString()).toBe(cropped);
  });
  it('refuses a stale image range after source changes', () => {
    const source = '![image](old.png)', node = modelFor(source).images[0];
    expect(imageCropTransaction(EditorState.create({ doc: '![image](new.png)' }), node, 'assets/crop.png')).toBeNull();
  });
});
describe('crop pixel bounds', () => {
  it('clamps reversed, fractional and nonfinite input to valid pixels', () => {
    expect(normalizeCropRect({ x: -10, y: 20.4, width: 1000, height: 0 }, { width: 100, height: 60 })).toEqual({ x: 0, y: 20, width: 100, height: 1 });
    expect(normalizeCropRect({ x: 1000, y: Infinity, width: NaN, height: 100 }, { width: 100, height: 60 })).toEqual({ x: 99, y: 0, width: 1, height: 60 });
  });
});
