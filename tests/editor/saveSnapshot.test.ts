import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { SavedDocumentTracker } from '../../src/renderer/editor/EditorController';
import { writeSaveSnapshot } from '../../src/renderer/editor/saveSnapshot';

describe('save snapshots', () => {
  it('keeps edits made during a save dirty and records only the saved snapshot', async () => {
    const initial = EditorState.create({ doc: 'A' });
    const tracker = new SavedDocumentTracker(initial.doc);
    const snapshot = tracker.captureSaveSnapshot(initial.doc);
    let finishWrite!: (success: boolean) => void;
    const pendingWrite = new Promise<boolean>((resolve) => { finishWrite = resolve; });
    let savedDoc = initial.doc;
    const saving = writeSaveSnapshot(snapshot, async (text) => {
      expect(text).toBe('A');
      return pendingWrite;
    }, (doc) => { tracker.markSaved(doc); savedDoc = doc; });

    const edited = initial.update({ changes: { from: 0, to: 1, insert: 'B' } }).state;
    expect(edited.doc.toString()).toBe('B');
    finishWrite(true);
    await expect(saving).resolves.toBe(true);

    expect(edited.doc.toString()).toBe('B');
    expect(tracker.isDirty(edited.doc)).toBe(true);
    expect(savedDoc.toString()).toBe('A');
  });

  it('returns to clean when undo-equivalent content matches the saved document', () => {
    const saved = EditorState.create({ doc: 'A' });
    const tracker = new SavedDocumentTracker(saved.doc);
    const changed = saved.update({ changes: { from: 1, insert: 'B' } }).state;
    expect(tracker.isDirty(changed.doc)).toBe(true);
    const restored = changed.update({ changes: { from: 1, to: 2, insert: '' } }).state;
    expect(tracker.isDirty(restored.doc)).toBe(false);
  });

  it('does not mark a cancelled Save As snapshot saved', async () => {
    const state = EditorState.create({ doc: 'A' });
    const tracker = new SavedDocumentTracker(state.doc);
    const changed = state.update({ changes: { from: 1, insert: 'B' } }).state;
    const snapshot = tracker.captureSaveSnapshot(changed.doc);
    await expect(writeSaveSnapshot(snapshot, async () => false, (doc) => tracker.markSaved(doc))).resolves.toBe(false);
    expect(tracker.isDirty(changed.doc)).toBe(true);
  });

  it('keeps a failed save dirty', async () => {
    const state = EditorState.create({ doc: 'A' });
    const tracker = new SavedDocumentTracker(state.doc);
    const changed = state.update({ changes: { from: 1, insert: 'B' } }).state;
    const snapshot = tracker.captureSaveSnapshot(changed.doc);
    await expect(writeSaveSnapshot(snapshot, async () => { throw new Error('disk full'); }, (doc) => tracker.markSaved(doc))).rejects.toThrow('disk full');
    expect(tracker.isDirty(changed.doc)).toBe(true);
  });
});
