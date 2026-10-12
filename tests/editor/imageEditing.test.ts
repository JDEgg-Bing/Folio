import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { modelFor } from '../document/helpers';
import { imageParagraphParts } from '../../src/document/imageLayout';
import { semanticText } from '../../src/document/model';
import { imageInsertionEffect, imageInsertionField, imageInsertionTransaction } from '../../src/renderer/editor/imageInsertion';
import { previewSelection, previewSelectionField, verticalNavigation } from '../../src/renderer/editor/previewSelection';
import { documentPreviewField } from '../../src/renderer/editor/extensions/documentPreview';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { parsedState } from './parsedState';

describe('image line layout and stable navigation', () => {
  it.each(['above\n![a](a.png)\nbelow', 'above\n![a](a.png)\n![b](b.png)\nbelow', '- above\n  ![a](a.png)\n  below', '> above\n> ![a](a.png)\n> below'])('recognizes own-line images within a paragraph: %s', source => {
    const model = modelFor(source);
    expect(model.images.every(image => image.imageLayout === 'block')).toBe(true);
    const paragraph = model.root.children[0].kind === 'paragraph' ? model.root.children[0] : model.root.children[0].children[0].kind === 'paragraph' ? model.root.children[0].children[0] : model.root.children[0].children[0].children[0];
    const parts = imageParagraphParts(paragraph)!;
    expect(parts.map(part => part.kind)).toEqual(['paragraph', ...model.images.map(() => 'image'), 'paragraph']);
    expect(semanticText(parts[0])).toBe('above'); expect(semanticText(parts.at(-1)!)).toBe('below');
  });
  it.each(['before ![a](a.png) after', '**![a](a.png)**', '| ![a](a.png) |\n| --- |', '- [ ] ![a](a.png)'])('keeps inline contexts inline: %s', source => {
    expect(modelFor(source).images[0].imageLayout).toBe('inline');
  });
  it('replacement decoration covers only image source', () => {
    const source = 'above\n![a](a.png)\nbelow';
    const state = parsedState(EditorState.create({ doc: source, extensions: [documentPreviewField, ...createEditorExtensions(() => {})] }));
    const ranges: string[] = []; state.field(documentPreviewField).between(0, source.length, (from, to) => { ranges.push(source.slice(from, to)); });
    expect(ranges).toEqual(['![a](a.png)']);
  });
  it('vertical and pointer navigation freeze presentation, edits and explicit navigation resume it', () => {
    let state = EditorState.create({ doc: 'before\n![a](a.png)\nafter', extensions: previewSelectionField });
    state = state.update({ selection: { anchor: 12 }, annotations: verticalNavigation.of(true) }).state;
    expect(state.selection.main.head).toBe(12); expect(previewSelection(state).main.head).toBe(0);
    state = state.update({ selection: { anchor: 19 }, userEvent: 'select.pointer' }).state;
    expect(previewSelection(state).main.head).toBe(0);
    state = state.update({ selection: { anchor: 8 } }).state;
    expect(previewSelection(state).main.head).toBe(8);
    state = state.update({ changes: { from: 8, insert: 'x' }, selection: { anchor: 9 }, userEvent: 'input.type' }).state;
    expect(previewSelection(state).main.head).toBe(9);
  });
});

describe('async image paste selection', () => {
  const images = [{ destination: 'assets/a.png', alt: 'a' }];
  function state() { return EditorState.create({ doc: 'before\nreplace\nafter', extensions: [imageInsertionField, history()] }).update({ effects: imageInsertionEffect.of({ id: 'paste', position: 7, to: 14 }) }).state; }
  it('replaces the captured selection, reuses a newline and supports one undo/redo', () => {
    let current = state(); const original = current.doc.toString();
    current = current.update(imageInsertionTransaction(current, 'paste', images)!).state;
    expect(current.doc.toString()).toBe('before\n![a](<assets/a.png>)\nafter');
    expect(current.doc.sliceString(current.selection.main.head)).toBe('after');
    const dispatch = (tr: import('@codemirror/state').Transaction) => { current = tr.state; };
    expect(undo({ state: current, dispatch })).toBe(true); expect(current.doc.toString()).toBe(original);
    expect(redo({ state: current, dispatch })).toBe(true); expect(current.doc.toString()).toContain('![a]');
  });
  it('maps a pending selection through unrelated edits', () => {
    const current = state().update({ changes: { from: 0, insert: 'prefix ' } }).state;
    expect(current.update(imageInsertionTransaction(current, 'paste', images)!).state.doc.toString()).toBe('prefix before\n![a](<assets/a.png>)\nafter');
  });
  it('cancels a stale selection if its contents were edited', () => {
    const current = state().update({ changes: { from: 8, insert: 'new' } }).state;
    expect(imageInsertionTransaction(current, 'paste', images)).toBeNull();
  });
  it('preserves existing blank lines and inserts multiple images without extra empty lines', () => {
    let current = EditorState.create({ doc: 'before\n\n\nafter', extensions: imageInsertionField }).update({ effects: imageInsertionEffect.of({ id: 'paste', position: 7 }) }).state;
    current = current.update(imageInsertionTransaction(current, 'paste', [...images, ...images])!).state;
    expect(current.doc.toString()).toBe('before\n![a](<assets/a.png>)\n![a](<assets/a.png>)\n\nafter');
  });
});
