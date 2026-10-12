import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { imageInsertionEffect, imageInsertionField, imageInsertionTransaction } from '../../src/renderer/editor/imageInsertion';
import { modelFor } from '../document/helpers';

describe('image insertion paragraph boundaries', () => {
  it.each(['', 'body', 'body\n', 'body\n\n'])('inserts a standalone image after %j without changing preceding text', before => {
    let state = EditorState.create({ doc: before, extensions: imageInsertionField });
    state = state.update({ effects: imageInsertionEffect.of({ id: 'image', position: before.length }) }).state;
    state = state.update(imageInsertionTransaction(state, 'image', [{ alt: 'image', destination: 'assets/image.png' }])!).state;
    const source = state.doc.toString(); expect(source.startsWith(before)).toBe(true);
    const model = modelFor(source), paragraph = model.root.children.find(node => node.children.some(child => child.kind === 'image'))!;
    expect(paragraph.children.filter(child => child.kind === 'text').every(child => !child.text?.trim())).toBe(true);
    expect(model.images).toHaveLength(1); expect(model.images[0].destination).toBe('assets/image.png');
  });
  it('does not add empty text when an asynchronous insertion has no images or lost its bookmark', () => {
    const state = EditorState.create({ doc: 'body', extensions: imageInsertionField }).update({ effects: imageInsertionEffect.of({ id: 'image', position: 4 }) }).state;
    expect(imageInsertionTransaction(state, 'image', [])).toBeNull();
    expect(imageInsertionTransaction(state, 'missing', [{ alt: 'image', destination: 'assets/image.png' }])).toBeNull();
  });
});
