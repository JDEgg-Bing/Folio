import { Compartment, type Extension } from '@codemirror/state';
import type { DocumentModel } from '../../document/model';
import type { PlatformService } from '../platform/PlatformService';
import type { DocumentFeatures } from '../preferences/DocumentFeatures';
import { structureField, composingEffect } from './documentStructure';
import { previewEnvironment, documentPreviewField } from './extensions/documentPreview';
import { imageInsertionField, imageInsertionEffect, imageInsertionTransaction } from './imageInsertion';
import { EditorState, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { createEditorExtensions } from './createEditorState';
import { documentTitleField } from '../document/DocumentTitle';
import { wordCountField } from './wordCount';
import { navigationBottomPadding, NAVIGATION_TOP_MARGIN } from './navigationLayout';
import { ReadingTracker } from './ReadingTracker';

export interface EditorSnapshot { line: number; column: number; dirty: boolean; headingTitle: string | null; wordCount: number }
export interface SaveSnapshot { doc: Text; text: string }
export class SavedDocumentTracker {
  constructor(private savedDoc: Text | null) {}

  captureSaveSnapshot(currentDoc: Text): SaveSnapshot {
    return { doc: currentDoc, text: currentDoc.toString() };
  }

  markSaved(snapshotDoc: Text): void { this.savedDoc = snapshotDoc; }
  markUnsaved(): void { this.savedDoc = null; }
  isDirty(currentDoc: Text): boolean { return this.savedDoc === null || !currentDoc.eq(this.savedDoc); }
}

export interface EditorController {
  loadDocument(text: string): void;
  restoreDocument(text: string): void;
  createEmptyDocument(): void;
  getDocumentText(): string;
  getDocument(): Text;
  captureSaveSnapshot(): SaveSnapshot;
  getSnapshot(): EditorSnapshot;
  focus(): void;
  openSearch(): void;
  markSaved(savedDoc: Text): void;
  isDirty(): boolean;
  getStructure(): DocumentModel;
  jump(position: number): void;
  configurePresentation(features: DocumentFeatures, platform: PlatformService, handle: string | null): void;
  beginImageInsertion(x: number, y: number): string;
  finishImageInsertion(id: string, images: { destination: string; alt: string }[]): void;
  cancelImageInsertion(id: string): void;
  destroy(): void;
}

export function createEditorController(parent: HTMLElement, onUpdate: (snapshot: EditorSnapshot) => void, onStructure: (model: DocumentModel) => void = () => {}, onReading: (position: number) => void = () => {}): EditorController {
  let view: EditorView;
  const initialDoc = EditorState.create({ doc: '' }).doc;
  const saved = new SavedDocumentTracker(initialDoc);
  const presentation = new Compartment();
  let appearanceExtension: Extension = [];
  let destroyed = false;
  let updateReading = () => {};
  const coveredTop = (editor: EditorView) => parseFloat(getComputedStyle(editor.dom).getPropertyValue('--editor-top-inset')) || 0;
  const extensions = [imageInsertionField, documentPreviewField, EditorView.scrollMargins.of(editor => ({ top: coveredTop(editor) })), EditorView.contentAttributes.of({ 'aria-label': '文档正文' }), EditorView.updateListener.of(update => { if (update.geometryChanged || update.viewportChanged) updateReading(); }), ...createEditorExtensions((snapshot) => {
    if (view) onStructure(view.state.field(structureField));
    onUpdate({ ...snapshot, dirty: view ? saved.isDirty(view.state.doc) : false });
  })];
  const configuredState = EditorState.create({ doc: initialDoc, extensions: [presentation.of(appearanceExtension), extensions] });
  view = new EditorView({ state: configuredState, parent });

  let ordinaryBottomPadding = 0;
  const tracker = new ReadingTracker();
  const clearNavigationSpace = () => { view.contentDOM.style.paddingBottom = ''; ordinaryBottomPadding = 0; };
  const jump = (position: number) => {
    const anchor = Math.min(view.state.doc.length, Math.max(0, position));
    onReading(tracker.jump(anchor));
    view.dispatch({ selection: { anchor } }); view.focus();
    const targetDoc = view.state.doc;
    // Measure after source/preview widgets settle, then reserve just enough tail
    // space for this target. No blank source lines or permanent viewport of air.
    view.requestMeasure({
      key: jump,
      read: () => {
        if (view.state.doc !== targetDoc) return null;
        const padding = parseFloat(getComputedStyle(view.contentDOM).paddingBottom) || 0;
        if (!ordinaryBottomPadding) ordinaryBottomPadding = padding;
        const remaining = view.contentHeight - padding - view.lineBlockAt(anchor).top;
        return navigationBottomPadding(view.scrollDOM.clientHeight - coveredTop(view), remaining, ordinaryBottomPadding);
      },
      write: padding => {
        if (padding === null || view.state.doc !== targetDoc) return;
        view.contentDOM.style.paddingBottom = `${padding}px`;
        // Dispatch outside CodeMirror's measurement write phase.
        queueMicrotask(() => {
          if (!destroyed && view.state.doc === targetDoc) view.dispatch({ effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: NAVIGATION_TOP_MARGIN }) });
        });
      }
    });
  };
  let frame: number | null = null;
  const reading = () => { if (frame !== null) return; frame = requestAnimationFrame(() => { frame = null; if (!destroyed) onReading(tracker.position(view.lineBlockAtHeight(Math.max(0, view.scrollDOM.getBoundingClientRect().top + coveredTop(view) + NAVIGATION_TOP_MARGIN - view.documentTop)).from)); }); };
  updateReading = reading;
  const onScroll = () => {
    const padding = parseFloat(view.contentDOM.style.paddingBottom) || 0;
    if (padding > ordinaryBottomPadding && view.scrollDOM.scrollTop <= view.scrollDOM.scrollHeight - padding + ordinaryBottomPadding - view.scrollDOM.clientHeight) clearNavigationSpace();
    reading();
  };
  view.scrollDOM.addEventListener('scroll', onScroll);
  const userMoved = () => { tracker.userMoved(); reading(); };
  const navigationKey = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) userMoved(); };
  view.scrollDOM.addEventListener('wheel', userMoved, { passive: true });
  view.scrollDOM.addEventListener('touchstart', userMoved, { passive: true });
  view.scrollDOM.addEventListener('pointerdown', userMoved);
  view.dom.addEventListener('keydown', navigationKey);
  const compositionStart = () => queueMicrotask(() => { if (!destroyed) view.dispatch({ effects: composingEffect.of(true) }); });
  const compositionEnd = () => queueMicrotask(() => { if (!destroyed) view.dispatch({ effects: composingEffect.of(false) }); });
  view.dom.addEventListener('compositionstart', compositionStart); view.dom.addEventListener('compositionend', compositionEnd);
  const snapshot = (): EditorSnapshot => {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1, dirty: saved.isDirty(view.state.doc), headingTitle: view.state.field(documentTitleField).title, wordCount: view.state.field(wordCountField) };
  };
  const loadDocument = (text: string) => {
    clearNavigationSpace();
    tracker.userMoved();
    view.setState(EditorState.create({ doc: text, extensions: [presentation.of(appearanceExtension), extensions] }));
    saved.markSaved(view.state.doc);
    onStructure(view.state.field(structureField)); onUpdate(snapshot()); reading();
  };
  return {
    loadDocument,
    restoreDocument: text => { loadDocument(text); saved.markUnsaved(); onUpdate(snapshot()); },
    createEmptyDocument: () => loadDocument(''),
    getDocumentText: () => view.state.doc.toString(),
    getDocument: () => view.state.doc,
    captureSaveSnapshot: () => saved.captureSaveSnapshot(view.state.doc),
    getSnapshot: snapshot,
    focus: () => view.focus(),
    openSearch: () => { view.focus(); openSearchPanel(view); },
    markSaved: (doc) => { saved.markSaved(doc); onUpdate(snapshot()); },
    isDirty: () => saved.isDirty(view.state.doc),
    getStructure: () => view.state.field(structureField), jump,
    configurePresentation: (features, platform, handle) => {
      const cache = new Map<string, Promise<{ url: string; mime: string }>>();
      appearanceExtension = previewEnvironment.of({ features, jump, resolveImage: destination => {
        if (!cache.has(destination)) cache.set(destination, platform.resolveImage(handle, destination)); return cache.get(destination)!;
      } });
      view.dispatch({ effects: presentation.reconfigure(appearanceExtension) });
    },
    beginImageInsertion: (x, y) => { const id = crypto.randomUUID(); view.dispatch({ effects: imageInsertionEffect.of({ id, position: view.posAtCoords({ x, y }) ?? view.state.selection.main.head }) }); return id; },
    finishImageInsertion: (id, images) => { const transaction = imageInsertionTransaction(view.state, id, images); if (transaction) view.dispatch(transaction); },
    cancelImageInsertion: id => view.dispatch({ effects: imageInsertionEffect.of({ id, position: null }) }),
    destroy: () => { destroyed = true; if (frame !== null) cancelAnimationFrame(frame); view.scrollDOM.removeEventListener('scroll', onScroll); view.scrollDOM.removeEventListener('wheel', userMoved); view.scrollDOM.removeEventListener('touchstart', userMoved); view.scrollDOM.removeEventListener('pointerdown', userMoved); view.dom.removeEventListener('keydown', navigationKey); view.destroy(); }
  };
}
