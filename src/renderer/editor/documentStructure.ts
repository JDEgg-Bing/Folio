import { StateField, StateEffect } from '@codemirror/state';
import { forceParsing, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { DocumentStructureService } from '../../document/DocumentStructureService';
import type { DocumentModel } from '../../document/model';
import { StructureParsingScheduler } from './StructureParsingScheduler';

const serviceField = StateField.define<DocumentStructureService>({ create: () => new DocumentStructureService(), update: value => value });
export const structureField = StateField.define<DocumentModel>({
  create: state => state.field(serviceField).build({ length: state.doc.length, read: (from, to) => state.doc.sliceString(from, to) }, syntaxTree(state), 0, syntaxTreeAvailable(state)),
  update: (previous, transaction) => {
    if (!transaction.docChanged && syntaxTree(transaction.startState) === syntaxTree(transaction.state)) return previous;
    return transaction.state.field(serviceField).build({ length: transaction.state.doc.length, read: (from, to) => transaction.state.doc.sliceString(from, to) }, syntaxTree(transaction.state), previous.revision + (transaction.docChanged ? 1 : 0), syntaxTreeAvailable(transaction.state));
  }
});
export const composingEffect = StateEffect.define<boolean>();
export const composingField = StateField.define<boolean>({ create: () => false, update: (value, transaction) => transaction.effects.reduce((result, effect) => effect.is(composingEffect) ? effect.value : result, value) });
export const documentStructure = [serviceField, structureField, composingField, ViewPlugin.fromClass(class {
  private readonly scheduler: StructureParsingScheduler;
  constructor(view: EditorView) {
    this.scheduler = new StructureParsingScheduler(() => syntaxTreeAvailable(view.state), () => {
      forceParsing(view, Math.min(view.state.doc.length, syntaxTree(view.state).length + 10000), 5);
    });
  }
  update() { this.scheduler.schedule(); }
  destroy() { this.scheduler.destroy(); }
})];
