import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { PreferencesService, PREFERENCES_KEY } from '../../src/renderer/preferences/PreferencesService';
import { DEFAULT_DOCUMENT_FEATURES } from '../../src/renderer/preferences/DocumentFeatures';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { documentPreviewField, previewEnvironment, renderMath } from '../../src/renderer/editor/extensions/documentPreview';
import { composingEffect } from '../../src/renderer/editor/documentStructure';
import { imageInsertionField, imageInsertionEffect, imageInsertionTransaction } from '../../src/renderer/editor/imageInsertion';
import { exportDocument, type ExportAdapter } from '../../src/document/export/ExportAdapter';
import { modelFor } from './helpers';
import { menuTemplate } from '../../src/main/menu';
import { chinesePhrases, userError } from '../../src/shared/chinese';
import { SavedDocumentTracker } from '../../src/renderer/editor/EditorController';
import { Compartment } from '@codemirror/state';
import { parsedState } from '../editor/parsedState';

function storage() { const data = new Map<string,string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key,value); } }; }
describe('document features and rendering boundaries', () => {
  it.each([1,2])('migrates preferences v%s without resetting appearance', version => {
    const backend = storage(); backend.setItem(PREFERENCES_KEY, JSON.stringify({ version, writingAppearance: { ...DEFAULT_WRITING_APPEARANCE, fontSize: 19 } }));
    const preferences = new PreferencesService(backend);
    expect(preferences.getSnapshot().writingAppearance.fontSize).toBe(19);
    expect(preferences.getSnapshot().documentFeatures).toEqual(DEFAULT_DOCUMENT_FEATURES);
  });
  it.each(Object.keys(DEFAULT_DOCUMENT_FEATURES) as (keyof typeof DEFAULT_DOCUMENT_FEATURES)[])('persists %s independently', key => {
    const backend = storage(), preferences = new PreferencesService(backend), before = preferences.getSnapshot();
    preferences.updateDocumentFeatures({ [key]: !before.documentFeatures[key] });
    expect(new PreferencesService(backend).getSnapshot()).toEqual(preferences.getSnapshot());
    expect(preferences.getSnapshot().writingAppearance).toEqual(before.writingAppearance);
  });
  it('falls back for invalid feature values and retries persistence failures', () => {
    const preferences = new PreferencesService({ getItem: () => JSON.stringify({ version: 3, writingAppearance: {}, documentFeatures: { outlineVisible: 'yes', mathPreview: false } }), setItem: () => { throw new Error('disk'); } });
    expect(preferences.getSnapshot().documentFeatures).toMatchObject({ outlineVisible: false, mathPreview: false, imagePreview: true });
    preferences.updateDocumentFeatures({ tablePreview: false }); expect(preferences.getSnapshot().persistenceError).toBeTruthy();
  });
  it('supports valid common equations and fails safely for unsupported input', () => {
    expect(renderMath('\\frac{a}{b}+\\sqrt{x}', false)).toContain('katex');
    expect(renderMath('\\begin{aligned}x&=1\\\\y&=2\\end{aligned}', true)).toContain('katex');
    expect(() => renderMath('\\invalidcommand', false)).toThrow();
    expect(() => renderMath('x'.repeat(50001), false)).toThrow('公式过长');
    expect(renderMath('\\href{javascript:alert(1)}{x}', false)).not.toContain('href="javascript:');
  });
  it('creates block/inline previews without editing source and preserves their DOM ranges during composition', () => {
    const source = '正文\n\n$x$\n\n$$\nx=1\n$$\n\n| a |\n| --- |\n| b |';
    const state = parsedState(EditorState.create({ doc: source, extensions: [documentPreviewField, ...createEditorExtensions(() => {})] }));
    expect(state.field(documentPreviewField).size).toBe(3);
    expect(state.doc.toString()).toBe(source);
    const composing = state.update({ effects: composingEffect.of(true) }).state;
    expect(composing.field(documentPreviewField)).toBe(state.field(documentPreviewField));
    const typed = composing.update({ changes: { from: 0, insert: '中文' } }).state;
    expect(typed.field(documentPreviewField).size).toBe(3);
    expect(typed.update({ effects: composingEffect.of(false) }).state.field(documentPreviewField).size).toBe(3);
    const off = EditorState.create({ doc: source, extensions: [previewEnvironment.of({ features: { ...DEFAULT_DOCUMENT_FEATURES, mathPreview: false, tablePreview: false }, resolveImage: async () => ({ url: '', mime: '' }), jump: () => {} }), documentPreviewField, ...createEditorExtensions(() => {})] });
    expect(off.field(documentPreviewField).size).toBe(0);
    expect(off.doc.toString()).toBe(source);
  });
  it('maps asynchronous image insertion bookmarks and supports one-step undo/redo', () => {
    let state = EditorState.create({ doc: '正文', extensions: [imageInsertionField, ...createEditorExtensions(() => {})] });
    state = state.update({ effects: imageInsertionEffect.of({ id: 'drop', position: 2 }) }).state;
    state = state.update({ changes: { from: 0, insert: '新' } }).state;
    const transaction = imageInsertionTransaction(state, 'drop', [{ alt: '图[1]', destination: '论文.assets/a b.png' }, { alt: '图2', destination: '论文.assets/c.svg' }])!;
    state = state.update(transaction).state;
    expect(state.doc.toString()).toContain('![图\\[1\\]]');
    const target = { get state() { return state; }, dispatch: (tr: import('@codemirror/state').Transaction) => { state = tr.state; } };
    expect(undo(target)).toBe(true); expect(state.doc.toString()).toBe('新正文');
    expect(redo(target)).toBe(true); expect(state.doc.toString()).toContain('![图2]');
    expect(imageInsertionTransaction(EditorState.create({ extensions: imageInsertionField }), 'drop', [])).toBeNull();
  });
  it('uses Chinese menu labels and keeps semantic roles/shortcuts', () => {
    const menu = menuTemplate(() => {}, { ...DEFAULT_DOCUMENT_FEATURES });
    const check = (items: typeof menu) => { for (const item of items) { if (item.label) expect(item.label).toMatch(/[\u4e00-\u9fff]/); if (Array.isArray(item.submenu)) check(item.submenu); } }; check(menu);
    expect(chinesePhrases.Find).toBe('查找'); expect(chinesePhrases['replace all']).toBe('全部替换');
    expect(userError(new Error("Error invoking remote method: ENOENT"))).toMatch(/[\u4e00-\u9fff]/);
  });
  it('keeps source, saved snapshot and history unchanged when presentation changes', () => {
    const source = '# 标题 {#sec:x}\n\n$x$ [@sec:x]', preferences = new Compartment();
    let state = EditorState.create({ doc: source, extensions: [preferences.of([]), documentPreviewField, ...createEditorExtensions(() => {})] });
    const saved = new SavedDocumentTracker(state.doc);
    state = state.update({ changes: { from: state.doc.length, insert: '新增' } }).state;
    const written = state.doc;
    state = state.update({ effects: preferences.reconfigure(previewEnvironment.of({ features: { ...DEFAULT_DOCUMENT_FEATURES, mathPreview: false, referencePreview: false }, resolveImage: async () => ({ url: '', mime: '' }), jump: () => {} })) }).state;
    expect(state.doc).toBe(written); expect(saved.isDirty(state.doc)).toBe(true);
    const target = { get state() { return state; }, dispatch: (tr: import('@codemirror/state').Transaction) => { state = tr.state; } };
    expect(undo(target)).toBe(true); expect(state.doc.toString()).toBe(source); expect(saved.isDirty(state.doc)).toBe(false);
    expect(redo(target)).toBe(true); expect(state.doc).toEqual(written);
  });
});
describe('model-based export contract', () => {
  it('passes a complete semantic snapshot and resources to an adapter without reading DOM', async () => {
    const model = modelFor('# Heading\n\n$x$');
    const adapter: ExportAdapter = { format: 'pdf', async export(request) { expect(request.model).toBe(model); expect(request.appearance.fontSize).toBe(16); const file = await request.resources.read('x.png', request.signal); return { bytes: file.bytes, mime: 'application/pdf', diagnostics: [] }; } };
    const result = await exportDocument(adapter, { model, appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: async () => ({ bytes: new Uint8Array([1,2]), mime: 'image/png' }) } }, { documentId: model.documentId, revision: 0 });
    expect(result.bytes).toEqual(new Uint8Array([1,2]));
  });
  it('rejects incomplete/stale models and cancellation', async () => {
    const adapter: ExportAdapter = { format: 'docx', export: async () => ({ bytes: new Uint8Array(), mime: '', diagnostics: [] }) };
    const request = { model: modelFor('body'), appearance: DEFAULT_WRITING_APPEARANCE, resources: { read: async () => ({ bytes: new Uint8Array(), mime: '' }) }, signal: new AbortController().signal };
    await expect(exportDocument(adapter, { ...request, model: { ...request.model, complete: false } }, { documentId: request.model.documentId, revision: 0 })).rejects.toThrow('尚未完成');
    await expect(exportDocument(adapter, request, { documentId: request.model.documentId, revision: 1 })).rejects.toThrow('尚未完成');
    const controller = new AbortController(); controller.abort(); await expect(exportDocument(adapter, { ...request, signal: controller.signal }, { documentId: request.model.documentId, revision: 0 })).rejects.toThrow();
  });
  it('rejects a different document even if its revision is identical', async () => {
    const model = modelFor('one'), other = modelFor('two');
    const adapter: ExportAdapter = { format: 'pdf', export: async () => { throw new Error('must not run'); } };
    await expect(exportDocument(adapter, { model, appearance: DEFAULT_WRITING_APPEARANCE, resources: { read: async () => ({ bytes: new Uint8Array(), mime: '' }) }, signal: new AbortController().signal }, other)).rejects.toThrow('版本已改变');
  });
  it('discards an output when cancellation arrives during adapter work', async () => {
    const model = modelFor('body'), controller = new AbortController();
    const adapter: ExportAdapter = { format: 'docx', async export() { controller.abort(); return { bytes: new Uint8Array([1]), mime: '', diagnostics: [] }; } };
    await expect(exportDocument(adapter, { model, appearance: DEFAULT_WRITING_APPEARANCE, resources: { read: async () => ({ bytes: new Uint8Array(), mime: '' }) }, signal: controller.signal }, model)).rejects.toThrow();
  });
});


